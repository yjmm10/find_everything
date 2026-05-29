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

const WEEKDAY_ZH = ["日", "一", "二", "三", "四", "五", "六"];

export function weekdayLabel(day: string): string {
  return WEEKDAY_ZH[parseDay(day).getDay()];
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
