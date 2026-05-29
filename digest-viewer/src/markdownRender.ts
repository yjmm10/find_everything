/** 轻量 Markdown → HTML（仅支持周报常用结构，无第三方依赖） */
export function simpleMarkdownToHtml(md: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const lines = md.split("\n");
  const out: string[] = [];
  let inTable = false;
  let tableHasHead = false;

  const closeTable = () => {
    if (!inTable) return;
    if (tableHasHead) out.push("</tbody>");
    out.push("</table></div>");
    inTable = false;
    tableHasHead = false;
  };

  for (const line of lines) {
    const t = line.trim();

    if (t.startsWith("# ")) {
      closeTable();
      out.push(`<h1>${esc(t.slice(2))}</h1>`);
      continue;
    }
    if (t.startsWith("## ")) {
      closeTable();
      out.push(`<h2>${esc(t.slice(3))}</h2>`);
      continue;
    }
    if (t.startsWith("### ")) {
      closeTable();
      out.push(`<h3>${esc(t.slice(4))}</h3>`);
      continue;
    }
    if (t.startsWith("> ")) {
      closeTable();
      out.push(`<blockquote>${esc(t.slice(2))}</blockquote>`);
      continue;
    }
    if (t === "---" || t === "***") {
      closeTable();
      out.push("<hr />");
      continue;
    }
    if (t.startsWith("|") && t.endsWith("|")) {
      const cells = t
        .slice(1, -1)
        .split("|")
        .map((c) => c.trim());
      if (cells.every((c) => /^:?-{3,}:?$/.test(c.replace(/\s/g, "")))) continue;

      if (!inTable) {
        inTable = true;
        out.push('<div class="md-render__table-wrap"><table class="md-render__table">');
      }
      if (!tableHasHead) {
        out.push(`<thead><tr>${cells.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>`);
        tableHasHead = true;
      } else {
        out.push(`<tr>${cells.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`);
      }
      continue;
    }

    closeTable();
    if (!t) {
      out.push("");
      continue;
    }
    out.push(`<p>${esc(t)}</p>`);
  }
  closeTable();
  return out.join("\n");
}
