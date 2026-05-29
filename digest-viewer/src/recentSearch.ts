const STORAGE_KEY = "digest-viewer-recent-q";
const MAX = 8;

export function loadRecentQueries(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.filter((x) => typeof x === "string" && x.trim()).slice(0, MAX);
  } catch {
    return [];
  }
}

export function pushRecentQuery(q: string): string[] {
  const t = q.trim();
  if (!t) return loadRecentQueries();
  const prev = loadRecentQueries().filter((x) => x !== t);
  const next = [t, ...prev].slice(0, MAX);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}
