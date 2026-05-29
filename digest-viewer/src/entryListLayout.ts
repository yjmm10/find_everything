import type { EntryLayout } from "./ResultsHeader";

export function entryListClass(layout: EntryLayout): string {
  return layout === "grid" ? "card-list card-list--grid" : "card-list card-list--list";
}
