"""将 docs/weekly-digest-*.md 迁移为 data/runs/*.json（Schema v1）。"""
import datetime
import json
import re
from pathlib import Path

from digest_export.schema import SCHEMA_VERSION, build_run_from_markdown, run_to_index_summary
from digest_export.storage import save_run


def _slug_from_filename(name: str) -> str:
    return name.replace("weekly-digest-", "", 1).removesuffix(".md")


def _executed_at_from_body(body: str, path: Path) -> datetime.datetime:
    m = re.search(r">\s*\*\*爬取时间\*\*：(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\s*UTC", body)
    if m:
        dt = datetime.datetime.strptime(f"{m.group(1)} {m.group(2)}", "%Y-%m-%d %H:%M:%S")
        return dt.replace(tzinfo=datetime.timezone.utc)
    ts = path.stat().st_mtime
    return datetime.datetime.fromtimestamp(ts, tz=datetime.timezone.utc)


def migrate_docs_to_json(docs_dir: str = "docs", data_dir: str = "data") -> int:
    docs = Path(docs_dir)
    if not docs.is_dir():
        return 0
    migrated = 0
    for path in sorted(docs.glob("weekly-digest-*.md")):
        if path.name == "weekly-digest.md":
            continue
        run_id = _slug_from_filename(path.name)
        json_path = Path(data_dir) / "runs" / f"{run_id}.json"
        if json_path.exists():
            continue
        body = path.read_text(encoding="utf-8")
        executed_at = _executed_at_from_body(body, path)
        win = re.search(
            r"时间窗口\s*(\d{4}-\d{2}-\d{2})\s*[~～]\s*(\d{4}-\d{2}-\d{2})",
            body,
        )
        date_start = win.group(1) if win else ""
        date_end = win.group(2) if win else ""
        if not date_start and "_" in run_id:
            parts = run_id.split("_")
            if len(parts) >= 2 and re.fullmatch(r"\d{4}-\d{2}-\d{2}", parts[0]):
                date_start, date_end = parts[0], parts[1]
        run = build_run_from_markdown(
            run_id=run_id,
            markdown_body=body,
            executed_at=executed_at,
            window={"dateStart": date_start, "dateEnd": date_end, "preset": "", "mode": ""},
            config={},
            trigger="migration",
        )
        save_run(run, data_dir)
        migrated += 1
    _rebuild_index(data_dir)
    return migrated


def _rebuild_index(data_dir: str | Path) -> None:
    root = Path(data_dir)
    runs_dir = root / "runs"
    if not runs_dir.is_dir():
        return
    by_id: dict[str, dict] = {}
    for path in sorted(runs_dir.glob("*.json"), reverse=True):
        run = json.loads(path.read_text(encoding="utf-8"))
        rid = run.get("id") or path.stem
        summary = run_to_index_summary(run)
        prev = by_id.get(rid)
        if prev is None or summary.get("executedAt", "") >= prev.get("executedAt", ""):
            by_id[rid] = summary
    summaries = sorted(by_id.values(), key=lambda r: r.get("executedAt", ""), reverse=True)
    index = {
        "schemaVersion": SCHEMA_VERSION,
        "generatedAt": datetime.datetime.now(datetime.timezone.utc)
        .isoformat()
        .replace("+00:00", "Z"),
        "runs": summaries,
    }
    root.mkdir(parents=True, exist_ok=True)
    (root / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    n = migrate_docs_to_json()
    _rebuild_index(Path("data"))
    print(f"migrate: {n} docs → data/runs/（已重建 index.json）")
