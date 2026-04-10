import copy

from digest_sources.date_range import DigestDateWindow, digest_window_from_date_range_dict, nonempty_date_range_dict


def resolve_rss_feed_date_window(
    feed_entry: dict,
    rss_section: dict,
    fallback: DigestDateWindow,
) -> DigestDateWindow:
    """单条 feed 的 date_range → rss 块级 date_range → 全局 fallback。"""
    for src in (feed_entry, rss_section):
        if not isinstance(src, dict):
            continue
        dr = src.get("date_range")
        if nonempty_date_range_dict(dr):
            return digest_window_from_date_range_dict(dr)
    return fallback


def source_keyword_groups(section: dict, global_kw: str) -> list[str]:
    """
    解析某信息源的 keywords，得到若干检索组（每组一条 arXiv 查询里的 all:(...) 片段）。
    支持字符串（单组）或 YAML 列表；列表项可为对象（仅 query / keywords，不含 date_range）。
    """
    g0 = (global_kw or "").strip()

    if not section:
        return [g0] if g0 else []

    k = section.get("keywords")
    if k is None:
        return [g0] if g0 else []

    if isinstance(k, (list, tuple)):
        out: list[str] = []
        for x in k:
            if x is None:
                continue
            if isinstance(x, dict):
                q = (x.get("query") or x.get("keywords") or "").strip()
                if q:
                    out.append(q)
            else:
                s = str(x).strip()
                if s:
                    out.append(s)
        if out:
            return out
        return [g0] if g0 else []

    s = str(k).strip()
    if s:
        return [s]
    return [g0] if g0 else []


def source_keywords(section: dict, global_kw: str) -> str:
    """信息源自己的 keywords；多组时用「 | 」连接，供日志与 AI 提示上下文展示。"""
    groups = source_keyword_groups(section, global_kw)
    if not groups:
        return (global_kw or "").strip()
    if len(groups) == 1:
        return groups[0]
    return " | ".join(groups)


def coerce_feed_item(item) -> dict:
    """RSS 项：字符串 URL，或 {url / feed, keywords?, date_range?}。"""
    if isinstance(item, str):
        return {"url": item.strip(), "keywords": None}
    if isinstance(item, dict):
        url = item.get("url") or item.get("feed")
        if not url or not str(url).strip():
            raise ValueError("RSS 订阅项需要非空 url（或 feed）字段")
        out: dict = {"url": str(url).strip(), "keywords": None}
        k = item.get("keywords")
        if k is not None and str(k).strip():
            out["keywords"] = str(k).strip()
        dr = item.get("date_range")
        if dr is not None:
            if not isinstance(dr, dict):
                raise ValueError(f"RSS 订阅项 date_range 必须为映射: {item!r}")
            out["date_range"] = dr
        return out
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
