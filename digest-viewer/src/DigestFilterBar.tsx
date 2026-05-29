import type { DigestSource } from "./types";
import { type DateFilterMode, dateFilterModeLabel } from "./filterUtils";

const SOURCE_CHIP: { id: DigestSource; label: string; title: string }[] = [
  { id: "arxiv", label: "Arxiv", title: "Arxiv 论文" },
  { id: "semantic_scholar", label: "S2", title: "Semantic Scholar" },
  { id: "openalex", label: "OpenAlex", title: "OpenAlex" },
  { id: "rss", label: "RSS", title: "RSS 资讯" },
  { id: "github_weekly", label: "GH 周榜", title: "GitHub Trending 周榜（不过滤）" },
  { id: "github_search", label: "GH 检索", title: "GitHub 指定日期检索" },
];

export interface DigestFilterBarProps {
  keyword: string;
  onKeywordChange: (v: string) => void;
  selectedDigestSlug: string;
  digestOptions: { slug: string; label: string }[];
  onDigestChange: (slug: string) => void;
  dateFilterMode: DateFilterMode;
  onDateFilterModeChange: (mode: DateFilterMode) => void;
  dateFrom: string;
  dateTo: string;
  onDateRangeChange: (from: string, to: string) => void;
  sources: Record<DigestSource, boolean>;
  onToggleSource: (s: DigestSource) => void;
  filteredCount: number;
  totalCount: number;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  /** 日历选日时锁定为发表日模式 */
  calendarDay?: string | null;
}

export default function DigestFilterBar({
  keyword,
  onKeywordChange,
  selectedDigestSlug,
  digestOptions,
  onDigestChange,
  dateFilterMode,
  onDateFilterModeChange,
  dateFrom,
  dateTo,
  onDateRangeChange,
  sources,
  onToggleSource,
  filteredCount,
  totalCount,
  hasActiveFilters,
  onClearFilters,
  calendarDay = null,
}: DigestFilterBarProps) {
  const calendarLocked = Boolean(calendarDay);
  return (
    <section className="filter-bar" aria-label="筛选">
      <div className="filter-bar__row">
        <label className="filter-bar__search">
          <span className="visually-hidden">关键字</span>
          <input
            type="search"
            className="filter-bar__input"
            placeholder="搜索标题、说明、标签…"
            value={keyword}
            onChange={(e) => onKeywordChange(e.target.value)}
            autoComplete="off"
          />
        </label>
        <label className="filter-bar__field">
          <span className="filter-bar__label">期次</span>
          <select
            className="filter-bar__select"
            value={selectedDigestSlug}
            onChange={(e) => onDigestChange(e.target.value)}
          >
            <option value="">全部</option>
            {digestOptions.map((d) => (
              <option key={d.slug} value={d.slug}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-bar__field">
          <span className="filter-bar__label">时间</span>
          <select
            className="filter-bar__select filter-bar__select--mode"
            value={calendarLocked ? "published" : dateFilterMode}
            onChange={(e) => onDateFilterModeChange(e.target.value as DateFilterMode)}
            title={calendarLocked ? "日历选日固定为发表/周榜日" : dateFilterModeLabel(dateFilterMode)}
            disabled={calendarLocked}
          >
            <option value="window">数据窗</option>
            <option value="published">发表日</option>
            <option value="crawl">抓取日</option>
          </select>
        </label>
        <div className="filter-bar__dates">
          <input
            type="date"
            className="filter-bar__date"
            value={dateFrom}
            onChange={(e) => onDateRangeChange(e.target.value, dateTo)}
            aria-label="起始日期"
          />
          <span className="filter-bar__date-sep">—</span>
          <input
            type="date"
            className="filter-bar__date"
            value={dateTo}
            onChange={(e) => onDateRangeChange(dateFrom, e.target.value)}
            aria-label="结束日期"
          />
        </div>
      </div>

      <div className="filter-bar__row filter-bar__row--sources">
        <span className="filter-bar__label filter-bar__label--inline">来源</span>
        <div className="filter-bar__chips" role="group" aria-label="信息源">
          {SOURCE_CHIP.map(({ id, label, title }) => (
            <button
              key={id}
              type="button"
              className={`chip chip--sm ${sources[id] ? "chip--on" : ""} chip--${id}`}
              onClick={() => onToggleSource(id)}
              aria-pressed={sources[id]}
              title={title}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="filter-bar__stats">
          <span className="filter-bar__count">
            <strong>{filteredCount}</strong> / {totalCount}
          </span>
          {hasActiveFilters && (
            <button type="button" className="filter-bar__clear" onClick={onClearFilters}>
              清除筛选
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

export { SOURCE_CHIP };
