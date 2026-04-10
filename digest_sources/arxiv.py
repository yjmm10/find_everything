import importlib.util
import os
from urllib.parse import quote

import feedparser
import requests

from digest_sources.base import DigestSource, FetchContext
from digest_sources.config_helpers import source_keyword_groups
from digest_sources.date_range import DigestDateWindow, resolve_source_date_window
from digest_sources.keyword_expr import (
    keyword_expr_to_arxiv_all_fragment,
    parse_keyword_expression,
)
from digest_sources.util import http_session, log, progress

# fetch() 返回的分组块（多组关键词各占一块，不做跨组合并去重）
ARXIV_GROUP_KEY = "arxiv_keyword_group"
ARXIV_PAPERS_KEY = "arxiv_papers"

# arXiv API 单次查询 max_results 上限；max_results: -1 时表示「尽量多取」
_ARXIV_API_MAX_RESULTS = 30000


def _arxiv_max_results(raw) -> int:
    n = int(raw)
    if n < 0:
        return _ARXIV_API_MAX_RESULTS
    return min(max(1, n), _ARXIV_API_MAX_RESULTS)


def _arxiv_submitted_date_inner(date_range: str) -> str:
    """
    arXiv 检索式 submittedDate:[start TO end] 要求 TO 两侧有空格（与官方 API 手册一致）。
    旧版若生成「202601010000TO202601072359」会导致 export.arxiv.org 返回 HTTP 500。
    """
    s = (date_range or "").strip()
    if " TO " in s:
        return s
    if "TO" in s:
        left, _, right = s.partition("TO")
        if left.strip() and right.strip():
            return f"{left.strip()} TO {right.strip()}"
    return s


def _arxiv_all_field_query(kw: str) -> str:
    """关键词布尔式 → arXiv `all:` 片段（见 digest_sources.keyword_expr）。"""
    t = (kw or "").strip()
    if not t:
        return ""
    frag = keyword_expr_to_arxiv_all_fragment(parse_keyword_expression(t))
    if not frag:
        return f"all:({t})"
    return frag


def _preferred_backend(arxiv_cfg: dict) -> str:
    b = str(arxiv_cfg.get("backend", "api")).strip().lower()
    if b in ("library", "pkg", "arxiv", "python"):
        return "library"
    return "api"


def _fallback_order(arxiv_cfg: dict) -> tuple[str, str]:
    """返回 (首选, 备用)，两者互为备份。"""
    p = _preferred_backend(arxiv_cfg)
    return (p, "api" if p == "library" else "library")


def _log_arxiv_network_error(backend_label: str, err: BaseException) -> None:
    """对网络/请求相关错误输出可操作的日志。"""
    msg = f"⚠️ [Arxiv/{backend_label}] 获取失败: {type(err).__name__}: {err}"
    if isinstance(err, requests.Timeout):
        log(f"{msg}（连接或读取超时，可检查网络或调大 ARXIV_CONNECT_TIMEOUT / ARXIV_READ_TIMEOUT）")
    elif isinstance(err, requests.ConnectionError):
        log(f"{msg}（无法建立连接：DNS、代理、防火墙或对端不可达）")
    elif isinstance(err, requests.HTTPError) and err.response is not None:
        log(f"{msg}（HTTP {err.response.status_code} {err.response.reason}）")
    elif isinstance(err, requests.RequestException):
        log(msg)
    else:
        log(msg)


def _entry_ok(item: dict) -> bool:
    t = (item.get("title") or "").strip()
    u = (item.get("link") or "").strip()
    if not t or not u:
        return False
    u_low = u.lower()
    return "arxiv.org" in u_low or "arxiv" in u_low


def _sanitize_results(raw: list) -> list:
    if not raw:
        return []
    out = [x for x in raw if isinstance(x, dict) and _entry_ok(x)]
    return out


def _fetch_arxiv_api(
    ctx: FetchContext,
    arxiv_cfg: dict,
    kw: str,
    *,
    submitted_inner: str | None = None,
) -> list:
    """仅官方 HTTP + feedparser；失败抛异常。"""
    inner = submitted_inner if submitted_inner is not None else ctx.date_range
    dr = _arxiv_submitted_date_inner(inner)
    qkw = _arxiv_all_field_query(kw)
    query = f"{qkw} AND submittedDate:[{dr}]"
    sort_by = arxiv_cfg.get("sort_by", "submittedDate")
    sort_order = arxiv_cfg.get("sort_order", "descending")
    max_results = _arxiv_max_results(arxiv_cfg.get("max_results", 8))
    url = (
        f"https://export.arxiv.org/api/query?search_query={quote(query)}"
        f"&sortBy={quote(sort_by)}&sortOrder={quote(sort_order)}&max_results={max_results}"
    )
    connect_s = float(os.getenv("ARXIV_CONNECT_TIMEOUT", "20"))
    read_s = float(os.getenv("ARXIV_READ_TIMEOUT", "120"))
    resp = http_session().get(url, timeout=(connect_s, read_s))
    resp.raise_for_status()
    log("📥 [Arxiv/api] 官方 API 响应已收到，正在解析 Atom…")
    feed = feedparser.parse(resp.content)
    if getattr(feed, "bozo", False) and not feed.entries:
        be = getattr(feed, "bozo_exception", None)
        raise ValueError(f"Atom 解析失败且无条目（bozo_exception={be!r}）")
    results = []
    for entry in progress(feed.entries, desc="Arxiv 解析", unit="条"):
        authors = getattr(entry, "authors", None) or []
        auth_s = ", ".join(getattr(a, "name", str(a)) for a in authors[:3])
        summ = getattr(entry, "summary", "") or ""
        results.append({
            "title": entry.title,
            "link": entry.link,
            "authors": auth_s,
            "summary": summ.replace("\n", " ")[:150] + ("..." if len(summ) > 150 else ""),
        })
    return results


def _map_sort_criterion(arxiv_mod, name: str):
    key = (name or "submittedDate").replace("_", "").lower()
    mapping = {
        "submitteddate": arxiv_mod.SortCriterion.SubmittedDate,
        "lastupdateddate": arxiv_mod.SortCriterion.LastUpdatedDate,
        "relevance": arxiv_mod.SortCriterion.Relevance,
    }
    return mapping.get(key, arxiv_mod.SortCriterion.SubmittedDate)


def _map_sort_order(arxiv_mod, name: str):
    n = (name or "descending").lower()
    if n == "ascending":
        return arxiv_mod.SortOrder.Ascending
    return arxiv_mod.SortOrder.Descending


def _fetch_arxiv_library(
    ctx: FetchContext,
    arxiv_cfg: dict,
    kw: str,
    *,
    submitted_inner: str | None = None,
) -> list:
    """arxiv 库；未安装或失败抛异常（ImportError / 其它）。"""
    import arxiv as arxiv_mod

    inner = submitted_inner if submitted_inner is not None else ctx.date_range
    dr = _arxiv_submitted_date_inner(inner)
    qkw = _arxiv_all_field_query(kw)
    query = f"{qkw} AND submittedDate:[{dr}]"
    max_results = _arxiv_max_results(arxiv_cfg.get("max_results", 8))
    search = arxiv_mod.Search(
        query=query,
        max_results=max_results,
        sort_by=_map_sort_criterion(arxiv_mod, arxiv_cfg.get("sort_by", "submittedDate")),
        sort_order=_map_sort_order(arxiv_mod, arxiv_cfg.get("sort_order", "descending")),
    )
    delay = float(arxiv_cfg.get("library_delay_seconds", 3.0))
    page_size = int(arxiv_cfg.get("library_page_size", 100))
    retries = int(arxiv_cfg.get("library_num_retries", 3))
    client = arxiv_mod.Client(
        page_size=min(page_size, 2000),
        delay_seconds=delay,
        num_retries=retries,
    )
    log("📥 [Arxiv/library] 使用 arxiv 库请求官方 API（分页/限速）…")
    results = []
    for r in progress(client.results(search), desc="Arxiv 解析", unit="条"):
        authors = ", ".join(a.name for a in r.authors[:3]) if r.authors else ""
        summary = (r.summary or "").replace("\n", " ")
        if len(summary) > 150:
            summary = summary[:150] + "..."
        results.append({
            "title": (r.title or "").replace("\n", " ").strip(),
            "link": r.entry_id,
            "authors": authors,
            "summary": summary if summary else "...",
        })
    return results


def _run_backend(
    name: str,
    ctx: FetchContext,
    arxiv_cfg: dict,
    kw: str,
    *,
    submitted_inner: str | None = None,
) -> list:
    if name == "library":
        return _fetch_arxiv_library(ctx, arxiv_cfg, kw, submitted_inner=submitted_inner)
    return _fetch_arxiv_api(ctx, arxiv_cfg, kw, submitted_inner=submitted_inner)


def _is_grouped_arxiv_blocks(items: list) -> bool:
    return (
        bool(items)
        and isinstance(items[0], dict)
        and ARXIV_GROUP_KEY in items[0]
        and ARXIV_PAPERS_KEY in items[0]
    )


def _apply_max_results_total(blocks: list[dict], cap_raw) -> list[dict]:
    """按组顺序累计，截断总条数；cap_raw 为 None 不截断；-1 不截断。"""
    if cap_raw is None:
        return blocks
    cap = int(cap_raw)
    if cap < 0:
        return blocks
    out: list[dict] = []
    used = 0
    for blk in blocks:
        if used >= cap:
            break
        papers = list(blk.get(ARXIV_PAPERS_KEY) or [])
        room = cap - used
        slice_p = papers[:room]
        out.append({**blk, ARXIV_PAPERS_KEY: slice_p})
        used += len(slice_p)
    return out


def _fetch_arxiv_with_fallback(
    ctx: FetchContext,
    arxiv_cfg: dict,
    kw: str,
    *,
    submitted_inner: str | None = None,
) -> list:
    """单组关键词：双后端回退，语义与原先单次 fetch 一致。"""
    first, second = _fallback_order(arxiv_cfg)
    for i, backend_name in enumerate((first, second)):
        role = "首选" if i == 0 else "备用"
        if backend_name == "library" and importlib.util.find_spec("arxiv") is None:
            log(f"⚠️ [Arxiv/{role}] arxiv 库未安装，跳过 library（pip install arxiv）")
            continue

        try:
            raw = _run_backend(
                backend_name, ctx, arxiv_cfg, kw, submitted_inner=submitted_inner
            )
        except requests.RequestException as e:
            _log_arxiv_network_error(backend_name, e)
            continue
        except Exception as e:
            _log_arxiv_network_error(backend_name, e)
            continue

        cleaned, bad_reason = _usable_results(raw)
        if bad_reason:
            log(f"⚠️ [Arxiv/{backend_name}] {role} 结果不可用: {bad_reason}，尝试另一路…")
            continue

        if cleaned:
            log(f"✅ [Arxiv] 由 {backend_name}（{role}）取得 {len(cleaned)} 条有效条目")
            return cleaned

        log(
            f"ℹ️ [Arxiv/{backend_name}] {role} 返回 0 条（检索窗口内可能无匹配），"
            "不再为「空结果」切换备用"
        )
        return []

    log("❌ [Arxiv] 两路均失败或不可用，本组关键词无数据")
    return []


def _usable_results(raw: list) -> tuple[list, str | None]:
    """
    校验并清洗结果。
    返回 (清洗后列表, 若需备用则说明原因；None 表示本路结果可用)。
    """
    if raw is None:
        return [], "返回值为 None"
    if not isinstance(raw, list):
        return [], f"返回类型异常: {type(raw)!r}"
    cleaned = _sanitize_results(raw)
    if len(raw) == 0:
        return [], None
    if len(cleaned) == 0:
        return [], f"共 {len(raw)} 条但标题/链接均无效，疑似解析异常"
    if len(cleaned) < len(raw):
        log(f"ℹ️ [Arxiv] 丢弃 {len(raw) - len(cleaned)} 条缺少标题或有效链接的条目")
    return cleaned, None


class ArxivSource(DigestSource):
    section_key = "arxiv"
    label = "Arxiv"
    prompt_header = "Arxiv"

    def format_for_prompt(self, items: list) -> str:
        if not items:
            return "(无)"
        if _is_grouped_arxiv_blocks(items):
            parts: list[str] = []
            for blk in items:
                label = blk.get(ARXIV_GROUP_KEY, "")
                papers = blk.get(ARXIV_PAPERS_KEY) or []
                parts.append(f"关键词组「{label}」（{len(papers)} 条）:\n{repr(papers)}")
            return "\n\n".join(parts)
        return str(items)

    def fetch(self, ctx: FetchContext) -> list:
        arxiv_cfg = self.section(ctx)
        if not isinstance(arxiv_cfg, dict) or not arxiv_cfg.get("enabled", True):
            log("⏭️ Arxiv 已在配置中关闭，跳过")
            return []

        groups = source_keyword_groups(arxiv_cfg, ctx.global_keywords)
        groups = [g for g in groups if g.strip()]
        if not groups:
            log("⏭️ Arxiv 无有效关键词组，跳过")
            return []

        fb = DigestDateWindow(
            start_date=ctx.start_date,
            end_date=ctx.end_date,
            arxiv_submitted_inner=ctx.date_range,
            mode=ctx.date_range_mode,
        )
        win = resolve_source_date_window(arxiv_cfg, fb)
        if (
            win.arxiv_submitted_inner != fb.arxiv_submitted_inner
            or win.start_date != fb.start_date
            or win.end_date != fb.end_date
        ):
            log(
                f"ℹ️ [Arxiv] 本源 date_range: {win.start_date} ~ {win.end_date}（{win.mode}），"
                "覆盖全局窗口"
            )

        first, second = _fallback_order(arxiv_cfg)
        log(
            f"🔍 Fetching Arxiv，共 {len(groups)} 组关键词（首选 {first}，备用 {second}）…"
        )

        blocks: list[dict] = []
        for gi, kw in enumerate(groups, 1):
            log(f"🔎 [Arxiv] 第 {gi}/{len(groups)} 组: {kw!r}")
            part = _fetch_arxiv_with_fallback(
                ctx, arxiv_cfg, kw, submitted_inner=win.arxiv_submitted_inner
            )
            blocks.append({ARXIV_GROUP_KEY: kw, ARXIV_PAPERS_KEY: part})

        total_uncapped = sum(len(b.get(ARXIV_PAPERS_KEY) or []) for b in blocks)
        cap_raw = arxiv_cfg.get("max_results_total")
        blocks = _apply_max_results_total(blocks, cap_raw)
        total = sum(len(b.get(ARXIV_PAPERS_KEY) or []) for b in blocks)
        if cap_raw is not None and int(cap_raw) >= 0 and total < total_uncapped:
            log(
                f"ℹ️ [Arxiv] max_results_total={int(cap_raw)}，按组顺序从 "
                f"{total_uncapped} 条截为 {total} 条"
            )
        if total > 0:
            if len(groups) > 1:
                log(
                    f"✅ [Arxiv] 共 {len(groups)} 组关键词，合计 {total} 条（分组保留，跨组不去重）"
                )
        elif len(groups) > 1:
            log("❌ [Arxiv] 所有关键词组均无有效数据")
        return blocks
