"""写入 data/runs 与 data/index.json。"""
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from digest_export.schema import SCHEMA_VERSION, run_to_index_summary

MergeRunResult = Literal["added", "updated", "kept", "skip"]


def _runs_dir(data_dir: Path) -> Path:
    d = data_dir / "runs"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _run_executed_at(path: Path) -> str:
    try:
        run = json.loads(path.read_text(encoding="utf-8"))
        return str(run.get("crawl", {}).get("executedAt") or "")
    except (json.JSONDecodeError, OSError):
        return ""


def merge_run_file(dest: Path, src: Path) -> MergeRunResult:
    """
    合并单个 run JSON：目标不存在则复制；同名则保留 executedAt 较新者。
    """
    if not src.is_file():
        return "skip"
    dest.parent.mkdir(parents=True, exist_ok=True)
    if not dest.is_file():
        dest.write_bytes(src.read_bytes())
        return "added"
    src_ts = _run_executed_at(src)
    dest_ts = _run_executed_at(dest)
    if src_ts > dest_ts:
        dest.write_bytes(src.read_bytes())
        return "updated"
    return "kept"


def merge_runs_directory(src_runs: Path, dest_runs: Path) -> dict[str, int]:
    """将 src_runs/*.json 合并进 dest_runs（按 run id / 文件名去重，保留较新 executedAt）。"""
    counts = {"added": 0, "updated": 0, "kept": 0, "skip": 0}
    if not src_runs.is_dir():
        return counts
    dest_runs.mkdir(parents=True, exist_ok=True)
    for src in src_runs.glob("*.json"):
        result = merge_run_file(dest_runs / src.name, src)
        counts[result] += 1
    return counts


def save_run(run: dict[str, Any], data_dir: str | Path = "data") -> Path:
    root = Path(data_dir)
    path = _runs_dir(root) / f"{run['id']}.json"
    path.write_text(json.dumps(run, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def load_index(data_dir: str | Path = "data") -> dict[str, Any]:
    root = Path(data_dir)
    index_path = root / "index.json"
    if not index_path.exists():
        return {
            "schemaVersion": SCHEMA_VERSION,
            "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "runs": [],
        }
    return json.loads(index_path.read_text(encoding="utf-8"))


def update_index(run: dict[str, Any], data_dir: str | Path = "data") -> Path:
    root = Path(data_dir)
    root.mkdir(parents=True, exist_ok=True)
    index = load_index(root)
    summary = run_to_index_summary(run)
    runs = [r for r in index.get("runs", []) if r.get("id") != run["id"]]
    runs.insert(0, summary)
    runs.sort(key=lambda r: r.get("executedAt", ""), reverse=True)
    index["runs"] = runs
    index["schemaVersion"] = SCHEMA_VERSION
    index["generatedAt"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    index_path = root / "index.json"
    index_path.write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8")
    return index_path
