#!/usr/bin/env python3
"""
按周回填历史数据窗口（默认 2026-01-01 ~ 2026-04-30）。
用法:
  python scripts/backfill_weekly_runs.py
  python scripts/backfill_weekly_runs.py --start 2026-01-01 --end 2026-04-30
  python scripts/backfill_weekly_runs.py --dry-run
"""
from __future__ import annotations

import argparse
import datetime
import os
import re
import subprocess
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
DATA_RUNS = REPO_ROOT / "data" / "runs"


def iter_weeks(start: datetime.date, end: datetime.date):
    d = start
    while d <= end:
        week_end = min(d + datetime.timedelta(days=6), end)
        yield d, week_end
        d = week_end + datetime.timedelta(days=1)


def parse_run_window(stem: str) -> tuple[datetime.date, datetime.date] | None:
    m = re.match(r"^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})", stem)
    if not m:
        return None
    return datetime.date.fromisoformat(m.group(1)), datetime.date.fromisoformat(m.group(2))


def ranges_overlap(a0: datetime.date, a1: datetime.date, b0: datetime.date, b1: datetime.date) -> bool:
    return a0 <= b1 and b0 <= a1


def week_already_exists(start: str, end: str) -> bool:
    if not DATA_RUNS.is_dir():
        return False
    prefix = f"{start}_{end}"
    if any(p.stem.startswith(prefix) for p in DATA_RUNS.glob("*.json")):
        return True
    s0 = datetime.date.fromisoformat(start)
    s1 = datetime.date.fromisoformat(end)
    for p in DATA_RUNS.glob("*.json"):
        w = parse_run_window(p.stem)
        if w and ranges_overlap(s0, s1, w[0], w[1]):
            return True
    return False


def main() -> int:
    parser = argparse.ArgumentParser(description="按周回填 digest runs")
    parser.add_argument("--start", default="2026-01-01", help="首周起始日 YYYY-MM-DD")
    parser.add_argument("--end", default="2026-04-30", help="末周结束日 YYYY-MM-DD")
    parser.add_argument("--dry-run", action="store_true", help="仅列出待跑周次")
    parser.add_argument("--sleep", type=float, default=15.0, help="每周期间隔秒数（缓解 API 限流）")
    args = parser.parse_args()

    start_d = datetime.date.fromisoformat(args.start)
    end_d = datetime.date.fromisoformat(args.end)
    if start_d > end_d:
        print("start 不能晚于 end", file=sys.stderr)
        return 1

    weeks = list(iter_weeks(start_d, end_d))
    todo = [(s, e) for s, e in weeks if not week_already_exists(s.isoformat(), e.isoformat())]
    skip = len(weeks) - len(todo)

    print(f"回填范围 {args.start} ~ {args.end}：共 {len(weeks)} 周，已有 {skip} 周，待跑 {len(todo)} 周")
    for s, e in todo:
        print(f"  · {s.isoformat()} ~ {e.isoformat()}")

    if args.dry_run or not todo:
        return 0

    env_base = os.environ.copy()
    env_base["DIGEST_NO_GIT"] = "1"

    ok, fail = 0, 0
    for i, (s, e) in enumerate(todo, 1):
        s_s, e_s = s.isoformat(), e.isoformat()
        print(f"\n{'='*60}\n[{i}/{len(todo)}] 抓取 {s_s} ~ {e_s}\n{'='*60}")
        env = {
            **env_base,
            "DIGEST_DATE_START": s_s,
            "DIGEST_DATE_END": e_s,
        }
        r = subprocess.run(
            [sys.executable, str(REPO_ROOT / "main.py")],
            cwd=str(REPO_ROOT),
            env=env,
        )
        if r.returncode == 0:
            ok += 1
        else:
            fail += 1
            print(f"⚠️ 周次 {s_s}~{e_s} 失败 exit={r.returncode}", file=sys.stderr)
        if i < len(todo):
            time.sleep(args.sleep)

    # 重建 index.json
    sys.path.insert(0, str(REPO_ROOT))
    from digest_export.migrate import _rebuild_index

    _rebuild_index(REPO_ROOT / "data")

    print(f"\n完成：成功 {ok}，失败 {fail}")
    print("下一步：将 data/ 推送到 master，由 digest-site / weekly-digest 工作流构建并发布到 gh-pages。")
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
