import os
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

from bs4 import BeautifulSoup

from digest_sources.base import DigestSource, FetchContext
from digest_sources.config_helpers import source_keywords
from digest_sources.date_range import (
    DigestDateWindow,
    github_trending_since_param,
    nonempty_date_range_dict,
    resolve_source_date_window,
)
from digest_sources.keyword_expr import parse_keyword_expression, title_matches_keyword_expr
from digest_sources.util import http_session, log, progress, url_hint


def _github_url_with_since(url: str, since: str) -> str:
    p = urlparse(url.strip())
    qs = parse_qs(p.query)
    qs["since"] = [since]
    q = urlencode(qs, doseq=True)
    return urlunparse((p.scheme, p.netloc, p.path, p.params, q, p.fragment))


def _github_api_headers(gh_cfg: dict) -> dict:
    h = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": gh_cfg.get("user_agent", "Mozilla/5.0 (compatible; GitHubDigestBot/1.0)"),
    }
    token = (os.getenv("GITHUB_TOKEN") or os.getenv("GH_TOKEN") or "").strip()
    if token:
        h["Authorization"] = f"Bearer {token}"
    return h


def _fetch_repo_stars_forks(session, repo_slug: str, gh_cfg: dict) -> tuple:
    api_timeout = float(gh_cfg.get("api_timeout", 20))
    url = f"https://api.github.com/repos/{repo_slug}"
    try:
        r = session.get(url, headers=_github_api_headers(gh_cfg), timeout=api_timeout)
        if r.status_code == 404:
            return None, None, None
        r.raise_for_status()
        j = r.json()
        return (
            j.get("stargazers_count"),
            j.get("forks_count"),
            j.get("language"),
        )
    except Exception as e:
        log(f"⚠️ [GitHub API] {repo_slug} 元数据失败，已跳过: {e}")
        return None, None, None


class GithubTrendingSource(DigestSource):
    section_key = "github_trending"
    label = "GitHub Trending"
    prompt_header = "GitHub"

    def fetch(self, ctx: FetchContext) -> list:
        gh_cfg = self.section(ctx)
        if not isinstance(gh_cfg, dict) or not gh_cfg.get("enabled", True):
            log("⏭️ GitHub Trending 已在配置中关闭，跳过")
            return []
        log("🔍 [GitHub] 开始拉取 Trending")
        url = gh_cfg.get("url", "https://github.com/trending?since=weekly")
        fb = DigestDateWindow(
            start_date=ctx.start_date,
            end_date=ctx.end_date,
            arxiv_submitted_inner=ctx.date_range,
            mode=ctx.date_range_mode,
        )
        win = resolve_source_date_window(gh_cfg, fb)
        if nonempty_date_range_dict(gh_cfg.get("date_range")):
            since = github_trending_since_param(win.mode)
            url = _github_url_with_since(url, since)
            note = ""
            if win.mode == "custom":
                note = "；绝对日期未对应 GitHub 周期，已用 weekly，可改 url 覆盖"
            log(f"ℹ️ [GitHub] 本源 date_range（{win.mode}）→ since={since}{note}")
        timeout = float(gh_cfg.get("request_timeout", 60))
        headers = {"User-Agent": gh_cfg.get("user_agent", "Mozilla/5.0 (compatible; GitHubDigestBot/1.0)")}
        max_repos = int(gh_cfg.get("max_repos", 8))
        log(f"📥 [GitHub] 请求 {url_hint(url)}（超时 {timeout}s）…")
        resp = http_session().get(url, headers=headers, timeout=timeout)
        resp.raise_for_status()
        log("📥 [GitHub] 正在解析 HTML 仓库列表…")
        soup = BeautifulSoup(resp.text, "html.parser")
        rows = soup.select("article.Box-row")[:max_repos]
        results = []
        for row in progress(rows, desc="GitHub 仓库", unit="个"):
            repo = row.select_one("h2 a")["href"].strip("/")
            desc_tag = row.select_one("p.col-9")
            results.append({
                "repo": repo,
                "desc": desc_tag.text.strip() if desc_tag else "No description",
                "link": f"https://github.com/{repo}",
            })
        kw_s = source_keywords(gh_cfg, ctx.global_keywords)
        ex = parse_keyword_expression(kw_s)
        if ex:
            before_n = len(results)
            results = [
                it
                for it in results
                if title_matches_keyword_expr(
                    f"{it.get('repo', '')} {it.get('desc', '')}".lower(),
                    ex,
                )
            ]
            log(
                f"ℹ️ [GitHub] 关键词式 {kw_s!r} 筛选仓库 {before_n} → {len(results)} 条"
            )
        if gh_cfg.get("api_enrich", True) and results:
            log("📥 [GitHub] 通过 API 补充 Star / Fork / 语言…")
            session = http_session()
            for it in progress(results, desc="GitHub API", unit="个"):
                st, fk, lg = _fetch_repo_stars_forks(session, it["repo"], gh_cfg)
                it["stars"], it["forks"], it["language"] = st, fk, lg
        else:
            for it in results:
                it.setdefault("stars", None)
                it.setdefault("forks", None)
                it.setdefault("language", None)
        log(f"✅ [GitHub] 完成，共 {len(results)} 个仓库（解析上限 {max_repos}）")
        return results

    def format_for_prompt(self, items: list) -> str:
        if not items:
            return "(无)"
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
        return "\n".join(lines)
