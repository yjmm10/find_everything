"""周报各信息源：每种源一个模块，统一继承 DigestSource。"""

from digest_sources.arxiv import ArxivSource
from digest_sources.base import DigestSource, FetchContext
from digest_sources.github_trending import GithubTrendingSource
from digest_sources.rss import RssSource

# 抓取顺序；新增信息源时在此注册即可
DEFAULT_SOURCES: tuple[DigestSource, ...] = (
    ArxivSource(),
    RssSource(),
    GithubTrendingSource(),
)

__all__ = [
    "ArxivSource",
    "DEFAULT_SOURCES",
    "DigestSource",
    "FetchContext",
    "GithubTrendingSource",
    "RssSource",
]
