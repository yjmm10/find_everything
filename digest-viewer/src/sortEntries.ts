import type { DigestEntry } from "./types";
import { effectivePublishedDay } from "./filterUtils";

export type SortKey = "score" | "published" | "title";

export const SORT_LABEL: Record<SortKey, string> = {
  score: "评分",
  published: "发表日",
  title: "标题",
};

export function entrySortDate(e: DigestEntry): string {
  const pub = effectivePublishedDay(e) ?? e.publishedAt?.slice(0, 10) ?? "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(pub)) return pub;
  return e.dateStart || e.crawlDate || "";
}

export function sortEntries(list: DigestEntry[], sort: SortKey): DigestEntry[] {
  const out = [...list];
  out.sort((a, b) => {
    if (sort === "score") {
      const sa = a.score == null ? -Infinity : Number(a.score);
      const sb = b.score == null ? -Infinity : Number(b.score);
      if (sb !== sa) return sb - sa;
      return a.title.localeCompare(b.title, "zh-CN");
    }
    if (sort === "published") {
      const da = entrySortDate(a);
      const db = entrySortDate(b);
      if (da !== db) return db.localeCompare(da);
      const sa = a.score == null ? -Infinity : Number(a.score);
      const sb = b.score == null ? -Infinity : Number(b.score);
      return sb - sa;
    }
    return a.title.localeCompare(b.title, "zh-CN");
  });
  return out;
}
