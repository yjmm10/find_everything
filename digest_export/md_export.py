"""可选：从 run JSON 导出 Markdown/HTML 副本（邮件/兼容）。"""
import datetime
from pathlib import Path

import markdown

from digest_sources.util import log


def _dated_paths(safe_slug: str, docs_dir: Path) -> tuple[Path, Path]:
    base_stem = f"weekly-digest-{safe_slug}"
    md_path = docs_dir / f"{base_stem}.md"
    html_path = docs_dir / f"{base_stem}.html"
    if not md_path.exists() and not html_path.exists():
        return md_path, html_path
    ts = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    for i in range(1000):
        suffix = f"-{ts}" if i == 0 else f"-{ts}-{i}"
        md_try = docs_dir / f"{base_stem}{suffix}.md"
        html_try = docs_dir / f"{base_stem}{suffix}.html"
        if not md_try.exists() and not html_try.exists():
            return md_try, html_try
    raise RuntimeError("无法生成唯一周报文件名")


def export_markdown_files(markdown_body: str, run_id: str, docs_dir: str = "docs") -> str:
    docs = Path(docs_dir)
    docs.mkdir(parents=True, exist_ok=True)
    safe_slug = run_id.replace("/", "-").replace(" ", "")
    dated_md, dated_html = _dated_paths(safe_slug, docs)
    latest_md = docs / "weekly-digest.md"
    latest_html = docs / "weekly-digest.html"

    for path in (dated_md, latest_md):
        path.write_text(markdown_body, encoding="utf-8")

    html_content = markdown.markdown(markdown_body, extensions=["tables", "fenced_code", "toc"])
    mobile_css = """
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; max-width: 900px; margin: 0 auto; padding: 20px; background: #f8f9fa; color: #24292e; }
      a { color: #0366d6; text-decoration: none; } a:hover { text-decoration: underline; }
      h1, h2, h3 { border-bottom: 1px solid #e1e4e8; padding-bottom: 0.3em; margin-top: 24px; }
      table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 0.92em; }
      th, td { border: 1px solid #d0d7de; padding: 8px 10px; text-align: left; }
      th { background: #f6f8fa; }
    </style>
    """
    html_full = (
        f"<!DOCTYPE html><html><head><meta charset='utf-8'>"
        f"<meta name='viewport' content='width=device-width, initial-scale=1'>{mobile_css}</head>"
        f"<body>{html_content}</body></html>"
    )
    for path in (dated_html, latest_html):
        path.write_text(html_full, encoding="utf-8")

    log(f"📄 已导出 MD/HTML → {dated_md}")
    return str(dated_md)
