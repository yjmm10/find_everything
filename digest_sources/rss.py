import datetime

import feedparser

from digest_sources.base import DigestSource, FetchContext
from digest_sources.config_helpers import (
    get_rss_section,
    resolve_rss_feed_date_window,
    resolve_rss_feed_keywords,
)
from digest_sources.date_range import DigestDateWindow
from digest_sources.keyword_expr import parse_keyword_expression, title_matches_keyword_expr
from digest_sources.util import log, progress, url_hint


def _rss_item_published_date(item) -> datetime.date | None:
    t = getattr(item, "published_parsed", None) or getattr(item, "updated_parsed", None)
    if not t:
        return None
    try:
        return datetime.date(t.tm_year, t.tm_mon, t.tm_mday)
    except (AttributeError, TypeError, ValueError):
        return None


def _item_in_date_window(d: datetime.date | None, win: DigestDateWindow) -> bool:
    if d is None:
        return True
    lo = datetime.date.fromisoformat(win.start_date)
    hi = datetime.date.fromisoformat(win.end_date)
    return lo <= d <= hi


class RssSource(DigestSource):
    section_key = "rss"
    label = "RSS 资讯"
    prompt_header = "资讯"

    def is_enabled(self, ctx: FetchContext) -> bool:
        rss = get_rss_section(ctx.cfg, ctx.default_cfg)
        if isinstance(rss, dict):
            return bool(rss.get("enabled", True))
        return True

    def fetch(self, ctx: FetchContext) -> list:
        rss_section = get_rss_section(ctx.cfg, ctx.default_cfg)
        if not rss_section.get("enabled", True):
            log("⏭️ RSS 已在配置中关闭，跳过")
            return []
        log("🔍 Fetching Tech News/RSS...")
        feeds = rss_section.get("feeds") or []
        max_items = int(rss_section.get("max_items", 8))
        n = len(feeds)
        log(f"🔍 [RSS] 开始，共 {n} 个订阅源（最多保留 {max_items} 条匹配）")
        if not feeds:
            log("⏭️ RSS 订阅列表为空，跳过资讯抓取")
            return []
        results = []
        fb = DigestDateWindow(
            start_date=ctx.start_date,
            end_date=ctx.end_date,
            arxiv_submitted_inner=ctx.date_range,
            mode=ctx.date_range_mode,
        )
        pbar = progress(feeds, desc="RSS 订阅源", unit="源")
        for entry in pbar:
            f_url = entry["url"]
            win = resolve_rss_feed_date_window(entry, rss_section, fb)
            kw_str = resolve_rss_feed_keywords(entry, rss_section, ctx.global_keywords)
            kw_expr = parse_keyword_expression(kw_str)
            before = len(results)
            pbar.set_postfix_str(url_hint(f_url, 40), refresh=False)
            try:
                feed = feedparser.parse(f_url)
                for item in progress(feed.entries, desc="  └ 条目", unit="条", leave=False):
                    if not _item_in_date_window(_rss_item_published_date(item), win):
                        continue
                    title_low = (item.title or "").lower()
                    if title_matches_keyword_expr(title_low, kw_expr):
                        results.append({
                            "title": item.title,
                            "link": item.link,
                            "source": feed.feed.get("title", "Unknown"),
                            "published": item.get("published", ""),
                        })
                added = len(results) - before
                win_note = (
                    f"，窗口 {win.start_date}~{win.end_date}"
                    if (
                        win.start_date != fb.start_date
                        or win.end_date != fb.end_date
                    )
                    else ""
                )
                pbar.write(
                    f"[INFO]    └ 匹配 {added} 条（累计 {len(results)}，"
                    f"关键词式: {url_hint(kw_str, 48)}{win_note}）"
                )
            except Exception as e:
                pbar.write(f"[INFO]    └ ⚠️ 本源失败，已跳过: {e}")
        out = results[:max_items]
        log(f"✅ [RSS] 完成，截断后共 {len(out)} 条（截取前 {max_items} 条）")
        return out
