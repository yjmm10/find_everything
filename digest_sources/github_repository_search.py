"""
GitHub 官方 Search API（search/repositories）：在**全站公开仓库**索引内，
按配置关键词 + 时间条件（默认 pushed:起止日）检索，**不是** Trending 周榜/日榜 RSS，
也与「榜单上有谁」无关，仅反映搜索条件命中的仓库。
"""

from digest_sources.base import DigestSource, FetchContext
from digest_sources.config_helpers import source_keyword_groups
from digest_sources.date_range import DigestDateWindow, resolve_source_date_window
from digest_sources.github_common import github_api_headers
from digest_sources.keyword_expr import (
    keyword_expr_to_github_repository_q,
    parse_keyword_expression,
)
from digest_sources.util import http_session, log, progress


def _github_search_sort(gh_cfg: dict) -> str:
    s = (gh_cfg.get("search_sort") or "stars").strip().lower()
    if s in ("stars", "forks", "help-wanted-issues", "updated"):
        return s
    return "stars"


def _github_search_qualifiers(gh_cfg: dict, win: DigestDateWindow) -> str:
    bits = []
    if gh_cfg.get("search_restrict_pushed", True):
        lo = (win.start_date or "").strip()
        hi = (win.end_date or "").strip()
        if lo and hi:
            bits.append(f"pushed:{lo}..{hi}")
    lang = (gh_cfg.get("language") or "").strip()
    if lang and lang.lower() != "all":
        bits.append(f"language:{lang}")
    extra = (gh_cfg.get("search_query_extra") or "").strip()
    if extra:
        bits.append(extra)
    return " ".join(bits)


def _search_repositories_page(session, gh_cfg: dict, q: str, page: int, per_page: int) -> dict | None:
    api_timeout = float(gh_cfg.get("api_timeout", 20))
    params = {
        "q": q,
        "sort": _github_search_sort(gh_cfg),
        "order": (gh_cfg.get("search_order") or "desc").strip().lower(),
        "per_page": per_page,
        "page": page,
    }
    url = "https://api.github.com/search/repositories"
    r = session.get(url, headers=github_api_headers(gh_cfg), params=params, timeout=api_timeout)
    if r.status_code != 200:
        log(f"⚠️ [GitHub Search] HTTP {r.status_code}: {r.text[:300]}")
        return None
    return r.json()


def _fetch_github_search(
    gh_cfg: dict,
    ctx: FetchContext,
    win: DigestDateWindow,
    max_repos: int,
) -> list:
    groups = source_keyword_groups(gh_cfg, ctx.global_keywords)
    non_empty = [(g or "").strip() for g in groups if (g or "").strip()]
    if not non_empty:
        log("⏭️ [GitHub 检索] 未配置有效 keywords（块内与全局均为空），跳过")
        return []
    session = http_session()
    seen: set[str] = set()
    results: list = []
    per_page = min(max(max_repos, 1), 100)
    for group in non_empty:
        if len(results) >= max_repos:
            break
        ex = parse_keyword_expression(group)
        core = keyword_expr_to_github_repository_q(ex)
        if not core:
            continue
        qual = _github_search_qualifiers(gh_cfg, win)
        q = f"{core} {qual}".strip()
        log(
            f"📥 [GitHub 检索] 窗口 {win.start_date}~{win.end_date}；"
            f"q={q!r}（api.github.com/search/repositories）"
        )
        page = 1
        while len(results) < max_repos and page <= 10:
            need = max_repos - len(results)
            page_size = min(per_page, max(need, 1))
            data = _search_repositories_page(session, gh_cfg, q, page, page_size)
            if not data:
                break
            items = data.get("items") or []
            if not items:
                break
            for it in items:
                fn = (it.get("full_name") or "").strip()
                if not fn or fn in seen:
                    continue
                seen.add(fn)
                desc = it.get("description")
                if isinstance(desc, str):
                    desc = desc.strip() or "No description"
                else:
                    desc = "No description"
                results.append({
                    "repo": fn,
                    "desc": desc,
                    "link": (it.get("html_url") or f"https://github.com/{fn}").strip(),
                    "stars": it.get("stargazers_count"),
                    "forks": it.get("forks_count"),
                    "language": it.get("language"),
                })
                if len(results) >= max_repos:
                    break
            if len(results) >= max_repos:
                break
            page += 1
    return results[:max_repos]


class GithubRepositorySearchSource(DigestSource):
    section_key = "github_repository_search"
    label = "GitHub 仓库检索"
    prompt_header = "GitHub 指定日期检索"

    def fetch(self, ctx: FetchContext) -> list:
        gh_cfg = self.section(ctx)
        if not isinstance(gh_cfg, dict) or not gh_cfg.get("enabled", True):
            log("⏭️ GitHub 仓库检索已在配置中关闭，跳过")
            return []
        log("🔍 [GitHub 检索] 官方 search/repositories：全站仓库范围，非 Trending 榜单")
        fb = DigestDateWindow(
            start_date=ctx.start_date,
            end_date=ctx.end_date,
            arxiv_submitted_inner=ctx.date_range,
            mode=ctx.date_range_mode,
        )
        win = resolve_source_date_window(gh_cfg, fb)
        max_repos = int(gh_cfg.get("max_repos", 8))
        results = _fetch_github_search(gh_cfg, ctx, win, max_repos)
        log(f"✅ [GitHub 检索] 完成，共 {len(results)} 个仓库（上限 {max_repos}）")
        return results

    def format_for_prompt(self, items: list) -> str:
        if not items:
            return "(无)"
        head = (
            "（说明：以下为 GitHub 官方仓库搜索在全站范围内的结果（关键词 + 常见为 pushed 的日期条件）；"
            "数据源为 search/repositories，**不是** Trending 周榜/日榜 RSS，二者勿混为一谈。）\n"
        )
        lines = []
        for i, it in enumerate(items, 1):
            repo = it.get("repo", "")
            desc = it.get("desc", "")
            link = it.get("link", "")
            stars = it.get("stars")
            forks = it.get("forks")
            lang = it.get("language")
            bits = []
            if stars is not None:
                bits.append(f"⭐ {stars}")
            if forks is not None:
                bits.append(f"fork {forks}")
            if lang:
                bits.append(f"🌏 {lang}")
            meta = f" [{' | '.join(bits)}]" if bits else ""
            lines.append(f"{i}. {repo}{meta}\n   简介: {desc}\n   链接: {link}")
        return head + "\n".join(lines)
