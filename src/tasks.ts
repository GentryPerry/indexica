import { STATUS, type El, type Status } from './types';

/** Task cards grouped by status, each group ordered by due date (undated last), then by creation order. */
export function groupTasks(els: El[]): Record<Status, El[]> {
  const out = Object.fromEntries(Object.keys(STATUS).map(k => [k, [] as El[]])) as Record<Status, El[]>;
  for (const e of els) if (e.type === 'card') (out[e.status || 'todo'] || out.todo).push(e);
  for (const list of Object.values(out)) list.sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || a.z - b.z);
  return out;
}
