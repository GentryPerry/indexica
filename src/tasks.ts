import { STATUS, type El, type Status } from './types';

/** Task cards grouped by status, each group ordered by due date (undated last), then by creation order. */
export function groupTasks(els: El[]): Record<Status, El[]> {
  const out = Object.fromEntries(Object.keys(STATUS).map(k => [k, [] as El[]])) as Record<Status, El[]>;
  for (const e of els) if (e.type === 'card') (out[e.status || 'todo'] || out.todo).push(e);
  for (const list of Object.values(out)) list.sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || a.z - b.z);
  return out;
}

/*
 * A task card's text: the first line is its title and every line after it is a checklist item (tabs
 * indent subtasks). `checked` holds checked-off paragraph indexes of the whole text, so items start at 1.
 */

/** A card's title: its first line. */
export const cardTitle = (e: El) => (e.text || '').split('\n')[0].trim();

/** The checklist under a card's title as a piece of its own (indexes shifted to the items), or null when it has none. */
export function cardList(e: El): El | null {
  const lines = (e.text || '').split('\n');
  if (lines.length < 2) return null;
  const checked = (e.checked || []).filter(i => i >= 1).map(i => i - 1);
  return { ...e, text: lines.slice(1).join('\n'), runs: undefined, bullets: 'check', checked: checked.length ? checked : undefined, weight: 400 };
}

/** Checked-off and total items on a card (empty lines do not count). */
export function cardProgress(e: El): [number, number] {
  const lines = (e.text || '').split('\n').slice(1);
  let total = 0, done = 0;
  lines.forEach((l, i) => { if (!l.trim()) return; total++; if (e.checked?.includes(i + 1)) done++; });
  return [done, total];
}

/** Space a card keeps around its text: the side inset, the top, and the status row at the foot. */
export const CARD = { pad: 14, top: 12, foot: 44, gap: 6, min: 100 };
