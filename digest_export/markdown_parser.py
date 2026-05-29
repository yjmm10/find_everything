"""将 AI 产出的 Markdown 周报解析为 sections + entries（与 digest-viewer parse-digests 对齐）。"""
import re
from typing import Any

from digest_export.dedupe import dedupe_entries_by_link

SOURCE_BY_HEADING = {
    "📄 Arxiv 前沿论文": "arxiv",
    "🎓 Semantic Scholar": "semantic_scholar",
    "📚 OpenAlex": "openalex",
    "📰 优质资讯/论坛": "rss",
    "🔥 GitHub 热门仓库": "github",
    "🔥 GitHub 周榜": "github_weekly",
    "🔎 GitHub 指定日期检索": "github_search",
}

ALL_SOURCES = list(SOURCE_BY_HEADING.values())


def is_placeholder_value(v: Any) -> bool:
    t = str(v or "").strip()
    if not t:
        return True
    if re.fullmatch(r"[-—–_\s.]+", t):
        return True
    return t == "无" or bool(re.fullmatch(r"n/?a", t, re.I))


def is_valid_http_link(link: str) -> bool:
    t = str(link or "").strip()
    if is_placeholder_value(t):
        return False
    return bool(re.match(r"^https?://", t, re.I))


def parse_meta(block: str) -> dict[str, str]:
    kw_m = re.search(r"关键词组为[「『]([^」』]+)[」』]", block) or re.search(
        r"检索关键词为[「『]([^」』]+)[」』]", block
    )
    kw_default = re.search(r"全局默认[「『]([^」』]+)[」』]", block)
    keywords = (kw_m or kw_default).group(1).strip() if (kw_m or kw_default) else ""
    win = re.search(
        r"时间窗口\s*(\d{4}-\d{2}-\d{2})\s*[~～]\s*(\d{4}-\d{2}-\d{2})",
        block,
    )
    return {
        "keywords": keywords,
        "dateStart": win.group(1) if win else "",
        "dateEnd": win.group(2) if win else "",
    }


def parse_file_meta(text: str) -> dict[str, str]:
    win = re.search(
        r"时间窗口\s*(\d{4}-\d{2}-\d{2})\s*[~～]\s*(\d{4}-\d{2}-\d{2})",
        text,
    )
    kw_m = re.search(r"关键词组为[「『]([^」』]+)[」』]", text) or re.search(
        r"检索关键词为[「『]([^」』]+)[」』]", text
    )
    return {
        "keywords": kw_m.group(1).strip() if kw_m else "",
        "dateStart": win.group(1) if win else "",
        "dateEnd": win.group(2) if win else "",
    }


def extract_section_summary(body: str) -> str:
    parts: list[str] = []
    for line in body.split("\n"):
        t = line.strip()
        if not t or t.startswith("|") or t.startswith(">"):
            continue
        parts.append(t)
    return " ".join(parts).strip()


def split_cells(line: str) -> list[str]:
    raw = line.strip()
    if not raw.startswith("|"):
        return []
    inner = raw[1:-1] if raw.endswith("|") else raw[1:]
    return [c.strip() for c in inner.split("|")]


def is_separator_row(line: str) -> bool:
    cells = split_cells(line)
    if not cells:
        return False
    return all(re.fullmatch(r":?-{3,}:?", c.replace(" ", "")) for c in cells)


def parse_table(block: str) -> tuple[list[str], list[list[str]]]:
    lines = block.split("\n")
    i = 0
    while i < len(lines) and not lines[i].strip().startswith("|"):
        i += 1
    if i >= len(lines):
        return [], []
    headers = split_cells(lines[i])
    i += 1
    if i < len(lines) and is_separator_row(lines[i]):
        i += 1
    rows: list[list[str]] = []
    while i < len(lines):
        line = lines[i]
        if not line.strip().startswith("|"):
            break
        if is_separator_row(line):
            i += 1
            continue
        rows.append(split_cells(line))
        i += 1
    return headers, rows


def _row_extra(source: str, h: dict[str, str]) -> dict[str, Any]:
    extra: dict[str, Any] = {}
    if source == "arxiv":
        subj = (h.get("学科类别") or "").strip()
        if subj and not is_placeholder_value(subj):
            extra["subject"] = subj
    elif source in ("semantic_scholar", "openalex"):
        venue = (h.get("来源/venue") or h.get("来源") or "").strip()
        cite = (h.get("引用数") or "").strip()
        if venue and not is_placeholder_value(venue):
            extra["venue"] = venue
        if cite and not is_placeholder_value(cite):
            extra["citationCount"] = cite
    elif source in ("github", "github_weekly", "github_search"):
        for key, col in (("star", "Star"), ("fork", "Fork"), ("language", "主语言")):
            val = (h.get(col) or "").strip()
            if val and not is_placeholder_value(val):
                extra[key] = val
    return extra


def row_to_entry(
    headers: list[str],
    cells: list[str],
    source: str,
    meta: dict[str, str],
    run_id: str,
    row_index: int,
) -> dict[str, Any] | None:
    h = {headers[j]: (cells[j] if j < len(cells) else "") for j in range(len(headers)) if headers[j]}
    title = (h.get("标题") or "").strip()
    link = (h.get("链接") or "").strip()
    summary = (h.get("说明") or "").strip()
    if is_placeholder_value(title) and not is_valid_http_link(link):
        return None
    if is_placeholder_value(title) and is_placeholder_value(summary) and not is_valid_http_link(link):
        return None

    score_raw = (h.get("评分") or "").strip()
    score_val = None
    if score_raw and not is_placeholder_value(score_raw):
        try:
            score_val = int(score_raw)
        except ValueError:
            score_val = None

    tags = (h.get("标签") or "").strip()
    published = (h.get("发表时间") or "").strip()
    extra = _row_extra(source, h)

    return {
        "id": f"{run_id}-{source}-{row_index}",
        "score": score_val,
        "title": "(无标题)" if is_placeholder_value(title) else title,
        "summary": "" if is_placeholder_value(summary) else summary,
        "link": link if is_valid_http_link(link) else None,
        "tags": tags if tags and not is_placeholder_value(tags) else None,
        "publishedAt": published if published and not is_placeholder_value(published) else None,
        "keywords": meta.get("keywords", ""),
        "extra": extra,
    }


def parse_markdown_to_sections(markdown_body: str, run_id: str) -> list[dict[str, Any]]:
    parts = re.split(r"^##\s+", markdown_body, flags=re.M)
    sections: list[dict[str, Any]] = []
    for part in parts:
        if not part.strip():
            continue
        line_end = part.find("\n")
        heading = (part[:line_end] if line_end != -1 else part).strip()
        body = part[line_end + 1 :] if line_end != -1 else ""
        source = SOURCE_BY_HEADING.get(heading)
        if not source:
            continue
        meta = parse_meta(body)
        summary = extract_section_summary(body)
        headers, rows = parse_table(body)
        entries: list[dict[str, Any]] = []
        if headers:
            for idx, cells in enumerate(rows):
                e = row_to_entry(headers, cells, source, meta, run_id, idx)
                if e:
                    entries.append(e)
        entries = dedupe_entries_by_link(entries)
        sections.append(
            {
                "source": source,
                "heading": heading,
                "summary": summary,
                "keywords": meta["keywords"],
                "dateStart": meta["dateStart"],
                "dateEnd": meta["dateEnd"],
                "entryCount": len(entries),
                "entries": entries,
            }
        )
    return sections


def compute_stats(sections: list[dict[str, Any]]) -> dict[str, Any]:
    source_counts: dict[str, int] = {}
    empty_sections: list[str] = []
    total = 0
    for sec in sections:
        n = sec.get("entryCount", 0)
        total += n
        src = sec["source"]
        if n > 0:
            source_counts[src] = source_counts.get(src, 0) + n
        else:
            empty_sections.append(src)
    return {
        "entryCount": total,
        "sourceCounts": source_counts,
        "emptySections": empty_sections,
    }
