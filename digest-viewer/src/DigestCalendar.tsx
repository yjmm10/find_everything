import { useMemo } from "react";
import type { DigestEntry, DigestUpdate } from "./types";
import {
  buildMonthGrid,
  formatDay,
  monthTitle,
  parseDay,
} from "./dateUtils";

export interface DayActivity {
  entryCount: number;
  crawlCount: number;
}

export interface DigestCalendarProps {
  updates: DigestUpdate[];
  entries: DigestEntry[];
  selectedDay: string | null;
  viewYear: number;
  viewMonth: number;
  onSelectDay: (day: string | null) => void;
  onViewMonthChange: (year: number, month: number) => void;
}

function shiftMonth(year: number, month: number, delta: number): [number, number] {
  const d = new Date(year, month - 1 + delta, 1);
  return [d.getFullYear(), d.getMonth() + 1];
}

export function buildDayActivityMap(
  updates: DigestUpdate[],
  entries: DigestEntry[],
): Map<string, DayActivity> {
  const map = new Map<string, DayActivity>();

  const bump = (day: string, field: keyof DayActivity) => {
    const cur = map.get(day) ?? { entryCount: 0, crawlCount: 0 };
    cur[field] += 1;
    map.set(day, cur);
  };

  for (const u of updates) {
    const crawlDay = u.updatedAt.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(crawlDay)) bump(crawlDay, "crawlCount");
  }

  for (const e of entries) {
    if (e.dateStart && e.dateEnd) {
      const start = parseDay(e.dateStart);
      const end = parseDay(e.dateEnd);
      const cur = new Date(start);
      while (cur <= end) {
        bump(formatDay(cur), "entryCount");
        cur.setDate(cur.getDate() + 1);
      }
    } else if (e.publishedAt && /^\d{4}-\d{2}-\d{2}/.test(e.publishedAt)) {
      bump(e.publishedAt.slice(0, 10), "entryCount");
    }
  }

  return map;
}

export default function DigestCalendar({
  updates,
  entries,
  selectedDay,
  viewYear,
  viewMonth,
  onSelectDay,
  onViewMonthChange,
}: DigestCalendarProps) {
  const activity = useMemo(
    () => buildDayActivityMap(updates, entries),
    [updates, entries],
  );

  const weeks = useMemo(
    () => buildMonthGrid(viewYear, viewMonth),
    [viewYear, viewMonth],
  );

  const today = formatDay(new Date());

  const handleDayClick = (day: string) => {
    onSelectDay(selectedDay === day ? null : day);
  };

  return (
    <section className="calendar" aria-label="日历浏览">
      <div className="calendar__head">
        <h2 className="calendar__title">日历</h2>
        <div className="calendar__nav">
          <button
            type="button"
            className="calendar__nav-btn"
            aria-label="上一月"
            onClick={() => {
              const [y, m] = shiftMonth(viewYear, viewMonth, -1);
              onViewMonthChange(y, m);
            }}
          >
            ‹
          </button>
          <span className="calendar__month">{monthTitle(viewYear, viewMonth)}</span>
          <button
            type="button"
            className="calendar__nav-btn"
            aria-label="下一月"
            onClick={() => {
              const [y, m] = shiftMonth(viewYear, viewMonth, 1);
              onViewMonthChange(y, m);
            }}
          >
            ›
          </button>
        </div>
      </div>

      <button
        type="button"
        className="calendar__today"
        onClick={() => {
          const now = new Date();
          onViewMonthChange(now.getFullYear(), now.getMonth() + 1);
          onSelectDay(formatDay(now));
        }}
      >
        今天
      </button>

      <div className="calendar__weekdays">
        {["日", "一", "二", "三", "四", "五", "六"].map((w) => (
          <span key={w} className="calendar__weekday">
            {w}
          </span>
        ))}
      </div>

      <div className="calendar__grid">
        {weeks.map((week, wi) =>
          week.map((day, di) => {
            if (!day) {
              return <span key={`${wi}-${di}`} className="calendar__cell calendar__cell--empty" />;
            }
            const act = activity.get(day);
            const hasData = (act?.entryCount ?? 0) > 0;
            const hasCrawl = (act?.crawlCount ?? 0) > 0;
            const isSelected = selectedDay === day;
            const isToday = day === today;

            return (
              <button
                key={day}
                type="button"
                className={[
                  "calendar__cell",
                  "calendar__day",
                  hasData ? "calendar__day--data" : "",
                  hasCrawl ? "calendar__day--crawl" : "",
                  isSelected ? "calendar__day--selected" : "",
                  isToday ? "calendar__day--today" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => handleDayClick(day)}
                aria-pressed={isSelected}
                aria-label={`${day}${hasData ? `，${act?.entryCount} 条内容` : ""}${hasCrawl ? "，有抓取记录" : ""}`}
              >
                <span className="calendar__day-num">{parseDay(day).getDate()}</span>
                {(hasData || hasCrawl) && (
                  <span className="calendar__dots">
                    {hasCrawl && <span className="calendar__dot calendar__dot--crawl" />}
                    {hasData && <span className="calendar__dot calendar__dot--data" />}
                  </span>
                )}
                {hasData && (act?.entryCount ?? 0) > 0 && (
                  <span className="calendar__count">{act!.entryCount > 99 ? "99+" : act!.entryCount}</span>
                )}
              </button>
            );
          }),
        )}
      </div>

      <ul className="calendar__legend">
        <li>
          <span className="calendar__dot calendar__dot--data" /> 数据窗覆盖日
        </li>
        <li>
          <span className="calendar__dot calendar__dot--crawl" /> 抓取执行日
        </li>
      </ul>

      {selectedDay && (
        <p className="calendar__selection">
          已选 <strong>{selectedDay}</strong>
          {activity.get(selectedDay)?.entryCount
            ? ` · ${activity.get(selectedDay)!.entryCount} 条相关`
            : " · 该日无条目"}
          <button type="button" className="calendar__clear" onClick={() => onSelectDay(null)}>
            清除
          </button>
        </p>
      )}
    </section>
  );
}
