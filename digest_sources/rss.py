import feedparser

from digest_sources.base import DigestSource, FetchContext
from digest_sources.config_helpers import (
    get_rss_section,
    resolve_rss_feed_keywords,
)
from digest_sources.util import log, progress, url_hint


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
        pbar = progress(feeds, desc="RSS 订阅源", unit="源")
        for entry in pbar:
            f_url = entry["url"]
            kw_str = resolve_rss_feed_keywords(entry, rss_section, ctx.global_keywords)
            kw_list = [k.strip().lower() for k in kw_str.split(",") if k.strip()]
            before = len(results)
            pbar.set_postfix_str(url_hint(f_url, 40), refresh=False)
            try:
                feed = feedparser.parse(f_url)
                for item in progress(feed.entries, desc="  └ 条目", unit="条", leave=False):
                    title_low = item.title.lower()
                    if any(kw in title_low for kw in kw_list):
                        results.append({
                            "title": item.title,
                            "link": item.link,
                            "source": feed.feed.get("title", "Unknown"),
                            "published": item.get("published", ""),
                        })
                added = len(results) - before
                pbar.write(
                    f"[INFO]    └ 匹配 {added} 条（累计 {len(results)}，关键词: {url_hint(kw_str, 48)}）"
                )
            except Exception as e:
                pbar.write(f"[INFO]    └ ⚠️ 本源失败，已跳过: {e}")
        out = results[:max_items]
        log(f"✅ [RSS] 完成，截断后共 {len(out)} 条（截取前 {max_items} 条）")
        return out
