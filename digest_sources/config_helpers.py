import copy


def source_keywords(section: dict, global_kw: str) -> str:
    """信息源自己的 keywords；未配置、为 null 或空字符串时沿用全局 keywords。"""
    if not section:
        return global_kw
    k = section.get("keywords")
    if k is None:
        return global_kw
    s = str(k).strip()
    return s if s else global_kw


def coerce_feed_item(item) -> dict:
    """RSS 项：字符串 URL，或 {url / feed, keywords?}。"""
    if isinstance(item, str):
        return {"url": item.strip(), "keywords": None}
    if isinstance(item, dict):
        url = item.get("url") or item.get("feed")
        if not url or not str(url).strip():
            raise ValueError("RSS 订阅项需要非空 url（或 feed）字段")
        k = item.get("keywords")
        if k is not None and str(k).strip():
            return {"url": str(url).strip(), "keywords": str(k).strip()}
        return {"url": str(url).strip(), "keywords": None}
    raise ValueError(f"RSS 订阅项必须是 URL 字符串或对象，当前类型: {type(item)!r}")


def get_rss_section(cfg: dict, default_digest_cfg: dict) -> dict:
    """合并 rss 块与旧版顶层 rss_feeds / rss_max_items。"""
    base = cfg.get("rss")
    rss = copy.deepcopy(base) if isinstance(base, dict) else {}
    legacy_feeds = cfg.get("rss_feeds")
    if legacy_feeds is not None:
        rss["feeds"] = [coerce_feed_item(x) for x in legacy_feeds]
    elif "feeds" not in rss:
        rss["feeds"] = copy.deepcopy(default_digest_cfg["rss"]["feeds"])
    rss.setdefault("feeds", [])
    if cfg.get("rss_max_items") is not None:
        rss["max_items"] = cfg["rss_max_items"]
    rss.setdefault("max_items", default_digest_cfg["rss"]["max_items"])
    if "keywords" not in rss:
        rss["keywords"] = None
    rss["feeds"] = [coerce_feed_item(x) for x in rss["feeds"]]
    return rss


def resolve_rss_feed_keywords(feed_entry: dict, rss_section: dict, global_kw: str) -> str:
    """单条 RSS：feed.keywords → rss.keywords → 全局 keywords。"""
    fk = feed_entry.get("keywords")
    if fk is not None and str(fk).strip():
        return str(fk).strip()
    return source_keywords(rss_section, global_kw)
