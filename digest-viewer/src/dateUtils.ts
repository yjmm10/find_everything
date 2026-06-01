/** YYYY-MM-DD */
export function formatDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseDay(s: string): Date {
  return new Date(`${s}T12:00:00`);
}

export function eachDayInRange(start: string, end: string): string[] {
  if (!start || !end || start > end) return [];
  const days: string[] = [];
  const cur = parseDay(start);
  const last = parseDay(end);
  while (cur <= last) {
    days.push(formatDay(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

export function dayOverlapsWindow(day: string, start: string, end: string): boolean {
  if (!start || !end) return false;
  return start <= day && day <= end;
}

/** 数据窗内的周日（GitHub 周榜按「周天」定位） */
export function sundayInWindow(dateStart: string, dateEnd: string): string | null {
  if (!dateStart || !dateEnd || dateStart > dateEnd) return null;
  const cur = parseDay(dateStart);
  const end = parseDay(dateEnd);
  while (cur <= end) {
    if (cur.getDay() === 0) return formatDay(cur);
    cur.setDate(cur.getDate() + 1);
  }
  const d = new Date(end);
  while (d.getDay() !== 0) d.setDate(d.getDate() - 1);
  const day = formatDay(d);
  return day >= dateStart ? day : null;
}

/** GitHub 周榜条目用于日历/按日筛选的生效日期 */
export function sundayForGithubWeekly(dateStart: string, dateEnd: string): string | null {
  return sundayInWindow(dateStart, dateEnd);
}

const WEEKDAY_ZH = ["日", "一", "二", "三", "四", "五", "六"];

export function weekdayLabel(day: string): string {
  return WEEKDAY_ZH[parseDay(day).getDay()];
}

/** 单日：2026年5月8日 */
export function formatChineseDate(day: string): string {
  const d = parseDay(day);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}日`;
}

/**
 * 数据窗 / 期次区间（中文自然读法）
 * - 同日：2026年4月30日
 * - 同月：2026年5月8–14日
 * - 同年跨月：2026年3月26日 – 4月1日
 */
export function formatDateRange(
  dateStart: string,
  dateEnd: string,
  options?: { compact?: boolean },
): string {
  if (!dateStart && !dateEnd) return "";
  if (!dateStart) return formatChineseDate(dateEnd);
  if (!dateEnd) return formatChineseDate(dateStart);
  if (dateStart === dateEnd) return formatChineseDate(dateStart);

  const s = parseDay(dateStart);
  const e = parseDay(dateEnd);
  const sy = s.getFullYear();
  const sm = s.getMonth() + 1;
  const sd = s.getDate();
  const ey = e.getFullYear();
  const em = e.getMonth() + 1;
  const ed = e.getDate();

  if (options?.compact) {
    if (sy === ey && sm === em) return `${sm}月${sd}–${ed}日`;
    if (sy === ey) return `${sm}月${sd}日 – ${em}月${ed}日`;
    return `${sy}年${sm}月${sd}日 – ${ey}年${em}月${ed}日`;
  }

  if (sy === ey && sm === em) return `${sy}年${sm}月${sd}–${ed}日`;
  if (sy === ey) return `${sy}年${sm}月${sd}日 – ${em}月${ed}日`;
  return `${sy}年${sm}月${sd}日 – ${ey}年${em}月${ed}日`;
}

export function monthTitle(year: number, month: number): string {
  return `${year} 年 ${month} 月`;
}

export function buildMonthGrid(year: number, month: number): (string | null)[][] {
  const first = new Date(year, month - 1, 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(formatDay(new Date(year, month - 1, d)));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}
