from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any


@dataclass
class FetchContext:
    """抓取时共享的上下文（配置、关键词、日期范围等）。"""

    cfg: dict
    default_cfg: dict
    global_keywords: str
    date_range: str
    start_date: str
    end_date: str


class DigestSource(ABC):
    """单种信息源的抽象基类：从配置拉取数据并格式化为提示词片段。"""

    #: 与 digest_config.yaml 中块名一致，如 arxiv、rss、github_trending
    section_key: str
    #: 日志与进度展示用
    label: str
    #: 写入 AI 提示词时的区块标题（不含【】）
    prompt_header: str

    def section(self, ctx: FetchContext) -> dict | Any:
        return ctx.cfg.get(self.section_key) or {}

    def is_enabled(self, ctx: FetchContext) -> bool:
        sec = self.section(ctx)
        if isinstance(sec, dict):
            return bool(sec.get("enabled", True))
        return True

    @abstractmethod
    def fetch(self, ctx: FetchContext) -> list:
        """返回结构化条目列表；关闭或无可抓时返回 []。"""

    def format_for_prompt(self, items: list) -> str:
        """将 fetch 结果转为模型可读文本；默认与历史行为一致（repr 列表）。"""
        if not items:
            return "(无)"
        return str(items)
