"""组装 Schema v1 run 对象。"""
import datetime
import re
from typing import Any

from digest_export.markdown_parser import compute_stats, parse_file_meta, parse_markdown_to_sections

SCHEMA_VERSION = "1"


def crawl_date_from_run_id(run_id: str, executed_at: datetime.datetime) -> str:
    m = re.search(r"_(\d{4})(\d{2})(\d{2})T\d{6}Z$", run_id)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    return executed_at.strftime("%Y-%m-%d")


def build_run_from_markdown(
    *,
    run_id: str,
    markdown_body: str,
    executed_at: datetime.datetime,
    window: dict[str, str],
    config: dict[str, Any],
    trigger: str = "manual",
) -> dict[str, Any]:
    sections = parse_markdown_to_sections(markdown_body, run_id)
    stats = compute_stats(sections)
    file_meta = parse_file_meta(markdown_body)

    date_start = window.get("dateStart") or file_meta.get("dateStart") or ""
    date_end = window.get("dateEnd") or file_meta.get("dateEnd") or ""

    crawl_date = crawl_date_from_run_id(run_id, executed_at)
    executed_iso = executed_at.replace(tzinfo=datetime.timezone.utc).isoformat().replace("+00:00", "Z")

    status = "empty" if stats["entryCount"] == 0 else "success"

    return {
        "schemaVersion": SCHEMA_VERSION,
        "id": run_id,
        "crawl": {
            "executedAt": executed_iso,
            "crawlDate": crawl_date,
            "status": status,
            "trigger": trigger,
        },
        "window": {
            "dateStart": date_start,
            "dateEnd": date_end,
            "preset": window.get("preset", ""),
            "mode": window.get("mode", ""),
        },
        "config": config,
        "content": {
            "markdownBody": markdown_body,
            "markdownGeneratedAt": executed_iso,
        },
        "sections": sections,
        "stats": stats,
    }


def run_to_index_summary(run: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": run["id"],
        "jsonUrl": f"data/runs/{run['id']}.json",
        "crawlDate": run["crawl"]["crawlDate"],
        "executedAt": run["crawl"]["executedAt"],
        "status": run["crawl"]["status"],
        "window": {
            "dateStart": run["window"]["dateStart"],
            "dateEnd": run["window"]["dateEnd"],
        },
        "entryCount": run["stats"]["entryCount"],
        "sourceCounts": run["stats"]["sourceCounts"],
        "hasMarkdown": bool(run.get("content", {}).get("markdownBody")),
    }
