/**
 * 按规范化链接去重（单期 run 内默认去重；global 时跨期合并去重）。
 */

export function normalizeLink(link) {
  const raw = link == null ? "" : String(link).trim();
  if (!raw) return "";
  try {
    const u = new URL(raw);
    u.hash = "";
    u.search = "";
    let host = u.hostname.toLowerCase().replace(/^www\./, "");
    let pathname = u.pathname.replace(/\/+$/, "") || "";
    if (host === "github.com" && pathname.toLowerCase().endsWith(".git")) {
      pathname = pathname.slice(0, -4);
    }
    return `${u.protocol}//${host}${pathname}`.toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

/**
 * @param {Array<{ link?: string | null, digestSlug?: string }>} entries
 * @param {{ global?: boolean, digestSlug?: string }} opts
 */
export function dedupeEntriesByLink(entries, opts = {}) {
  const { global = false, digestSlug } = opts;
  const seen = new Set();
  const out = [];
  let removed = 0;
  for (const e of entries) {
    const key = normalizeLink(e.link);
    if (!key) {
      out.push(e);
      continue;
    }
    const scopeKey = global ? key : `${e.digestSlug ?? digestSlug ?? ""}\0${key}`;
    if (seen.has(scopeKey)) {
      removed += 1;
      continue;
    }
    seen.add(scopeKey);
    out.push(e);
  }
  return { entries: out, removed };
}
