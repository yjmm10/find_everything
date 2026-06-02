import { useRef, useState } from "react";
import type { DigestSource } from "./types";
import { type DateFilterMode, dateFilterModeLabel } from "./filterUtils";
import type { SortKey } from "./sortEntries";
import { SORT_LABEL } from "./sortEntries";

const SOURCE_CHIP: { id: DigestSource; label: string; title: string }[] = [
  { id: "arxiv", label: "Arxiv", title: "Arxiv 论文" },
  { id: "semantic_scholar", label: "S2", title: "Semantic Scholar" },
  { id: "openalex", label: "OpenAlex", title: "OpenAlex" },
  { id: "rss", label: "RSS", title: "RSS 资讯" },
  { id: "github_weekly", label: "GH 周榜", title: "GitHub Trending 周榜" },
  { id: "github_search", label: "GH 检索", title: "GitHub 指定日期检索" },
];

export interface DigestFilterBarProps {
  keyword: string;
  onKeywordChange: (v: string) => void;
  onKeywordCommit?: (v: string) => void;
  recentQueries?: string[];
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
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
  sortKey: SortKey;
  onSortChange: (k: SortKey) => void;
  favOnly: boolean;
  onFavOnlyChange: (v: boolean) => void;
  favoriteCount: number;
  onShareLink: () => void;
  onExportList: () => void;
  shareHint?: string;
  filteredCount: number;
  totalCount: number;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  calendarDay?: string | null;
}

export default function DigestFilterBar({
  keyword,
  onKeywordChange,
  onKeywordCommit,
  recentQueries = [],
  searchInputRef,
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
  sortKey,
  onSortChange,
  favOnly,
  onFavOnlyChange,
  favoriteCount,
  onShareLink,
  onExportList,
  shareHint,
  filteredCount,
  totalCount,
  hasActiveFilters,
  onClearFilters,
  calendarDay = null,
}: DigestFilterBarProps) {
  const calendarLocked = Boolean(calendarDay);
  const [showRecent, setShowRecent] = useState(false);
  const localRef = useRef<HTMLInputElement>(null);
  const inputRef = searchInputRef ?? localRef;

  return (
    <section className="filter-bar" aria-label="筛选">
      <div className="filter-bar__row">
        <label className="filter-bar__search">
          <span className="visually-hidden">关键字</span>
          <input
            ref={inputRef}
            type="search"
            className="filter-bar__input"
            placeholder="多个关键词用空格分隔，均需匹配；短语可用引号（按 / 聚焦）"
            value={keyword}
            onChange={(e) => onKeywordChange(e.target.value)}
            onFocus={() => setShowRecent(true)}
            onBlur={() => setTimeout(() => setShowRecent(false), 150)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onKeywordCommit?.(keyword);
            }}
            autoComplete="off"
            list="recent-queries"
          />
          <datalist id="recent-queries">
            {recentQueries.map((q) => (
              <option key={q} value={q} />
            ))}
          </datalist>
          {showRecent && recentQueries.length > 0 && !keyword && (
            <ul className="filter-bar__recent" role="listbox">
              {recentQueries.map((q) => (
                <li key={q}>
                  <button
                    type="button"
                    className="filter-bar__recent-item"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onKeywordChange(q);
                      onKeywordCommit?.(q);
                    }}
                  >
                    {q}
                  </button>
                </li>
              ))}
            </ul>
          )}
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
          <span className="filter-bar__label">排序</span>
          <select
            className="filter-bar__select filter-bar__select--mode"
            value={sortKey}
            onChange={(e) => onSortChange(e.target.value as SortKey)}
          >
            {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
              <option key={k} value={k}>
                {SORT_LABEL[k]}
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
        <div className="filter-bar__tools">
          <button
            type="button"
            className={`filter-bar__tool ${favOnly ? "filter-bar__tool--on" : ""}`}
            onClick={() => onFavOnlyChange(!favOnly)}
            aria-pressed={favOnly}
            title="仅看收藏"
          >
            ★ {favoriteCount}
          </button>
          <button type="button" className="filter-bar__tool" onClick={onShareLink} title={shareHint ?? "复制分享链接"}>
            分享
          </button>
          <button
            type="button"
            className="filter-bar__tool"
            onClick={onExportList}
            title="复制当前结果为 Markdown 列表"
            disabled={filteredCount === 0}
          >
            导出
          </button>
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
