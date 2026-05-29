import type { DateFilterMode } from "./filterUtils";
import type { SortKey } from "./sortEntries";

export interface FilterUrlState {
  q: string;
  day: string;
  digest: string;
  sort: SortKey;
  mode: DateFilterMode;
  fav: boolean;
  group: boolean;
  layout: "list" | "grid";
}

const DEFAULT: FilterUrlState = {
  q: "",
  day: "",
  digest: "",
  sort: "score",
  mode: "window",
  fav: false,
  group: false,
  layout: "list",
};

export function parseFilterFromUrl(): Partial<FilterUrlState> {
  const p = new URLSearchParams(window.location.search);
  const out: Partial<FilterUrlState> = {};
  const q = p.get("q");
  if (q) out.q = q;
  const day = p.get("day");
  if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) out.day = day;
  const digest = p.get("digest");
  if (digest) out.digest = digest;
  const sort = p.get("sort");
  if (sort === "score" || sort === "published" || sort === "title") out.sort = sort;
  const mode = p.get("mode");
  if (mode === "window" || mode === "published" || mode === "crawl") out.mode = mode;
  if (p.get("fav") === "1") out.fav = true;
  if (p.get("group") === "1") out.group = true;
  const layout = p.get("layout");
  if (layout === "list" || layout === "grid") out.layout = layout;
  return out;
}

export function buildFilterSearchParams(state: FilterUrlState): URLSearchParams {
  const p = new URLSearchParams();
  if (state.q.trim()) p.set("q", state.q.trim());
  if (state.day) p.set("day", state.day);
  if (state.digest) p.set("digest", state.digest);
  if (state.sort !== DEFAULT.sort) p.set("sort", state.sort);
  if (state.mode !== DEFAULT.mode) p.set("mode", state.mode);
  if (state.fav) p.set("fav", "1");
  if (state.group) p.set("group", "1");
  if (state.layout !== DEFAULT.layout) p.set("layout", state.layout);
  return p;
}

export function syncFilterToUrl(state: FilterUrlState): void {
  const p = buildFilterSearchParams(state);
  const qs = p.toString();
  const url = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
  window.history.replaceState(null, "", url);
}

export function copyShareUrl(state: FilterUrlState): string {
  const p = buildFilterSearchParams(state);
  const qs = p.toString();
  const hash = window.location.hash || "";
  return `${window.location.origin}${window.location.pathname}${qs ? `?${qs}` : ""}${hash}`;
}
