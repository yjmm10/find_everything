"""
数据时间窗口：用于 Arxiv submittedDate 等。

preset（相对「执行当日」）：
  - day:   前一自然日
  - week:  以「执行日前一日」为结束日、向前连续 7 天（与原周报逻辑一致）
  - month: 前一自然月（整月）

也可在配置中写 start / end（YYYY-MM-DD 或 YYYYMMDD），与 preset 同时存在时以 start/end 为准。

各信息源可在自身块内写 `date_range`（字段与根配置相同），由
`digest_window_from_date_range_dict` 解析；**不读取** `DIGEST_*` 环境变量。

环境变量（可选，仅作用于根配置 `date_range`）：
  DIGEST_DATE_START + DIGEST_DATE_END  同时设置时覆盖一切，视为 custom
  DIGEST_DATE_PRESET                   week / day / month（及 daily/weekly/monthly 等别名）
"""

from __future__ import annotations

import datetime
import os
from dataclasses import dataclass


@dataclass(frozen=True)
class DigestDateWindow:
    """人可读起止日 + arXiv submittedDate 区间内部字符串（已含 TO 两侧空格）。"""

    start_date: str  # YYYY-MM-DD
    end_date: str
    arxiv_submitted_inner: str  # e.g. "202603310000 TO 202604062359"
    mode: str  # week | day | month | custom


def _parse_ymd(s: str) -> datetime.date:
    t = str(s).strip()
    if len(t) == 10 and t[4] == "-" and t[7] == "-":
        return datetime.date.fromisoformat(t)
    if len(t) == 8 and t.isdigit():
        return datetime.date(int(t[:4]), int(t[4:6]), int(t[6:8]))
    raise ValueError(f"无法解析日期（需 YYYY-MM-DD 或 YYYYMMDD）: {s!r}")


def _to_arxiv_inner(start: datetime.date, end: datetime.date) -> str:
    a = start.strftime("%Y%m%d") + "0000"
    b = end.strftime("%Y%m%d") + "2359"
    return f"{a} TO {b}"


def _window_day(today: datetime.date) -> tuple[datetime.date, datetime.date]:
    d = today - datetime.timedelta(days=1)
    return d, d


def _window_week(today: datetime.date) -> tuple[datetime.date, datetime.date]:
    end = today - datetime.timedelta(days=1)
    start = end - datetime.timedelta(days=6)
    return start, end


def _window_month(today: datetime.date) -> tuple[datetime.date, datetime.date]:
    first_this = today.replace(day=1)
    last_prev = first_this - datetime.timedelta(days=1)
    start_prev = last_prev.replace(day=1)
    return start_prev, last_prev


def _normalize_preset(raw: str) -> str:
    p = (raw or "week").strip().lower()
    if p in ("d", "day", "daily"):
        return "day"
    if p in ("w", "week", "weekly"):
        return "week"
    if p in ("m", "month", "monthly"):
        return "month"
    raise ValueError(
        f"date_range.preset 无效: {raw!r}（支持 week / day / month）"
    )


def _dates_for_preset(mode: str, today: datetime.date) -> tuple[datetime.date, datetime.date]:
    if mode == "day":
        return _window_day(today)
    if mode == "week":
        return _window_week(today)
    if mode == "month":
        return _window_month(today)
    raise ValueError(f"内部错误: 未知 preset {mode!r}")


def nonempty_date_range_dict(dr) -> bool:
    """YAML 中 date_range 映射是否包含有效字段（preset / start / end）。"""
    return bool(
        isinstance(dr, dict)
        and any(dr.get(k) not in (None, "") for k in ("start", "end", "preset"))
    )


def resolve_source_date_window(
    section: dict | None,
    fallback: DigestDateWindow,
) -> DigestDateWindow:
    """
    信息源级 date_range（如 arxiv.date_range、github_trending.date_range）。
    未配置或非空映射时沿用 fallback（通常为根 date_range + 环境变量解析结果）。
    不读取环境变量，仅解析 section['date_range']。
    """
    if not section or not isinstance(section, dict):
        return fallback
    dr = section.get("date_range")
    if not nonempty_date_range_dict(dr):
        return fallback
    return digest_window_from_date_range_dict(dr)


def digest_window_from_date_range_dict(
    dr: dict,
    today: datetime.date | None = None,
) -> DigestDateWindow:
    """
    仅根据 YAML 映射计算窗口（不读环境变量）。
    用于根配置 date_range 中「仅 preset」分支，以及 arxiv.keywords[] 条目内嵌的 date_range。
    """
    if today is None:
        today = datetime.date.today()
    if not isinstance(dr, dict):
        raise ValueError("date_range 必须为映射")

    ys, ye = dr.get("start"), dr.get("end")
    has_start = ys is not None and str(ys).strip() != ""
    has_end = ye is not None and str(ye).strip() != ""
    if has_start:
        if not has_end:
            raise ValueError("date_range 已设置 start 时也必须设置 end")
        start_d = _parse_ymd(str(ys))
        end_d = _parse_ymd(str(ye))
        if start_d > end_d:
            raise ValueError(
                f"date_range 区间无效：start {start_d} 晚于 end {end_d}"
            )
        return DigestDateWindow(
            start_date=start_d.isoformat(),
            end_date=end_d.isoformat(),
            arxiv_submitted_inner=_to_arxiv_inner(start_d, end_d),
            mode="custom",
        )
    if has_end:
        raise ValueError("date_range 仅设置了 end，缺少 start")

    mode = _normalize_preset(str(dr.get("preset", "week")))
    start_d, end_d = _dates_for_preset(mode, today)
    return DigestDateWindow(
        start_date=start_d.isoformat(),
        end_date=end_d.isoformat(),
        arxiv_submitted_inner=_to_arxiv_inner(start_d, end_d),
        mode=mode,
    )


def github_trending_since_param(mode: str) -> str:
    """GitHub Trending ?since= 与数据窗口 mode 对齐；custom 时退回 weekly。"""
    m = (mode or "week").strip().lower()
    if m == "day":
        return "daily"
    if m == "week":
        return "weekly"
    if m == "month":
        return "monthly"
    return "weekly"


def build_digest_date_window(cfg: dict, default_cfg: dict) -> DigestDateWindow:
    """根据配置与环境变量构造数据窗口。"""
    today = datetime.date.today()

    es = os.getenv("DIGEST_DATE_START", "").strip()
    ee = os.getenv("DIGEST_DATE_END", "").strip()
    if es or ee:
        if not (es and ee):
            raise ValueError(
                "环境变量 DIGEST_DATE_START 与 DIGEST_DATE_END 需同时设置（或均不设置）"
            )
        start_d = _parse_ymd(es)
        end_d = _parse_ymd(ee)
        if start_d > end_d:
            raise ValueError(
                f"日期区间无效：start {start_d} 晚于 end {end_d}"
            )
        return DigestDateWindow(
            start_date=start_d.isoformat(),
            end_date=end_d.isoformat(),
            arxiv_submitted_inner=_to_arxiv_inner(start_d, end_d),
            mode="custom",
        )

    dr = cfg.get("date_range")
    if dr is None and isinstance(default_cfg, dict):
        dr = default_cfg.get("date_range")
    if not isinstance(dr, dict):
        dr = {}

    ys, ye = dr.get("start"), dr.get("end")
    has_start = ys is not None and str(ys).strip() != ""
    has_end = ye is not None and str(ye).strip() != ""
    if has_start:
        return digest_window_from_date_range_dict(dr, today)
    if has_end:
        raise ValueError("date_range 仅设置了 end，缺少 start")

    dr_eff = dict(dr)
    ep = os.getenv("DIGEST_DATE_PRESET", "").strip()
    if ep:
        dr_eff["preset"] = ep
    return digest_window_from_date_range_dict(dr_eff, today)
