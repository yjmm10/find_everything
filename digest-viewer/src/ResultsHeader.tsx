import type { SortKey } from "./sortEntries";
import { SORT_LABEL } from "./sortEntries";

export interface ResultsHeaderProps {
  count: number;
  calendarDay: string | null;
  selectedDigestLabel: string;
  sortKey: SortKey;
  favOnly?: boolean;
  groupView: boolean;
  onGroupViewChange: (v: boolean) => void;
  compactView: boolean;
  onCompactViewChange: (v: boolean) => void;
}

export default function ResultsHeader({
  count,
  calendarDay,
  selectedDigestLabel,
  sortKey,
  favOnly,
  groupView,
  onGroupViewChange,
  compactView,
  onCompactViewChange,
}: ResultsHeaderProps) {
  let hint = `按${SORT_LABEL[sortKey]}排序`;
  if (favOnly) hint = `仅收藏 · ${hint}`;
  if (calendarDay) {
    hint = `${calendarDay} 当日 · ${hint}`;
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
      <div className="results-header__views" role="group" aria-label="列表视图">
        <button
          type="button"
          className={`results-header__view-btn ${groupView ? "results-header__view-btn--on" : ""}`}
          onClick={() => onGroupViewChange(!groupView)}
          aria-pressed={groupView}
          title="按来源分组展示"
        >
          分组
        </button>
        <button
          type="button"
          className={`results-header__view-btn ${compactView ? "results-header__view-btn--on" : ""}`}
          onClick={() => onCompactViewChange(!compactView)}
          aria-pressed={compactView}
          title="紧凑卡片（隐藏摘要）"
        >
          紧凑
        </button>
      </div>
    </div>
  );
}
