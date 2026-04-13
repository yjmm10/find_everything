"""
关键词布尔表达式（各信息源统一）：

  - `|` 或（OR）：`uav|llm`
  - 纯逗号（无 `|`、无 `&`）：**与（AND）**，与 `uav&llm`、`&uav,llm` 等价，如 `uav, llm`
  - `&` 显式与：`uav&llm`（与逗号分项组合规则相同）
  - `&a,b,c`：行首 `&` 时逗号为 AND 分项，等价于 `a&b&c`

`|` 先拆成若干 OR 分支；每个分支内用 `&` 或逗号合并为 AND 词表。

全角 `｜` `＆` 会归一为半角。

Arxiv：生成 `all:` + `AND` / `OR`。
RSS / GitHub：任一 AND 子句全词命中即算匹配（OR-of-AND）。
"""

from __future__ import annotations

import re


def normalize_keyword_operators(s: str) -> str:
    return (s or "").replace("｜", "|").replace("＆", "&")


def _parse_and_clause(segment: str) -> list[str]:
    """仅处理含 `&` 的片段：`&` 为 AND，每段内逗号再拆为 AND 分项。"""
    s = segment.strip()
    if not s:
        return []
    out: list[str] = []
    for p in s.split("&"):
        p = p.strip()
        if not p:
            continue
        subs = [q.strip() for q in re.split(r"[,，]+", p) if q.strip()]
        if len(subs) > 1:
            out.extend(subs)
        else:
            out.append(p)
    return out


def parse_keyword_expression(s: str) -> list[list[str]]:
    """
    解析为 OR-of-AND：外层列表为 OR，每项为 AND 词列表。
    空串 → []。
    """
    t = normalize_keyword_operators((s or "").strip())
    if not t:
        return []

    # 前缀 &：整段逗号分隔为单一 AND 子句
    if t.startswith("&"):
        inner = t[1:].strip()
        terms = [p.strip() for p in re.split(r"[,，]+", inner) if p.strip()]
        return [terms] if terms else []

    if "|" in t:
        clauses: list[list[str]] = []
        for br in t.split("|"):
            br = br.strip()
            if not br:
                continue
            if "&" in br:
                c = _parse_and_clause(br)
                if c:
                    clauses.append(c)
            else:
                terms = [p.strip() for p in re.split(r"[,，]+", br) if p.strip()]
                if terms:
                    clauses.append(terms)
        return clauses

    if "&" in t:
        c = _parse_and_clause(t)
        return [c] if c else []

    # 仅逗号：AND（与 uav&llm 等价）
    terms = [p.strip() for p in re.split(r"[,，]+", t) if p.strip()]
    if len(terms) > 1:
        return [terms]
    return [[t]] if t else []


def title_matches_keyword_expr(title_lower: str, expr: list[list[str]]) -> bool:
    """标题已小写；命中任一 AND 子句（子句内全词均为子串）则 True。"""
    if not expr:
        return False
    tl = title_lower or ""
    for clause in expr:
        if not clause:
            continue
        if all((w.strip().lower() in tl) for w in clause if w.strip()):
            return True
    return False


def arxiv_all_atom(term: str) -> str:
    """单个检索词 → arXiv all: 原子（含短语引号）。"""
    seg = (term or "").strip()
    if not seg:
        return ""
    if re.search(r"\s", seg):
        esc = seg.replace("\\", "\\\\").replace('"', '\\"')
        return f'all:"{esc}"'
    return f"all:{seg}"


def keyword_expr_to_arxiv_all_fragment(expr: list[list[str]]) -> str:
    """
    将 OR-of-AND 转为 arXiv search_query 中关键词部分（不含 submittedDate）。
    """
    if not expr:
        return ""
    or_parts: list[str] = []
    for clause in expr:
        atoms = [arxiv_all_atom(w) for w in clause if w and str(w).strip()]
        atoms = [a for a in atoms if a]
        if not atoms:
            continue
        if len(atoms) == 1:
            or_parts.append(atoms[0])
        else:
            or_parts.append("(" + " AND ".join(atoms) + ")")
    if not or_parts:
        return ""
    if len(or_parts) == 1:
        return or_parts[0]
    return "(" + " OR ".join(or_parts) + ")"


def keyword_expr_to_github_repository_q(expr: list[list[str]]) -> str:
    """
    将 OR-of-AND 转为 GitHub「仓库搜索」q 中的关键词片段（不含 pushed、language 等限定）。
    空格为 AND；多 OR 分支用括号分组。
    """
    if not expr:
        return ""
    or_parts: list[str] = []
    multi_or = len(expr) > 1
    for clause in expr:
        tokens: list[str] = []
        for w in clause:
            w = (w or "").strip()
            if not w:
                continue
            if re.search(r'[\s"]', w):
                esc = w.replace("\\", "\\\\").replace('"', '\\"')
                tokens.append(f'"{esc}"')
            else:
                tokens.append(w)
        if not tokens:
            continue
        inner = " ".join(tokens)
        or_parts.append(f"({inner})" if multi_or else inner)
    if not or_parts:
        return ""
    if len(or_parts) == 1:
        return or_parts[0]
    return " OR ".join(or_parts)
