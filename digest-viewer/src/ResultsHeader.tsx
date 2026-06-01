import type { SortKey } from "./sortEntries";
import { SORT_LABEL } from "./sortEntries";
import { formatChineseDate } from "./dateUtils";

export type EntryLayout = "list" | "grid";

export interface ResultsHeaderProps {
  count: number;
  calendarDay: string | null;
  selectedDigestLabel: string;
  sortKey: SortKey;
  favOnly?: boolean;
  entryLayout: EntryLayout;
  onEntryLayoutChange: (v: EntryLayout) => void;
  groupView: boolean;
  onGroupViewChange: (v: boolean) => void;
}

export default function ResultsHeader({
  count,
  calendarDay,
  selectedDigestLabel,
  sortKey,
  favOnly,
  entryLayout,
  onEntryLayoutChange,
  groupView,
  onGroupViewChange,
}: ResultsHeaderProps) {
  let hint = `按${SORT_LABEL[sortKey]}排序`;
  if (favOnly) hint = `仅收藏 · ${hint}`;
  if (calendarDay) {
    hint = `${formatChineseDate(calendarDay)} · ${hint}`;
  } else if (selectedDigestLabel) {
    hint = `期次 ${selectedDigestLabel} · ${hint}`;
  }

  return (
    <div className="results-header">
      <div className="results-header__main">
        <h2 className="results-header__title">
          检索结果
          <span className="results-header__count">{count}</span>
        </h2>
        <p className="results-header__hint">{hint}</p>
      </div>
      <div className="results-header__views" role="group" aria-label="展示方式">
        <button
          type="button"
          className={`results-header__view-btn ${entryLayout === "list" ? "results-header__view-btn--on" : ""}`}
          onClick={() => onEntryLayoutChange("list")}
          aria-pressed={entryLayout === "list"}
          title="列表展示"
        >
          列表
        </button>
        <button
          type="button"
          className={`results-header__view-btn ${entryLayout === "grid" ? "results-header__view-btn--on" : ""}`}
          onClick={() => onEntryLayoutChange("grid")}
          aria-pressed={entryLayout === "grid"}
          title="方块卡片"
        >
          方块
        </button>
        <span className="results-header__views-sep" aria-hidden />
        <button
          type="button"
          className={`results-header__view-btn ${groupView ? "results-header__view-btn--on" : ""}`}
          onClick={() => onGroupViewChange(!groupView)}
          aria-pressed={groupView}
          title="按来源分组"
        >
          分组
        </button>
      </div>
    </div>
  );
}
