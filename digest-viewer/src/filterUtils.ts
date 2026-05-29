import { sundayForGithubWeekly } from "./dateUtils";

export type DateFilterMode = "window" | "published" | "crawl";

const GITHUB_WEEKLY_SOURCES = new Set(["github_weekly", "github"]);

export interface EntryForPublishedDay {
  dateStart: string;
  dateEnd: string;
  publishedAt: string | null;
  source?: string;
  crawlDate?: string;
}

/** 日历「发表日」：GitHub 周榜固定为数据窗内周日，其余用 publishedAt */
export function effectivePublishedDay(entry: EntryForPublishedDay): string | null {
  if (entry.source && GITHUB_WEEKLY_SOURCES.has(entry.source)) {
    const sun = sundayForGithubWeekly(entry.dateStart, entry.dateEnd);
    if (sun) return sun;
  }
  const pub = entry.publishedAt?.slice(0, 10) ?? "";
  return /^\d{4}-\d{2}-\d{2}$/.test(pub) ? pub : null;
}

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

export interface EntryForDayFilter extends EntryForPublishedDay {}

const DATE_FILTER_LABEL: Record<DateFilterMode, string> = {
  window: "数据窗（整周）",
  published: "发表/发布日（周榜=周日）",
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
    const pub = effectivePublishedDay(entry);
    return pub === day;
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
    const pub = effectivePublishedDay(entry);
    if (!pub) return false;
    return pub >= (from || "0000-01-01") && pub <= (to || "9999-12-31");
  }
  if (mode === "crawl") {
    const c = entry.crawlDate ?? "";
    if (!c) return false;
    return c >= (from || "0000-01-01") && c <= (to || "9999-12-31");
  }
  return true;
}
