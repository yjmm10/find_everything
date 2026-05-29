/** 与 src/dateUtils.ts 中周日逻辑保持一致（供构建脚本使用） */

export function formatDay(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDay(s) {
  return new Date(`${s}T12:00:00`);
}

export function sundayForGithubWeekly(dateStart, dateEnd) {
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
