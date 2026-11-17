import { FILLS, type El, type Els } from './types';

/** A page of a board. A board document holds one or more pages. */
export interface Page { id: string; name: string; els: Els }
export interface BoardDoc { pages: Page[] }
type Uid = (prefix: string) => string;

/** Read a stored board in either the current `{ pages }` shape or the older single-page `{ els }` shape. */
export function migrateBoard(data: unknown, uid: Uid): BoardDoc {
  const d = (data || {}) as { pages?: Partial<Page>[]; els?: Els };
  if (Array.isArray(d.pages) && d.pages.length) {
    return { pages: d.pages.map((p, i) => ({ id: p.id || uid('pg'), name: p.name || `Page ${i + 1}`, els: p.els || {} })) };
  }
  return { pages: [{ id: uid('pg'), name: 'Page 1', els: d.els || {} }] };
}

/** A copy of a page's pieces with fresh ids. Connector ends and groups follow their pieces. */
export function cloneEls(els: Els, uid: Uid): Els {
  const ids: Record<string, string> = {}, groups: Record<string, string> = {}, out: Els = {};
  for (const id of Object.keys(els)) ids[id] = uid('e');
  for (const e of Object.values(els)) {
    const c: El = JSON.parse(JSON.stringify(e));
    c.id = ids[e.id];
    if (c.g) c.g = groups[c.g] ||= uid('g');
    if (c.type === 'conn') { c.a = c.a ? ids[c.a] ?? null : null; c.b = c.b ? ids[c.b] ?? null : null; }
    out[c.id] = c;
  }
  return out;
}

export const clonePages = (pages: Page[], uid: Uid): Page[] => pages.map(p => ({ id: uid('pg'), name: p.name, els: cloneEls(p.els, uid) }));

/** The next free "Page N" name. */
export function nextPageName(pages: { name: string }[]): string {
  const used = pages.map(p => /^Page (\d+)$/.exec(p.name)).filter(Boolean).map(m => Number(m![1]));
  return `Page ${Math.max(pages.length, ...used) + 1}`;
}

type Spec = Partial<El> & Pick<El, 'type'>;

function builder(uid: Uid) {
  const els: Els = {};
  let z = 0;
  const add = (p: Spec): string => {
    const e = { x: 0, y: 0, w: 0, h: 0, ...p, id: uid('e'), z: ++z } as El;
    els[e.id] = e;
    return e.id;
  };
  const link = (a: string, b: string, extra: Partial<El> = {}) => add({ type: 'conn', a, b, ax: 0, ay: 0, bx: 0, by: 0, ...extra });
  return { els, add, link };
}

export interface Template { key: string; name: string; blurb: string; build: (uid: Uid) => Els }

export const TEMPLATES: Template[] = [
  { key: 'blank', name: 'Blank', blurb: 'An empty board', build: () => ({}) },
  {
    key: 'brainstorm', name: 'Brainstorm', blurb: 'A central question with ideas around it',
    build: uid => {
      const { els, add, link } = builder(uid);
      add({ type: 'frame', x: 0, y: 0, w: 960, h: 600, text: 'Brainstorm' });
      const hub = add({ type: 'ellipse', x: 380, y: 240, w: 200, h: 120, fill: FILLS[3], text: 'Central question' });
      [[60, 60], [400, 50], [740, 60], [60, 420], [400, 430], [740, 420]].forEach(([x, y], i) => {
        link(hub, add({ type: 'sticky', x, y, w: 160, h: 120, fill: [FILLS[0], FILLS[2], FILLS[1]][i % 3], text: 'Idea' }), { style: 'curve' });
      });
      return els;
    },
  },
  {
    key: 'retro', name: 'Retrospective', blurb: 'What went well, what to improve, and actions',
    build: uid => {
      const { els, add } = builder(uid);
      add({ type: 'frame', x: 0, y: 0, w: 320, h: 520, text: 'Went well' });
      add({ type: 'sticky', x: 24, y: 24, w: 160, h: 120, fill: FILLS[2], text: 'What helped this time?' });
      add({ type: 'frame', x: 360, y: 0, w: 320, h: 520, text: 'To improve' });
      add({ type: 'sticky', x: 384, y: 24, w: 160, h: 120, fill: FILLS[1], text: 'What slowed us down?' });
      add({ type: 'frame', x: 720, y: 0, w: 320, h: 520, text: 'Action items' });
      add({ type: 'card', x: 744, y: 24, w: 272, h: 100, text: 'First action', status: 'todo', due: '', notes: '' });
      return els;
    },
  },
  {
    key: 'plan', name: 'Project plan', blurb: 'Goal, tasks, and notes in one place',
    build: uid => {
      const { els, add } = builder(uid);
      add({ type: 'frame', x: 0, y: 0, w: 420, h: 260, text: 'Goal' });
      add({ type: 'sticky', x: 24, y: 24, w: 220, h: 140, fill: FILLS[3], text: 'What does done look like?' });
      add({ type: 'frame', x: 460, y: 0, w: 300, h: 520, text: 'Tasks' });
      [['Plan the work', 'done'], ['Do the work', 'doing'], ['Review it', 'todo']].forEach(([text, status], i) => {
        add({ type: 'card', x: 484, y: 24 + i * 120, w: 252, h: 100, text, status: status as El['status'], due: '', notes: '' });
      });
      add({ type: 'frame', x: 0, y: 300, w: 420, h: 220, text: 'Notes' });
      add({ type: 'text', x: 24, y: 324, w: 360, h: 30, text: 'Notes, links, and decisions' });
      return els;
    },
  },
  {
    key: 'flow', name: 'Flowchart', blurb: 'Start, a step, and a decision with two paths',
    build: uid => {
      const { els, add, link } = builder(uid);
      const start = add({ type: 'ellipse', x: 0, y: 0, w: 160, h: 70, fill: FILLS[2], text: 'Start' });
      const step = add({ type: 'rect', x: 0, y: 130, w: 160, h: 80, fill: '#ffffff', text: 'Step' });
      const ask = add({ type: 'diamond', x: -10, y: 270, w: 180, h: 110, fill: FILLS[0], text: 'Decision?' });
      const yes = add({ type: 'rect', x: -170, y: 440, w: 160, h: 80, fill: '#ffffff', text: 'Yes path' });
      const no = add({ type: 'rect', x: 170, y: 440, w: 160, h: 80, fill: '#ffffff', text: 'No path' });
      link(start, step); link(step, ask);
      link(ask, yes, { style: 'elbow', text: 'Yes' }); link(ask, no, { style: 'elbow', text: 'No' });
      return els;
    },
  },
  {
    key: 'week', name: 'Weekly plan', blurb: 'A column for each weekday',
    build: uid => {
      const { els, add } = builder(uid);
      ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].forEach((day, i) => {
        add({ type: 'frame', x: i * 240, y: 0, w: 220, h: 440, text: day });
        add({ type: 'sticky', x: i * 240 + 20, y: 20, w: 180, h: 110, fill: FILLS[0], text: 'Focus for the day' });
      });
      return els;
    },
  },
];
