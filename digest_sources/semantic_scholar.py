"""Semantic Scholar Graph API 论文检索。"""

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

S2_GROUP_KEY = "semantic_scholar_keyword_group"
S2_PAPERS_KEY = "semantic_scholar_papers"

_S2_SEARCH_URL = "https://api.semanticscholar.org/graph/v1/paper/search"
_S2_DEFAULT_FIELDS = (
    "paperId,title,authors,abstract,publicationDate,venue,citationCount,externalIds"
)


def _s2_api_key(cfg: dict) -> str:
    return (
        (os.getenv("SEMANTIC_SCHOLAR_API_KEY") or "").strip()
        or str(cfg.get("api_key") or "").strip()
    )


def _s2_headers(cfg: dict) -> dict:
    key = _s2_api_key(cfg)
    h = {"Accept": "application/json"}
    if key:
        h["x-api-key"] = key
    return h


def _s2_max_results(raw) -> int:
    n = int(raw if raw is not None else 8)
    if n < 0:
        return 100
    return min(max(1, n), 100)


def _kw_to_query(kw: str) -> str:
    t = (kw or "").strip()
    if not t:
        return ""
    q = keyword_expr_to_github_repository_q(parse_keyword_expression(t))
    return q or t


def _s2_publication_date_filter(win: DigestDateWindow) -> str:
    """publicationDateOrYear: YYYY-MM-DD:YYYY-MM-DD"""
    lo = (win.start_date or "").strip()
    hi = (win.end_date or "").strip()
    if lo and hi:
        return f"{lo}:{hi}"
    return ""


def _s2_paper_link(paper: dict) -> str:
    ext = paper.get("externalIds") or {}
    if isinstance(ext, dict):
        for key in ("DOI", "ArXiv", "PubMed", "CorpusId"):
            val = ext.get(key)
            if val:
                if key == "DOI":
                    d = str(val).strip()
                    return f"https://doi.org/{d}" if not d.lower().startswith("http") else d
                if key == "ArXiv":
                    aid = str(val).strip().replace("arXiv:", "")
                    return f"https://arxiv.org/abs/{aid}"
    pid = (paper.get("paperId") or "").strip()
    if pid:
        return f"https://www.semanticscholar.org/paper/{pid}"
    return ""


def _map_s2_paper(paper: dict) -> dict | None:
    title = (paper.get("title") or "").strip()
    link = _s2_paper_link(paper)
    if not title or not link:
        return None
    authors = paper.get("authors") or []
    auth_s = ", ".join(
        (a.get("name") if isinstance(a, dict) else str(a))
        for a in authors[:5]
        if a
    )
    summ = (paper.get("abstract") or "").replace("\n", " ")
    if len(summ) > 150:
        summ = summ[:150] + "..."
    pd = (paper.get("publicationDate") or "")[:10]
    return {
        "title": title,
        "link": link,
        "authors": auth_s,
        "summary": summ or "...",
        "published_date": pd,
        "venue": (paper.get("venue") or "").strip(),
        "citation_count": paper.get("citationCount"),
    }


def _fetch_s2_group(
    cfg: dict,
    kw: str,
    win: DigestDateWindow,
) -> list:
    query = _kw_to_query(kw)
    if not query:
        return []
    limit = _s2_max_results(cfg.get("max_results", 8))
    params: dict = {
        "query": query,
        "limit": limit,
        "fields": str(cfg.get("fields") or _S2_DEFAULT_FIELDS),
    }
    pub_filter = _s2_publication_date_filter(win)
    if pub_filter:
        params["publicationDateOrYear"] = pub_filter
    connect_s = float(os.getenv("S2_CONNECT_TIMEOUT", "20"))
    read_s = float(os.getenv("S2_READ_TIMEOUT", "60"))
    log(
        f"🔗 [Semantic Scholar] query={query!r} "
        f"publicationDateOrYear={pub_filter or '(未限定)'} limit={limit}"
    )
    try:
        resp = http_session().get(
            _S2_SEARCH_URL,
            params=params,
            headers=_s2_headers(cfg),
            timeout=(connect_s, read_s),
        )
        resp.raise_for_status()
    except requests.RequestException as e:
        log(f"⚠️ [Semantic Scholar] 请求失败: {type(e).__name__}: {e}")
        return []
    data = resp.json()
    raw = data.get("data") or []
    out: list[dict] = []
    for paper in progress(raw, desc="Semantic Scholar 解析", unit="条"):
        if not isinstance(paper, dict):
            continue
        mapped = _map_s2_paper(paper)
        if mapped:
            out.append(mapped)
    return out


class SemanticScholarSource(DigestSource):
    section_key = "semantic_scholar"
    label = "Semantic Scholar"
    prompt_header = "Semantic Scholar"

    def format_for_prompt(self, items: list) -> str:
        return format_grouped_for_prompt(
            items, group_key=S2_GROUP_KEY, papers_key=S2_PAPERS_KEY
        )

    def fetch(self, ctx: FetchContext) -> list:
        cfg = self.section(ctx)
        if not isinstance(cfg, dict) or not cfg.get("enabled", True):
            log("⏭️ Semantic Scholar 已在配置中关闭，跳过")
            return []

        groups = source_keyword_groups(cfg, ctx.global_keywords)
        groups = [g for g in groups if g.strip()]
        if not groups:
            log("⏭️ Semantic Scholar 无有效关键词组，跳过")
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
                f"ℹ️ [Semantic Scholar] 本源 date_range: {win.start_date} ~ {win.end_date} "
                f"（{win.mode}）"
            )

        if not _s2_api_key(cfg):
            log(
                "⚠️ [Semantic Scholar] 未设置 SEMANTIC_SCHOLAR_API_KEY，"
                "将使用匿名限额（建议在 .env 或 GitHub Secrets 中配置）"
            )

        log(f"🔍 Fetching Semantic Scholar，共 {len(groups)} 组关键词…")
        blocks: list[dict] = []
        for gi, kw in enumerate(groups, 1):
            log(f"🔎 [Semantic Scholar] 第 {gi}/{len(groups)} 组: {kw!r}")
            part = _fetch_s2_group(cfg, kw, win)
            blocks.append({S2_GROUP_KEY: kw, S2_PAPERS_KEY: part})

        total_uncapped = sum(len(b.get(S2_PAPERS_KEY) or []) for b in blocks)
        cap_raw = cfg.get("max_results_total")
        blocks = apply_max_results_total(blocks, cap_raw, papers_key=S2_PAPERS_KEY)
        total = sum(len(b.get(S2_PAPERS_KEY) or []) for b in blocks)
        if cap_raw is not None and int(cap_raw) >= 0 and total < total_uncapped:
            log(
                f"ℹ️ [Semantic Scholar] max_results_total={int(cap_raw)}，"
                f"从 {total_uncapped} 条截为 {total} 条"
            )
        if total > 0:
            log(f"✅ [Semantic Scholar] 合计 {total} 条")
        return blocks
