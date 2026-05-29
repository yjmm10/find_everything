"""写入 data/runs 与 data/index.json。"""
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from digest_export.schema import SCHEMA_VERSION, run_to_index_summary


def _runs_dir(data_dir: Path) -> Path:
    d = data_dir / "runs"
    d.mkdir(parents=True, exist_ok=True)
    return d


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
