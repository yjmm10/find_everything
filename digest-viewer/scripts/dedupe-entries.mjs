/**
 * 按规范化链接去重（单期 run 内默认去重；global 时跨期合并，保留时间最早的一条）。
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

/** 用于「保留最早」：发表日 → 抓取日 → runId 内时间戳 */
export function entryEarliestKey(entry) {
  const pub = entry.publishedAt?.slice(0, 10) ?? "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(pub)) return pub;
  const crawl = entry.crawlDate ?? "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(crawl)) return crawl;
  const m = String(entry.digestSlug ?? "").match(/_(\d{4})(\d{2})(\d{2})T(\d{6})Z$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4]}`;
  return String(entry.digestSlug ?? "");
}

function compareEarliest(a, b) {
  const ka = entryEarliestKey(a);
  const kb = entryEarliestKey(b);
  if (ka !== kb) return ka < kb ? -1 : 1;
  return String(a.digestSlug ?? "").localeCompare(String(b.digestSlug ?? ""));
}

/**
 * @param {Array<{ link?: string | null, digestSlug?: string, title?: string, source?: string }>} entries
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

/**
 * 跨期按链接去重，保留时间最早的一条。
 * @param {Array} entries
 */
export function dedupeEntriesGlobalKeepEarliest(entries) {
  const byLink = new Map();
  const noLink = [];
  let removed = 0;

  for (const e of entries) {
    const key = normalizeLink(e.link);
    if (!key) {
      noLink.push(e);
      continue;
    }
    const prev = byLink.get(key);
    if (!prev) {
      byLink.set(key, e);
      continue;
    }
    removed += 1;
    if (compareEarliest(e, prev) < 0) {
      byLink.set(key, e);
    }
  }

  return { entries: [...byLink.values(), ...noLink], removed };
}

export function compareScoreDesc(a, b) {
  const sa = a.score == null ? -Infinity : Number(a.score);
  const sb = b.score == null ? -Infinity : Number(b.score);
  if (sb !== sa) return sb - sa;
  return String(a.title ?? "").localeCompare(String(b.title ?? ""), "zh-CN");
}
