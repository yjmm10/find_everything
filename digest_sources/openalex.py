"""OpenAlex Works API 论文检索。"""

import os

import requests

from digest_sources.base import DigestSource, FetchContext
from digest_sources.config_helpers import source_keyword_groups
from digest_sources.date_range import DigestDateWindow, resolve_source_date_window
from digest_sources.keyword_expr import (
    keyword_expr_to_github_repository_q,
    parse_keyword_expression,
)
from digest_sources.paper_groups import (
    apply_max_results_total,
    format_grouped_for_prompt,
)
from digest_sources.util import http_session, log, progress

OPENALEX_GROUP_KEY = "openalex_keyword_group"
OPENALEX_PAPERS_KEY = "openalex_papers"

_OPENALEX_WORKS_URL = "https://api.openalex.org/works"


def _openalex_api_key(cfg: dict) -> str:
    return (
        (os.getenv("OPENALEX_API_KEY") or "").strip()
        or str(cfg.get("api_key") or "").strip()
    )


def _kw_to_query(kw: str) -> str:
    t = (kw or "").strip()
    if not t:
        return ""
    q = keyword_expr_to_github_repository_q(parse_keyword_expression(t))
    return q or t


def _openalex_max_results(raw) -> int:
    n = int(raw if raw is not None else 8)
    if n < 0:
        return 200
    return min(max(1, n), 200)


def _openalex_filter(win: DigestDateWindow) -> str:
    lo = (win.start_date or "").strip()
    hi = (win.end_date or "").strip()
    parts: list[str] = []
    if lo:
        parts.append(f"from_publication_date:{lo}")
    if hi:
        parts.append(f"to_publication_date:{hi}")
    return ",".join(parts)


def _reconstruct_abstract(inv: dict | None) -> str:
    """OpenAlex abstract_inverted_index：词 → 在摘要中的位置列表。"""
    if not isinstance(inv, dict) or not inv:
        return ""
    positions: dict[int, str] = {}
    for word, pos_list in inv.items():
        w = str(word).strip()
        if not w or not isinstance(pos_list, list):
            continue
        for pos in pos_list:
            try:
                positions[int(pos)] = w
            except (TypeError, ValueError):
                continue
    if not positions:
        return ""
    return " ".join(positions[i] for i in range(max(positions) + 1)).strip()


def _openalex_authors(work: dict) -> str:
    names: list[str] = []
    for a in work.get("authorships") or []:
        if not isinstance(a, dict):
            continue
        author = a.get("author") or {}
        name = (author.get("display_name") or "").strip()
        if name:
            names.append(name)
        if len(names) >= 5:
            break
    return ", ".join(names)


def _openalex_venue(work: dict) -> str:
    loc = work.get("primary_location") or {}
    if isinstance(loc, dict):
        src = loc.get("source") or {}
        if isinstance(src, dict):
            name = (src.get("display_name") or "").strip()
            if name:
                return name
    host = work.get("host_venue")
    if isinstance(host, dict):
        return (host.get("display_name") or "").strip()
    return ""


def _openalex_link(work: dict) -> str:
    for key in ("doi", "id"):
        val = work.get(key)
        if not val:
            continue
        s = str(val).strip()
        if key == "doi":
            d = s.replace("https://doi.org/", "")
            return f"https://doi.org/{d}" if d else ""
        if s.startswith("http"):
            return s
        if s.startswith("https://openalex.org/"):
            return s
    wid = (work.get("id") or "").strip()
    return wid if wid.startswith("http") else ""


def _map_openalex_work(work: dict) -> dict | None:
    title = (work.get("display_name") or work.get("title") or "").strip()
    link = _openalex_link(work)
    if not title or not link:
        return None
    summ = _reconstruct_abstract(work.get("abstract_inverted_index"))
    summ = summ.replace("\n", " ")
    if len(summ) > 150:
        summ = summ[:150] + "..."
    pd = (work.get("publication_date") or "")[:10]
    return {
        "title": title,
        "link": link,
        "authors": _openalex_authors(work),
        "summary": summ or "...",
        "published_date": pd,
        "venue": _openalex_venue(work),
        "citation_count": work.get("cited_by_count"),
    }


def _fetch_openalex_group(
    cfg: dict,
    kw: str,
    win: DigestDateWindow,
) -> list:
    query = _kw_to_query(kw)
    if not query:
        return []
    per_page = _openalex_max_results(cfg.get("max_results", 8))
    params: dict = {
        "search": query,
        "per_page": per_page,
    }
    filt = _openalex_filter(win)
    if filt:
        params["filter"] = filt
    key = _openalex_api_key(cfg)
    if key:
        params["api_key"] = key
    mailto = (os.getenv("OPENALEX_MAILTO") or cfg.get("mailto") or "").strip()
    if mailto:
        params["mailto"] = mailto
    connect_s = float(os.getenv("OPENALEX_CONNECT_TIMEOUT", "20"))
    read_s = float(os.getenv("OPENALEX_READ_TIMEOUT", "60"))
    log(
        f"🔗 [OpenAlex] search={query!r} filter={filt or '(未限定)'} per_page={per_page}"
    )
    try:
        resp = http_session().get(
            _OPENALEX_WORKS_URL,
            params=params,
            headers={"Accept": "application/json"},
            timeout=(connect_s, read_s),
        )
        resp.raise_for_status()
    except requests.RequestException as e:
        log(f"⚠️ [OpenAlex] 请求失败: {type(e).__name__}: {e}")
        return []
    data = resp.json()
    raw = data.get("results") or []
    out: list[dict] = []
    for work in progress(raw, desc="OpenAlex 解析", unit="条"):
        if not isinstance(work, dict):
            continue
        mapped = _map_openalex_work(work)
        if mapped:
            out.append(mapped)
    return out


class OpenAlexSource(DigestSource):
    section_key = "openalex"
    label = "OpenAlex"
    prompt_header = "OpenAlex"

    def format_for_prompt(self, items: list) -> str:
        return format_grouped_for_prompt(
            items, group_key=OPENALEX_GROUP_KEY, papers_key=OPENALEX_PAPERS_KEY
        )

    def fetch(self, ctx: FetchContext) -> list:
        cfg = self.section(ctx)
        if not isinstance(cfg, dict) or not cfg.get("enabled", True):
            log("⏭️ OpenAlex 已在配置中关闭，跳过")
            return []

        groups = source_keyword_groups(cfg, ctx.global_keywords)
        groups = [g for g in groups if g.strip()]
        if not groups:
            log("⏭️ OpenAlex 无有效关键词组，跳过")
            return []

        fb = DigestDateWindow(
            start_date=ctx.start_date,
            end_date=ctx.end_date,
            arxiv_submitted_inner=ctx.date_range,
            mode=ctx.date_range_mode,
        )
        win = resolve_source_date_window(cfg, fb)
        if win.start_date != fb.start_date or win.end_date != fb.end_date:
            log(
                f"ℹ️ [OpenAlex] 本源 date_range: {win.start_date} ~ {win.end_date} "
                f"（{win.mode}）"
            )

        if not _openalex_api_key(cfg):
            log(
                "ℹ️ [OpenAlex] 未设置 OPENALEX_API_KEY，使用公开限额 "
                "（可选配置 OPENALEX_MAILTO 或 api_key 提升配额）"
            )

        log(f"🔍 Fetching OpenAlex，共 {len(groups)} 组关键词…")
        blocks: list[dict] = []
        for gi, kw in enumerate(groups, 1):
            log(f"🔎 [OpenAlex] 第 {gi}/{len(groups)} 组: {kw!r}")
            part = _fetch_openalex_group(cfg, kw, win)
            blocks.append({OPENALEX_GROUP_KEY: kw, OPENALEX_PAPERS_KEY: part})

        total_uncapped = sum(len(b.get(OPENALEX_PAPERS_KEY) or []) for b in blocks)
        cap_raw = cfg.get("max_results_total")
        blocks = apply_max_results_total(
            blocks, cap_raw, papers_key=OPENALEX_PAPERS_KEY
        )
        total = sum(len(b.get(OPENALEX_PAPERS_KEY) or []) for b in blocks)
        if cap_raw is not None and int(cap_raw) >= 0 and total < total_uncapped:
            log(
                f"ℹ️ [OpenAlex] max_results_total={int(cap_raw)}，"
                f"从 {total_uncapped} 条截为 {total} 条"
            )
        if total > 0:
            log(f"✅ [OpenAlex] 合计 {total} 条")
        return blocks
