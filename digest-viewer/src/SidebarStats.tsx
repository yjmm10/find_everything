import type { DigestEntry, DigestUpdate } from "./types";
import { countBySource } from "./entryDisplay";
import { formatDateRange } from "./dateUtils";
import { formatDateRange } from "./dateUtils";

export interface SidebarStatsProps {
  updates: DigestUpdate[];
  entries: DigestEntry[];
  favoriteCount: number;
}

export default function SidebarStats({ updates, entries, favoriteCount }: SidebarStatsProps) {
  const bySource = countBySource(entries);
  const top = (Object.entries(bySource) as [string, number][])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const dates = entries
    .map((e) => e.publishedAt?.slice(0, 10))
    .filter((d): d is string => Boolean(d && /^\d{4}-\d{2}-\d{2}$/.test(d)))
    .sort();
  const range =
    dates.length > 0 ? formatDateRange(dates[0], dates[dates.length - 1], { compact: true }) : "—";

  return (
    <section className="sidebar-stats" aria-label="数据概览">
      <h2 className="sidebar-stats__title">概览</h2>
      <dl className="sidebar-stats__grid">
        <div>
          <dt>期次</dt>
          <dd>{updates.length}</dd>
        </div>
        <div>
          <dt>条目</dt>
          <dd>{entries.length}</dd>
        </div>
        <div>
          <dt>收藏</dt>
          <dd>{favoriteCount}</dd>
        </div>
        <div className="sidebar-stats__wide">
          <dt>发表跨度</dt>
          <dd>{range}</dd>
        </div>
      </dl>
      {top.length > 0 && (
        <ul className="sidebar-stats__sources">
          {top.map(([s, n]) => (
            <li key={s}>
              <span className="sidebar-stats__src">{s.replace(/_/g, " ")}</span>
              <span className="sidebar-stats__n">{n}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
