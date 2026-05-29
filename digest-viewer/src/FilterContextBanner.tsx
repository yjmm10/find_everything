import type { DigestSource } from "./types";
import { dateFilterModeLabel, type DateFilterMode } from "./filterUtils";

const SOURCE_SHORT: Partial<Record<DigestSource, string>> = {
  arxiv: "Arxiv",
  semantic_scholar: "S2",
  openalex: "OpenAlex",
  rss: "RSS",
  github_weekly: "GH周榜",
  github_search: "GH检索",
};

export interface FilterContextBannerProps {
  calendarDay: string | null;
  keyword: string;
  selectedDigestLabel: string;
  dateFilterMode: DateFilterMode;
  sourceCounts: Partial<Record<DigestSource, number>>;
  filteredCount: number;
  onClearCalendar: () => void;
  onClearKeyword: () => void;
  onClearDigest: () => void;
}

export default function FilterContextBanner({
  calendarDay,
  keyword,
  selectedDigestLabel,
  dateFilterMode,
  sourceCounts,
  filteredCount,
  onClearCalendar,
  onClearKeyword,
  onClearDigest,
}: FilterContextBannerProps) {
  const hasContext = calendarDay || keyword.trim() || selectedDigestLabel;
  if (!hasContext) return null;

  const sourceBits = (Object.entries(sourceCounts) as [DigestSource, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([s, n]) => `${SOURCE_SHORT[s] ?? s} ${n}`)
    .join(" · ");

  return (
    <div className="filter-context" role="status">
      <div className="filter-context__main">
        {calendarDay && (
          <span className="filter-context__chip filter-context__chip--accent">
            日历 {calendarDay}
            <button type="button" className="filter-context__x" onClick={onClearCalendar} aria-label="清除日历">
              ×
            </button>
          </span>
        )}
        {keyword.trim() && (
          <span className="filter-context__chip">
            关键词「{keyword.trim()}」
            <button type="button" className="filter-context__x" onClick={onClearKeyword} aria-label="清除关键词">
              ×
            </button>
          </span>
        )}
        {selectedDigestLabel && (
          <span className="filter-context__chip">
            期次 {selectedDigestLabel}
            <button type="button" className="filter-context__x" onClick={onClearDigest} aria-label="清除期次">
              ×
            </button>
          </span>
        )}
      </div>
      <p className="filter-context__meta">
        <strong>{filteredCount}</strong> 条
        {calendarDay ? " · 按发表/周榜日筛选" : ` · ${dateFilterModeLabel(dateFilterMode)}`}
        {sourceBits ? ` · ${sourceBits}` : ""}
        <span className="filter-context__sort"> · 按评分降序</span>
      </p>
    </div>
  );
}
