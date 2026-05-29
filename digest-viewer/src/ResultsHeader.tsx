import type { DigestSource } from "./types";

const SOURCE_SHORT: Partial<Record<DigestSource, string>> = {
  arxiv: "Arxiv",
  semantic_scholar: "S2",
  openalex: "OpenAlex",
  rss: "RSS",
  github_weekly: "GH周榜",
  github_search: "GH检索",
  github: "GitHub",
};

export interface ResultsHeaderProps {
  count: number;
  calendarDay: string | null;
  selectedDigestLabel: string;
}

export default function ResultsHeader({
  count,
  calendarDay,
  selectedDigestLabel,
}: ResultsHeaderProps) {
  let hint = "全部条目 · 按评分降序";
  if (calendarDay) {
    hint = `${calendarDay} 当日内容（含周榜周日）· 按评分降序`;
  } else if (selectedDigestLabel) {
    hint = `期次 ${selectedDigestLabel} · 整周 · 按评分降序`;
  }

  return (
    <div className="results-header">
      <h2 className="results-header__title">
        检索结果
        <span className="results-header__count">{count}</span>
      </h2>
      <p className="results-header__hint">{hint}</p>
    </div>
  );
}

export function sourceCountLine(sourceCounts: Partial<Record<DigestSource, number>>): string {
  return (Object.entries(sourceCounts) as [DigestSource, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([s, n]) => `${SOURCE_SHORT[s] ?? s} ${n}`)
    .join(" · ");
}
