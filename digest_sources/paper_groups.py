"""多组关键词论文结果：分组块格式、截断与提示词排版（Arxiv / Semantic Scholar / OpenAlex 共用）。"""

from __future__ import annotations


def is_grouped_paper_blocks(items: list, *, group_key: str, papers_key: str) -> bool:
    return (
        bool(items)
        and isinstance(items[0], dict)
        and group_key in items[0]
        and papers_key in items[0]
    )


def apply_max_results_total(
    blocks: list[dict],
    cap_raw,
    *,
    papers_key: str,
) -> list[dict]:
    if cap_raw is None:
        return blocks
    cap = int(cap_raw)
    if cap < 0:
        return blocks
    out: list[dict] = []
    used = 0
    for blk in blocks:
        if used >= cap:
            break
        papers = list(blk.get(papers_key) or [])
        room = cap - used
        slice_p = papers[:room]
        out.append({**blk, papers_key: slice_p})
        used += len(slice_p)
    return out


def format_papers_for_prompt(papers: list) -> str:
    lines: list[str] = []
    for i, p in enumerate(papers, 1):
        if not isinstance(p, dict):
            lines.append(f"  {i}. {p!r}")
            continue
        pd = p.get("published_date") or "-"
        venue = p.get("venue") or p.get("source") or "-"
        cites = p.get("citation_count")
        cite_s = str(cites) if cites is not None else "-"
        lines.append(
            f"  {i}. 标题: {p.get('title', '')}\n"
            f"     发表日期: {pd}\n"
            f"     来源/venue: {venue}\n"
            f"     引用数: {cite_s}\n"
            f"     作者: {p.get('authors', '')}\n"
            f"     摘要: {p.get('summary', '')}\n"
            f"     链接: {p.get('link', '')}"
        )
    return "\n".join(lines)


def format_grouped_for_prompt(
    items: list,
    *,
    group_key: str,
    papers_key: str,
) -> str:
    if not items:
        return "(无)"
    if is_grouped_paper_blocks(items, group_key=group_key, papers_key=papers_key):
        parts: list[str] = []
        for blk in items:
            label = blk.get(group_key, "")
            papers = blk.get(papers_key) or []
            body = format_papers_for_prompt(papers)
            parts.append(f"关键词组「{label}」（{len(papers)} 条）:\n{body}")
        return "\n\n".join(parts)
    if isinstance(items[0], dict) and "title" in items[0]:
        return format_papers_for_prompt(items)
    return str(items)
