export type DateFilterMode = "window" | "published" | "crawl";

export function overlapsRange(
  start: string,
  end: string,
  filterFrom: string,
  filterTo: string,
): boolean {
  if (!filterFrom && !filterTo) return true;
  if (!start || !end) return true;
  const fs = filterFrom || "0000-01-01";
  const fe = filterTo || "9999-12-31";
  return start <= fe && end >= fs;
}

export interface EntryForDayFilter {
  dateStart: string;
  dateEnd: string;
  publishedAt: string | null;
  crawlDate?: string;
}

const DATE_FILTER_LABEL: Record<DateFilterMode, string> = {
  window: "数据窗（整周）",
  published: "发表/发布日（按日）",
  crawl: "抓取执行日",
};

export function dateFilterModeLabel(mode: DateFilterMode): string {
  return DATE_FILTER_LABEL[mode];
}

/** 日历/单日筛选：published 模式可定位到具体某一天的内容 */
export function entryMatchesDay(
  entry: EntryForDayFilter,
  day: string,
  mode: DateFilterMode,
): boolean {
  if (!day) return true;
  if (mode === "window") {
    return overlapsRange(entry.dateStart, entry.dateEnd, day, day);
  }
  if (mode === "published") {
    const pub = entry.publishedAt?.slice(0, 10) ?? "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(pub)) return pub === day;
    return false;
  }
  if (mode === "crawl") {
    return (entry.crawlDate ?? "") === day;
  }
  return true;
}

export function entryMatchesDateRange(
  entry: EntryForDayFilter,
  from: string,
  to: string,
  mode: DateFilterMode,
): boolean {
  if (!from && !to) return true;
  const dayFrom = from || to;
  const dayTo = to || from;
  if (dayFrom === dayTo) {
    return entryMatchesDay(entry, dayFrom, mode);
  }
  if (mode === "window") {
    return overlapsRange(entry.dateStart, entry.dateEnd, from, to);
  }
  if (mode === "published") {
    const pub = entry.publishedAt?.slice(0, 10) ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(pub)) return false;
    return pub >= (from || "0000-01-01") && pub <= (to || "9999-12-31");
  }
  if (mode === "crawl") {
    const c = entry.crawlDate ?? "";
    if (!c) return false;
    return c >= (from || "0000-01-01") && c <= (to || "9999-12-31");
  }
  return true;
}
