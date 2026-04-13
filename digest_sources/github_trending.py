"""
GitHub 周/日/月榜（第三方 RSS 镜像 Trending）：只拉取榜单上的仓库条目作原始展示，
不对仓库名/简介做关键词过滤或本地删减（与 github_repository_search 全站检索无关）。
"""

import re
from html import unescape
from urllib.parse import parse_qs, urlparse

import feedparser
from bs4 import BeautifulSoup

from digest_sources.base import DigestSource, FetchContext
from digest_sources.date_range import (
    DigestDateWindow,
    github_trending_since_param,
    nonempty_date_range_dict,
    resolve_source_date_window,
)
from digest_sources.github_common import github_api_headers
from digest_sources.util import http_session, log, progress, url_hint

_DEFAULT_TRENDING_RSS_BASE = "https://mshibanami.github.io/GitHubTrendingRSS"


def _fetch_repo_stars_forks(session, repo_slug: str, gh_cfg: dict) -> tuple:
    api_timeout = float(gh_cfg.get("api_timeout", 20))
    url = f"https://api.github.com/repos/{repo_slug}"
    try:
        r = session.get(url, headers=github_api_headers(gh_cfg), timeout=api_timeout)
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


def _rss_description_plain(html_fragment: str, max_len: int = 400) -> str:
    if not html_fragment:
        return "No description"
    text = BeautifulSoup(unescape(html_fragment), "html.parser").get_text(separator=" ", strip=True)
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) > max_len:
        return text[: max_len - 1].rstrip() + "…"
    return text or "No description"


def _repo_slug_from_entry(title: str, link: str) -> str | None:
    t = (title or "").strip()
    if re.match(r"^[\w.-]+/[\w.-]+$", t):
        return t
    m = re.search(r"github\.com/([\w.-]+/[\w.-]+)/?", (link or ""), re.I)
    return m.group(1) if m else None


def _feed_path_pattern_match(raw: str):
    """若 raw 为 …/(daily|weekly|monthly)/{lang}.xml，返回 (base_url, lang_slug)。"""
    m = re.match(
        r"^(https?://.+?)/(daily|weekly|monthly)/([^/]+)\.(?:xml|atom|rss)$",
        (raw or "").strip(),
        flags=re.I,
    )
    if not m:
        return None
    return m.group(1).rstrip("/"), m.group(3)


def _resolve_trending_feed_url(gh_cfg: dict, win: DigestDateWindow) -> str:
    """RSS 地址：有 date_range 且 url 符合 …/weekly/xx.xml 结构时按周期重写路径；否则完整订阅链原样使用。"""
    raw = (gh_cfg.get("url") or "").strip()
    low = raw.lower()

    since = "weekly"
    if nonempty_date_range_dict(gh_cfg.get("date_range")):
        since = github_trending_since_param(win.mode)
    else:
        cfg_since = (gh_cfg.get("since") or "").strip().lower()
        if cfg_since in ("daily", "weekly", "monthly"):
            since = cfg_since
        elif "github.com/trending" in raw and "since=" in raw:
            q = parse_qs(urlparse(raw).query)
            s = (q.get("since") or [""])[0].lower()
            if s in ("daily", "weekly", "monthly"):
                since = s

    cfg_base = (gh_cfg.get("rss_base") or "").strip().rstrip("/")
    lang_cfg = (gh_cfg.get("language") or "all").strip().lower() or "all"

    if low.endswith((".xml", ".atom", ".rss")):
        parsed = _feed_path_pattern_match(raw)
        if parsed and nonempty_date_range_dict(gh_cfg.get("date_range")):
            base_url, lang_slug = parsed
            return f"{base_url}/{since}/{lang_slug}.xml"
        if parsed and not nonempty_date_range_dict(gh_cfg.get("date_range")):
            return raw
        if nonempty_date_range_dict(gh_cfg.get("date_range")):
            base = cfg_base or _DEFAULT_TRENDING_RSS_BASE
            return f"{base}/{since}/{lang_cfg}.xml"
        return raw

    base = cfg_base or _DEFAULT_TRENDING_RSS_BASE
    return f"{base.rstrip('/')}/{since}/{lang_cfg}.xml"


class GithubTrendingSource(DigestSource):
    section_key = "github_trending"
    label = "GitHub 周榜"
    prompt_header = "GitHub 周榜"

    def fetch(self, ctx: FetchContext) -> list:
        gh_cfg = self.section(ctx)
        if not isinstance(gh_cfg, dict) or not gh_cfg.get("enabled", True):
            log("⏭️ GitHub 周榜已在配置中关闭，跳过")
            return []
        fm = str(gh_cfg.get("fetch_mode") or gh_cfg.get("mode") or "").strip().lower()
        if fm in ("search", "api", "检索"):
            log(
                "ℹ️ [GitHub 周榜] 已忽略 fetch_mode=search（已弃用）；"
                "请改用配置块 github_repository_search 做官方 API 检索；本块仅拉 RSS 周榜。"
            )
        log("🔍 [GitHub 周榜] RSS Trending 榜单：原样取数，不做关键词/本地筛选")
        fb = DigestDateWindow(
            start_date=ctx.start_date,
            end_date=ctx.end_date,
            arxiv_submitted_inner=ctx.date_range,
            mode=ctx.date_range_mode,
        )
        win = resolve_source_date_window(gh_cfg, fb)
        feed_url = _resolve_trending_feed_url(gh_cfg, win)
        if nonempty_date_range_dict(gh_cfg.get("date_range")):
            since = github_trending_since_param(win.mode)
            note = ""
            if win.mode == "custom":
                note = "；绝对日期未对应 GitHub 周期，RSS 使用 weekly 目录，可改 url/since 覆盖"
            log(f"ℹ️ [GitHub 周榜] 本源 date_range（{win.mode}）→ RSS since={since}{note}")
        timeout = float(gh_cfg.get("request_timeout", 60))
        headers = {"User-Agent": gh_cfg.get("user_agent", "Mozilla/5.0 (compatible; GitHubDigestBot/1.0)")}
        max_repos = int(gh_cfg.get("max_repos", 8))
        log(f"📥 [GitHub 周榜] 请求 {url_hint(feed_url)}（超时 {timeout}s）…")
        resp = http_session().get(feed_url, headers=headers, timeout=timeout)
        resp.raise_for_status()
        feed = feedparser.parse(resp.content)
        if getattr(feed, "bozo", False) and getattr(feed, "bozo_exception", None):
            log(f"⚠️ [GitHub 周榜] RSS 解析警告: {feed.bozo_exception}")
        entries = list(feed.entries or [])[:max_repos]
        log(f"📥 [GitHub 周榜] RSS 共 {len(feed.entries or [])} 条，取前 {len(entries)} 条解析…")
        results = []
        for item in progress(entries, desc="GitHub 周榜", unit="个"):
            link = (getattr(item, "link", None) or "").strip()
            title = (getattr(item, "title", None) or "").strip()
            repo = _repo_slug_from_entry(title, link)
            if not repo:
                log(f"⚠️ [GitHub 周榜] 跳过无法识别仓库的条目: {title!r}")
                continue
            desc_html = getattr(item, "description", None) or getattr(item, "summary", "") or ""
            results.append({
                "repo": repo,
                "desc": _rss_description_plain(desc_html),
                "link": link or f"https://github.com/{repo}",
            })
        if gh_cfg.get("api_enrich", True) and results:
            log("📥 [GitHub 周榜] 通过 API 补充 Star / Fork / 语言…")
            session = http_session()
            for it in progress(results, desc="GitHub API", unit="个"):
                st, fk, lg = _fetch_repo_stars_forks(session, it["repo"], gh_cfg)
                it["stars"], it["forks"], it["language"] = st, fk, lg
        else:
            for it in results:
                it.setdefault("stars", None)
                it.setdefault("forks", None)
                it.setdefault("language", None)
        log(f"✅ [GitHub 周榜] 完成，共 {len(results)} 个仓库（解析上限 {max_repos}）")
        return results

    def format_for_prompt(self, items: list) -> str:
        if not items:
            return "(无)"
        head = (
            "（说明：以下为 Trending 类 RSS 榜单的原始条目，未按关键词做任何过滤；"
            "不是对全站 GitHub 仓库的关键词检索。）\n"
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
