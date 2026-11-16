import { isoDate } from './dom';

/** Six weeks of dates (YYYY-MM-DD) covering a month, each week starting on Sunday. `month` is 0 to 11. */
export function monthGrid(year: number, month: number): string[][] {
  const first = new Date(year, month, 1);
  const weeks: string[][] = [];
  for (let w = 0; w < 6; w++) {
    const week: string[] = [];
    for (let d = 0; d < 7; d++) week.push(isoDate(new Date(year, month, 1 - first.getDay() + w * 7 + d)));
    weeks.push(week);
  }
  return weeks;
}

/** Move a {year, month} pair by a number of months. */
export function shiftMonth(year: number, month: number, by: number): { year: number; month: number } {
  const d = new Date(year, month + by, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

export const monthPrefix = (year: number, month: number) => `${year}-${String(month + 1).padStart(2, '0')}`;
