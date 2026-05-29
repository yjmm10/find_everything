"""按规范化链接对 entries 去重（写入 run JSON 与合并索引时使用）。"""
from __future__ import annotations

from typing import Any
from urllib.parse import urlparse, urlunparse


def normalize_link(link: str | None) -> str:
    raw = (link or "").strip()
    if not raw:
        return ""
    try:
        p = urlparse(raw)
        host = (p.hostname or "").lower().removeprefix("www.")
        path = (p.path or "").rstrip("/") or ""
        if host == "github.com" and path.lower().endswith(".git"):
            path = path[:-4]
        return urlunparse((p.scheme.lower(), host, path, "", "", "")).lower()
    except Exception:
        return raw.lower()


def dedupe_entries_by_link(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for e in entries:
        key = normalize_link(e.get("link"))
        if not key:
            out.append(e)
            continue
        if key in seen:
            continue
        seen.add(key)
        out.append(e)
    return out
