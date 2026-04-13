"""GitHub REST 共用请求头（周榜 enrich 与 Search API）。"""

import os


def github_api_headers(cfg: dict) -> dict:
    h = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": cfg.get("user_agent", "Mozilla/5.0 (compatible; GitHubDigestBot/1.0)"),
    }
    token = (os.getenv("GITHUB_TOKEN") or os.getenv("GH_TOKEN") or "").strip()
    if token:
        h["Authorization"] = f"Bearer {token}"
    return h
