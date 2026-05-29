import { useMemo } from "react";
import type { DigestEntry, DigestUpdate } from "./types";
import type { DateFilterMode } from "./filterUtils";
import { effectivePublishedDay, entryMatchesDay } from "./filterUtils";
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

const CALENDAR_DATE_MODE: DateFilterMode = "published";

function shiftMonth(year: number, month: number, delta: number): [number, number] {
  const d = new Date(year, month - 1 + delta, 1);
  return [d.getFullYear(), d.getMonth() + 1];
}

/** 与筛选逻辑一致：含 GitHub 周榜→周日 */
export function buildDayActivityMap(
  updates: DigestUpdate[],
  entries: DigestEntry[],
  mode: DateFilterMode,
): Map<string, DayActivity> {
  const map = new Map<string, DayActivity>();

  const bump = (day: string, field: keyof DayActivity, n = 1) => {
    const cur = map.get(day) ?? { entryCount: 0, crawlCount: 0 };
    cur[field] += n;
    map.set(day, cur);
  };

  for (const u of updates) {
    const crawlDay = u.crawlDate || u.updatedAt.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(crawlDay)) bump(crawlDay, "crawlCount");
  }

  if (mode === "crawl") {
    for (const u of updates) {
      const crawlDay = u.crawlDate || u.updatedAt.slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(crawlDay)) {
        bump(crawlDay, "entryCount", u.entryCount);
      }
    }
    return map;
  }

  for (const e of entries) {
    if (mode === "published") {
      const pub = effectivePublishedDay(e);
      if (pub) bump(pub, "entryCount");
      continue;
    }
    if (e.dateStart && e.dateEnd) {
      const start = parseDay(e.dateStart);
      const end = parseDay(e.dateEnd);
      const cur = new Date(start);
      while (cur <= end) {
        bump(formatDay(cur), "entryCount");
        cur.setDate(cur.getDate() + 1);
      }
    }
  }

  return map;
}

export function countEntriesOnDay(
  entries: DigestEntry[],
  day: string,
  mode: DateFilterMode,
): number {
  return entries.filter((e) => entryMatchesDay(e, day, mode)).length;
}

function heatLevel(count: number): 0 | 1 | 2 | 3 {
  if (count <= 0) return 0;
  if (count <= 3) return 1;
  if (count <= 10) return 2;
  return 3;
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
    () => buildDayActivityMap(updates, entries, CALENDAR_DATE_MODE),
    [updates, entries],
  );

  const weeks = useMemo(
    () => buildMonthGrid(viewYear, viewMonth),
    [viewYear, viewMonth],
  );

  const monthMax = useMemo(() => {
    let max = 0;
    for (const week of weeks) {
      for (const day of week) {
        if (!day) continue;
        const d = parseDay(day);
        if (d.getMonth() + 1 !== viewMonth) continue;
        const n = countEntriesOnDay(entries, day, CALENDAR_DATE_MODE);
        if (n > max) max = n;
      }
    }
    return max;
  }, [weeks, entries, viewMonth]);

  const today = formatDay(new Date());
  const selectedCount = selectedDay
    ? countEntriesOnDay(entries, selectedDay, CALENDAR_DATE_MODE)
    : 0;

  return (
    <section className="calendar" aria-label="日历浏览">
      <div className="calendar__head">
        <div>
          <h2 className="calendar__title">日历</h2>
          <p className="calendar__hint">按发表日 · 周榜归周日</p>
        </div>
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

      <div className="calendar__actions">
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
        {selectedDay && (
          <button
            type="button"
            className="calendar__clear-btn"
            onClick={() => onSelectDay(null)}
          >
            清除选日
          </button>
        )}
      </div>

      <div className="calendar__weekdays">
        {["日", "一", "二", "三", "四", "五", "六"].map((w, i) => (
          <span
            key={w}
            className={`calendar__weekday ${i === 0 ? "calendar__weekday--sun" : ""}`}
          >
            {w}
          </span>
        ))}
      </div>

      <div className="calendar__weeks">
        {weeks.map((week, wi) => (
          <div key={wi} className="calendar__week">
            {week.map((day, di) => {
              if (!day) {
                return (
                  <span
                    key={`e-${wi}-${di}`}
                    className="calendar__cell calendar__cell--empty"
                    aria-hidden
                  />
                );
              }
              const dayCount = countEntriesOnDay(entries, day, CALENDAR_DATE_MODE);
              const act = activity.get(day);
              const hasCrawl = (act?.crawlCount ?? 0) > 0;
              const isSelected = selectedDay === day;
              const isToday = day === today;
              const isSunday = parseDay(day).getDay() === 0;
              const inMonth = parseDay(day).getMonth() + 1 === viewMonth;
              const heat = heatLevel(dayCount);

              return (
                <button
                  key={day}
                  type="button"
                  className={[
                    "calendar__day",
                    inMonth ? "" : "calendar__day--muted",
                    dayCount > 0 ? "calendar__day--data" : "",
                    heat > 0 ? `calendar__day--heat-${heat}` : "",
                    hasCrawl ? "calendar__day--crawl" : "",
                    isSelected ? "calendar__day--selected" : "",
                    isToday ? "calendar__day--today" : "",
                    isSunday && inMonth ? "calendar__day--sun" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => onSelectDay(isSelected ? null : day)}
                  aria-pressed={isSelected}
                  title={
                    dayCount > 0
                      ? `${day}：${dayCount} 条${hasCrawl ? " · 有抓取" : ""}`
                      : hasCrawl
                        ? `${day}：抓取日`
                        : day
                  }
                >
                  <span className="calendar__day-num">{parseDay(day).getDate()}</span>
                  {dayCount > 0 && (
                    <span className="calendar__badge">{dayCount > 99 ? "99+" : dayCount}</span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <ul className="calendar__legend calendar__legend--compact">
        <li>
          <span className="calendar__swatch calendar__swatch--data" /> 有内容
        </li>
        <li>
          <span className="calendar__swatch calendar__swatch--crawl" /> 抓取日
        </li>
        {monthMax > 0 && (
          <li className="calendar__legend-max">本月单日最多 {monthMax} 条</li>
        )}
      </ul>

      {selectedDay && (
        <p className="calendar__selection">
          <strong>{selectedDay}</strong>
          {selectedCount > 0 ? ` · ${selectedCount} 条` : " · 该日无条目"}
          <span className="calendar__selection-note">（右侧列表已按日筛选）</span>
        </p>
      )}
    </section>
  );
}
