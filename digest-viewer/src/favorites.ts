const STORAGE_KEY = "digest-viewer-favorites";

export function loadFavoriteIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x) => typeof x === "string"));
  } catch {
    return new Set();
  }
}

export function saveFavoriteIds(ids: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}

export function toggleFavoriteId(id: string): Set<string> {
  const next = loadFavoriteIds();
  if (next.has(id)) next.delete(id);
  else next.add(id);
  saveFavoriteIds(next);
  return next;
}
