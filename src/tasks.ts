import { STATUS, type El, type Status } from './types';

/** Task cards grouped by status, each group ordered by due date (undated last), then by creation order. */
export function groupTasks(els: El[]): Record<Status, El[]> {
  const out = Object.fromEntries(Object.keys(STATUS).map(k => [k, [] as El[]])) as Record<Status, El[]>;
  for (const e of els) if (e.type === 'card') (out[e.status || 'todo'] || out.todo).push(e);
  for (const list of Object.values(out)) list.sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || a.z - b.z);
  return out;
}

/*
 * A task card is a to-do list: every line of its text is a task with a box, and tabs make subtasks.
 * `checked` holds the checked-off line indexes. The first line names the card in the Tasks tab and Kanban.
 */

/** A card's name: its first task. */
export const cardTitle = (e: El) => (e.text || '').split('\n')[0].trim();

/** A card's tasks as a checklist piece, drawn and measured like a note's checklist. */
export function cardList(e: El): El {
  return { ...e, runs: undefined, bullets: 'check', weight: 400, size: e.size || CARD.size, psp: CARD.row, lsp: undefined };
}

/** Checked-off and total tasks on a card (empty lines do not count). */
export function cardProgress(e: El): [number, number] {
  let total = 0, done = 0;
  (e.text || '').split('\n').forEach((l, i) => { if (!l.trim()) return; total++; if (e.checked?.includes(i)) done++; });
  return [done, total];
}

/**
 * A card's look: the side inset, the space above the first task, the footer (a divider, the status chip,
 * and progress), the smallest height, the task text size, and the extra space between tasks.
 */
export const CARD = { pad: 16, top: 14, foot: 52, min: 104, size: 14, row: 5 };
