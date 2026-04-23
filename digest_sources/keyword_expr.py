"""
关键词布尔表达式（各信息源统一）。

扁平语法（无括号、无 and/or/andnot 单词时）：
  - 逗号 `,` / `，`：**或（OR）**，如 `uav, llm` 同 `uav|llm`
  - `|`：或（OR）
  - `&`：与（AND）；**同一 & 段内**逗号仍为或，如 `a&b,c` → `a AND (b OR c)`
  - 行首 `&`：`&a,b` 仍为**与**（显式 AND 分项），用于兼容旧配置

富语法（出现括号，或单词 and / or / andnot 之一时）：
  - 官方风格：`AND` `OR` `ANDNOT`（大小写不敏感）及 `&` `|`
  - 括号分组；逗号与 `|`、` or ` 同为 OR（优先级低于 AND）
  - 多词短语：`(rl|"reinforcement learning")` 或 `(rl|reinforcement learning)`（运算符之间的空格会并入短语）
  - 双引号内内容不做 `|`/`&`/and/or 替换，可用于字面量
  - 全角 `｜` `＆` 会归一为半角

以下写法均等价于 arXiv 关键词段（再包 all: 原子）：
  `(uav OR aerial) AND (vlm OR llm OR mllm) AND (rl)`。

Arxiv：生成 `all:` + `AND` / `OR` / `ANDNOT`。
RSS / GitHub：对 AST 做标题子串匹配或转 GitHub q 片段。
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Union

# ---- AST -----------------------------------------------------------------

Expr = Union["KwTerm", "KwAnd", "KwOr", "KwAndNot"]


@dataclass(frozen=True)
class KwTerm:
    text: str


@dataclass(frozen=True)
class KwAnd:
    parts: tuple[Expr, ...]


@dataclass(frozen=True)
class KwOr:
    parts: tuple[Expr, ...]


@dataclass(frozen=True)
class KwAndNot:
    left: Expr
    right: Expr


def normalize_keyword_operators(s: str) -> str:
    return (s or "").replace("｜", "|").replace("＆", "&")


def _atom_char(c: str) -> bool:
    if not c:
        return False
    return c.isalnum() or ord(c) > 127 or c in ":._-+/@%"


# ANDNOT 必须长于 AND，放最前；\b 避免匹配 orange、android 等词中的子串
_BOOL_KW_AT_POS = re.compile(r"^(ANDNOT|AND|OR)\b", re.I)


def _bool_keyword_len(s: str, k: int) -> int:
    """若 s[k:] 以 ANDNOT/AND/OR 整词开头则返回词长，否则 0。"""
    if k < 0 or k >= len(s):
        return 0
    m = _BOOL_KW_AT_POS.match(s[k:])
    return m.end() if m else 0


def _read_phrase_or_atom_unquoted(s: str, i: int) -> tuple[str, int]:
    """
    读取未加引号的检索词；允许词内空格连成短语（如 reinforcement learning），
    遇 `)` `,` 或下一个 OR/AND/ANDNOT 整词前停止。
    """
    n = len(s)
    j = i
    if j >= n or not _atom_char(s[j]):
        return "", i
    buf: list[str] = []
    while True:
        while j < n and _atom_char(s[j]):
            buf.append(s[j])
            j += 1
        if j >= n or s[j] in "),，":
            break
        if not s[j].isspace():
            break
        k = j
        while k < n and s[k].isspace():
            k += 1
        if k >= n:
            break
        if _bool_keyword_len(s, k):
            break
        if k < n and _atom_char(s[k]):
            buf.append(" ")
            j = k
            continue
        break
    return ("".join(buf), j)


def _legacy_prefix_and_clause(t: str) -> list[list[str]]:
    inner = t[1:].strip()
    terms = [p.strip() for p in re.split(r"[,，]+", inner) if p.strip()]
    return [terms] if terms else []


def _legacy_ampersand_segments_to_ast(t: str) -> Expr | None:
    """
    按 `&` 拆成若干段，段与段为 AND；段内逗号为 OR。
    用于扁平串中含 `&` 且无括号富解析时。
    """
    segs = [p.strip() for p in t.split("&") if p.strip()]
    if not segs:
        return None
    parts: list[Expr] = []
    for seg in segs:
        terms = [q.strip() for q in re.split(r"[,，]+", seg) if q.strip()]
        if not terms:
            continue
        if len(terms) == 1:
            parts.append(KwTerm(terms[0]))
        else:
            parts.append(KwOr(tuple(KwTerm(w) for w in terms)))
    if not parts:
        return None
    if len(parts) == 1:
        return parts[0]
    return KwAnd(tuple(parts))


def _legacy_parse_flat(t: str) -> Expr | None:
    """扁平串 → AST；t 已 normalize_keyword_operators 且非行首 & 前缀。"""
    if not t:
        return None
    if "|" in t:
        branches: list[Expr] = []
        for br in t.split("|"):
            br = br.strip()
            if not br:
                continue
            if "&" in br:
                sub = _legacy_ampersand_segments_to_ast(br)
                if sub is not None:
                    branches.append(sub)
            else:
                terms = [p.strip() for p in re.split(r"[,，]+", br) if p.strip()]
                if not terms:
                    continue
                if len(terms) == 1:
                    branches.append(KwTerm(terms[0]))
                else:
                    branches.append(KwOr(tuple(KwTerm(w) for w in terms)))
        if not branches:
            return None
        acc = branches[0]
        for b in branches[1:]:
            acc = _merge_or(acc, b)
        return acc
    if "&" in t:
        return _legacy_ampersand_segments_to_ast(t)
    terms = [p.strip() for p in re.split(r"[,，]+", t) if p.strip()]
    if len(terms) > 1:
        return KwOr(tuple(KwTerm(w) for w in terms))
    return KwTerm(t) if t else None


def _needs_rich_parser(t: str) -> bool:
    """
    仅在有括号或英文布尔单词时使用富解析。
    纯 `&`、`|`、逗号走扁平规则，否则 `a&b,c` 会先被展开成 `a AND b OR c` 而错解为 (a AND b) OR c。
    """
    if "(" in t or ")" in t:
        return True
    return bool(re.search(r"(?i)\b(and|or|andnot)\b", t))


def _preprocess_boolean_segment(chunk: str) -> str:
    """对非引号区段做运算符规范化。"""
    if not chunk:
        return chunk
    t = chunk
    t = re.sub(r"(?i)\bandnot\b", " ANDNOT ", t)
    t = re.sub(r"(?i)\band\b", " AND ", t)
    t = re.sub(r"(?i)\bor\b", " OR ", t)
    t = t.replace("&", " AND ")
    t = t.replace("|", " OR ")
    return t


def _preprocess_boolean(t: str) -> str:
    """
    双引号内原文保留（其中的 |、&、and/or 不会被替换成布尔关键字），
    引号外仍做 &| 与 and/or/andnot 规范化。
    """
    t = normalize_keyword_operators(t.strip())
    out: list[str] = []
    i, n = 0, len(t)
    while i < n:
        if t[i] == '"':
            out.append('"')
            i += 1
            while i < n:
                if t[i] == "\\" and i + 1 < n:
                    out.append(t[i : i + 2])
                    i += 2
                    continue
                out.append(t[i])
                if t[i] == '"':
                    i += 1
                    break
                i += 1
            continue
        j = i
        while j < n and t[j] != '"':
            j += 1
        out.append(_preprocess_boolean_segment(t[i:j]))
        i = j
    s = "".join(out)
    return re.sub(r"\s+", " ", s).strip()


def _tokenize_boolean(s: str) -> list[tuple]:
    """逗号一律为 OR（与 `|` / or 一致），优先级由解析器（AND 高于 OR）处理。"""
    out: list[tuple] = []
    i, n = 0, len(s)
    while i < n:
        c = s[i]
        if c.isspace():
            i += 1
            continue
        if c == "(":
            out.append(("LPAREN",))
            i += 1
            continue
        if c == ")":
            out.append(("RPAREN",))
            i += 1
            continue
        if c in ",，":
            out.append(("COMMA_OR",))
            i += 1
            continue
        kwlen = _bool_keyword_len(s, i)
        if kwlen:
            kw = s[i : i + kwlen].upper()
            if kw == "AND":
                out.append(("AND",))
            elif kw == "OR":
                out.append(("OR",))
            else:
                out.append(("ANDNOT",))
            i += kwlen
            continue
        if c == '"':
            i += 1
            pieces: list[str] = []
            while i < n:
                if s[i] == "\\" and i + 1 < n:
                    pieces.append(s[i + 1])
                    i += 2
                    continue
                if s[i] == '"':
                    i += 1
                    break
                pieces.append(s[i])
                i += 1
            else:
                raise ValueError("关键词表达式中有未闭合的双引号")
            out.append(("ATOM", "".join(pieces)))
            continue
        word, j = _read_phrase_or_atom_unquoted(s, i)
        if not word:
            raise ValueError(f"无法解析的关键词字符: {s[i:i+20]!r}")
        i = j
        out.append(("ATOM", word))
    out.append(("EOF",))
    return out


def _merge_and(a: Expr, b: Expr) -> Expr:
    parts: list[Expr] = []
    for x in (a, b):
        if isinstance(x, KwAnd):
            parts.extend(x.parts)
        else:
            parts.append(x)
    return KwAnd(tuple(parts)) if len(parts) > 1 else parts[0]


def _merge_or(a: Expr, b: Expr) -> Expr:
    parts: list[Expr] = []
    for x in (a, b):
        if isinstance(x, KwOr):
            parts.extend(x.parts)
        else:
            parts.append(x)
    return KwOr(tuple(parts)) if len(parts) > 1 else parts[0]


class _BoolParser:
    def __init__(self, tokens: list[tuple]) -> None:
        self.toks = tokens
        self.pos = 0

    def _peek(self) -> tuple:
        return self.toks[self.pos]

    def _eat(self) -> tuple:
        t = self._peek()
        self.pos += 1
        return t

    def parse(self) -> Expr:
        r = self._parse_disj()
        if self._peek()[0] != "EOF":
            raise ValueError("关键词表达式有多余记号")
        return r

    def _parse_disj(self) -> Expr:
        left = self._parse_conj()
        while True:
            k = self._peek()[0]
            if k in ("OR", "COMMA_OR"):
                self._eat()
                right = self._parse_conj()
                left = _merge_or(left, right)
            else:
                break
        return left

    def _parse_conj(self) -> Expr:
        left = self._parse_andnot_chain()
        while True:
            k = self._peek()[0]
            if k == "AND":
                self._eat()
                right = self._parse_andnot_chain()
                left = _merge_and(left, right)
            else:
                break
        return left

    def _parse_andnot_chain(self) -> Expr:
        left = self._parse_primary()
        while self._peek()[0] == "ANDNOT":
            self._eat()
            r = self._parse_primary()
            left = KwAndNot(left, r)
        return left

    def _parse_primary(self) -> Expr:
        k = self._peek()[0]
        if k == "LPAREN":
            self._eat()
            inner = self._parse_disj()
            if self._peek()[0] != "RPAREN":
                raise ValueError("关键词表达式缺少右括号")
            self._eat()
            return inner
        if k == "ATOM":
            tok = self._eat()
            return KwTerm(tok[1])
        if k == "RPAREN":
            raise ValueError("关键词表达式出现多余的右括号")
        raise ValueError(f"关键词表达式此处需要词或左括号，得到 {k}")


def _legacy_clauses_to_ast(clauses: list[list[str]]) -> Expr | None:
    if not clauses:
        return None
    or_parts: list[Expr] = []
    for clause in clauses:
        terms = [w.strip() for w in clause if w and str(w).strip()]
        if not terms:
            continue
        if len(terms) == 1:
            or_parts.append(KwTerm(terms[0]))
        else:
            or_parts.append(KwAnd(tuple(KwTerm(w) for w in terms)))
    if not or_parts:
        return None
    if len(or_parts) == 1:
        return or_parts[0]
    return KwOr(tuple(or_parts))


def parse_keyword_expression(s: str) -> Expr | None:
    """
    解析为布尔 AST；空串 → None。
    """
    t = normalize_keyword_operators((s or "").strip())
    if not t:
        return None
    if t.startswith("&"):
        return _legacy_clauses_to_ast(_legacy_prefix_and_clause(t))
    if not _needs_rich_parser(t):
        return _legacy_parse_flat(t)
    prep = _preprocess_boolean(t)
    toks = _tokenize_boolean(prep)
    return _BoolParser(toks).parse()


def title_matches_keyword_expr(title_lower: str, expr: Expr | None) -> bool:
    """标题已小写；按子串语义匹配各词。"""
    if expr is None:
        return False
    tl = title_lower or ""

    def term_in(t: KwTerm) -> bool:
        return t.text.strip().lower() in tl

    def walk(e: Expr) -> bool:
        if isinstance(e, KwTerm):
            return term_in(e)
        if isinstance(e, KwAnd):
            return all(walk(p) for p in e.parts)
        if isinstance(e, KwOr):
            return any(walk(p) for p in e.parts)
        if isinstance(e, KwAndNot):
            return walk(e.left) and not walk(e.right)
        return False

    return walk(expr)


def arxiv_all_atom(term: str) -> str:
    """单个检索词 → arXiv all: 原子（含短语引号）。"""
    seg = (term or "").strip()
    if not seg:
        return ""
    if re.search(r"\s", seg):
        esc = seg.replace("\\", "\\\\").replace('"', '\\"')
        return f'all:"{esc}"'
    return f"all:{seg}"


def _arxiv_emit(e: Expr, parent: str) -> str:
    """parent: 'or'|'and'|'andnot'|'top' — 决定是否加括号。"""
    if isinstance(e, KwTerm):
        return arxiv_all_atom(e.text)
    if isinstance(e, KwAnd):
        inner = " AND ".join(_arxiv_emit(p, "and") for p in e.parts)
        if parent == "or":
            return "(" + inner + ")"
        # 与旧版一致：顶层「多词纯 AND」输出为 (all:a AND all:b)
        if (
            parent == "top"
            and len(e.parts) > 1
            and all(isinstance(p, KwTerm) for p in e.parts)
        ):
            return "(" + inner + ")"
        return inner
    if isinstance(e, KwOr):
        inner = " OR ".join(_arxiv_emit(p, "or") for p in e.parts)
        if parent in ("and", "andnot"):
            return "(" + inner + ")"
        # 与旧版一致：顶层「多 OR 分支」整体加括号
        if parent == "top" and len(e.parts) > 1:
            return "(" + inner + ")"
        return inner
    if isinstance(e, KwAndNot):
        L = _arxiv_emit(e.left, "andnot")
        R = _arxiv_emit(e.right, "andnot")
        inner = f"{L} ANDNOT {R}"
        if parent in ("and", "or", "andnot"):
            return "(" + inner + ")"
        return inner
    return ""


def keyword_expr_to_arxiv_all_fragment(expr: Expr | None) -> str:
    """
    将布尔 AST 转为 arXiv search_query 中关键词部分（不含 submittedDate）。
    """
    if expr is None:
        return ""
    s = _arxiv_emit(expr, "top")
    return s.strip()


def _github_emit_atom(w: str) -> str:
    w = (w or "").strip()
    if not w:
        return ""
    if re.search(r'[\s"]', w):
        esc = w.replace("\\", "\\\\").replace('"', '\\"')
        return f'"{esc}"'
    return w


def _github_emit(e: Expr, parent: str) -> str:
    if isinstance(e, KwTerm):
        return _github_emit_atom(e.text)
    if isinstance(e, KwAnd):
        inner = " ".join(_github_emit(p, "and") for p in e.parts)
        if parent == "or":
            return "(" + inner + ")"
        return inner
    if isinstance(e, KwOr):
        inner = " OR ".join(_github_emit(p, "or") for p in e.parts)
        if parent in ("and", "andnot"):
            return "(" + inner + ")"
        return inner
    if isinstance(e, KwAndNot):
        L = _github_emit(e.left, "andnot")
        R = _github_emit(e.right, "andnot")
        inner = f"{L} NOT {R}"
        if parent in ("and", "or", "andnot"):
            return "(" + inner + ")"
        return inner
    return ""


def keyword_expr_to_github_repository_q(expr: Expr | None) -> str:
    """
    将 AST 转为 GitHub「仓库搜索」q 中的关键词片段（不含 pushed、language 等限定）。
    """
    if expr is None:
        return ""
    return _github_emit(expr, "top").strip()
