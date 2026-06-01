/** 轻量 Markdown → HTML（与 src/markdownRender.ts 同步，供 RSS 构建使用） */

export function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function inlineMarkdown(text) {
  let s = escapeHtml(text);

  s = s.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    '<a href="$2" target="_blank" rel="noreferrer">$1</a>',
  );

  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");

  s = s.replace(/(?<!["'=])(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, (url) =>
    `<a href="${url}" target="_blank" rel="noreferrer">${url}</a>`,
  );

  return s;
}

export function simpleMarkdownToHtml(md) {
  const lines = md.split("\n");
  const out = [];
  let inTable = false;
  let tableHasHead = false;

  const closeTable = () => {
    if (!inTable) return;
    if (tableHasHead) out.push("</tbody>");
    out.push("</table>");
    inTable = false;
    tableHasHead = false;
  };

  for (const line of lines) {
    const t = line.trim();

    if (t.startsWith("# ")) {
      closeTable();
      out.push(`<h1>${inlineMarkdown(t.slice(2))}</h1>`);
      continue;
    }
    if (t.startsWith("## ")) {
      closeTable();
      out.push(`<h2>${inlineMarkdown(t.slice(3))}</h2>`);
      continue;
    }
    if (t.startsWith("### ")) {
      closeTable();
      out.push(`<h3>${inlineMarkdown(t.slice(4))}</h3>`);
      continue;
    }
    if (t.startsWith("> ")) {
      closeTable();
      out.push(`<blockquote>${inlineMarkdown(t.slice(2))}</blockquote>`);
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
        out.push('<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%">');
      }
      if (!tableHasHead) {
        out.push(
          `<thead><tr>${cells.map((c) => `<th>${inlineMarkdown(c)}</th>`).join("")}</tr></thead><tbody>`,
        );
        tableHasHead = true;
      } else {
        out.push(
          `<tr>${cells.map((c) => `<td>${inlineMarkdown(c)}</td>`).join("")}</tr>`,
        );
      }
      continue;
    }

    closeTable();
    if (!t) {
      out.push("");
      continue;
    }
    out.push(`<p>${inlineMarkdown(t)}</p>`);
  }
  closeTable();
  return out.join("\n");
}
