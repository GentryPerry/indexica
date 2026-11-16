// @ts-nocheck
// UI layer, ported as-is from the single-file prototype. It is not type-checked yet:
// it will be split into typed modules when the canvas renderer is rebuilt.
import { $, h, s, uid, clone, today, toast } from './dom';
import { STATUS, FILLS, TEXTY, BOXY } from './types';
import { FONT, wrap, fitText, measure } from './geometry';
import * as G from './geometry';
import { Store } from './store';
import { History } from './history';
import { snapMove, snapPoint } from './snap';

function statParts() {
  if (Store.err) return ['err', Store.err];
  if (Store.busy) return ['warn', 'Saving'];
  return Store.mode === 'cloud' ? ['', 'Saved to your Claude account'] : ['warn', 'Saved in this browser only'];
}
function stat() { const el = $('#stat'); if (!el) return; const [c, t] = statParts(); el.replaceChildren(h('span', { class: 'dot ' + c }), t); }
Store.onChange = stat;

/* ---------- Workspace index ---------- */
let index = { projects: [], boards: [] };
let home = { filter: 'all', q: '', rename: null };
const saveIndex = () => Store.put('index', index);
const meta = id => index.boards.find(b => b.id === id);

function seed() {
  const p = { id: uid('p'), name: 'Indexica build' };
  const id = uid('b'), els = {}; let z = 0;
  const add = o => { o.id = uid('e'); o.z = ++z; els[o.id] = o; return o.id; };
  add({ type: 'frame', x: 0, y: 0, w: 700, h: 340, text: 'Sample board: how Stage 1 fits together' });
  add({ type: 'frame', x: 760, y: 0, w: 300, h: 520, text: 'Tasks' });
  add({ type: 'sticky', x: 40, y: 40, w: 180, h: 150, fill: FILLS[0], text: 'Boards live in projects. Favorites, search, and Trash are on the home screen.' });
  add({ type: 'sticky', x: 260, y: 40, w: 180, h: 150, fill: FILLS[2], text: 'Double-click empty space to drop a note. Hold Space and drag to pan.' });
  add({ type: 'sticky', x: 480, y: 40, w: 180, h: 150, fill: FILLS[3], text: 'Use the connector tool to link pieces. Lines follow when pieces move.' });
  const a = add({ type: 'rect', x: 60, y: 245, w: 130, h: 60, fill: '#ffffff', text: 'Idea' });
  const b = add({ type: 'diamond', x: 265, y: 225, w: 170, h: 100, fill: FILLS[0], text: 'Worth doing?' });
  const c = add({ type: 'ellipse', x: 510, y: 245, w: 130, h: 60, fill: FILLS[2], text: 'Plan it' });
  add({ type: 'conn', a, b, ax: 0, ay: 0, bx: 0, by: 0 }); add({ type: 'conn', a: b, b: c, ax: 0, ay: 0, bx: 0, by: 0 });
  const card = (y, text, status, notes) => add({ type: 'card', x: 790, y, w: 240, h: 100, text, status, due: '', notes: notes || '' });
  card(40, 'Canvas, notes, shapes, connectors', 'done');
  card(160, 'Task cards and task view', 'done');
  card(280, 'Images, tables, stamps', 'todo', 'Next slice of Stage 1.');
  card(400, 'Multi-page boards and templates', 'todo');
  const m = { id, name: 'Stage 1 plan (sample)', projectId: p.id, fav: false, trashed: false, created: Date.now(), updated: Date.now(), thumb: thumbOf(els) };
  Store.put('b_' + id, { els });
  return { projects: [p], boards: [m] };
}
function thumbOf(els) {
  return Object.values(els).filter(e => e.type !== 'conn' && e.type !== 'pen' && e.type !== 'text').slice(0, 80)
    .map(e => [Math.round(e.x), Math.round(e.y), Math.round(e.w), Math.round(e.h), e.type === 'frame' ? '' : e.type === 'card' ? STATUS[e.status][1] : e.fill || '#ffffff']);
}
function thumbSvg(t) {
  if (!t || !t.length) return s('svg', { viewBox: '0 0 10 10' });
  const x0 = Math.min(...t.map(r => r[0])), y0 = Math.min(...t.map(r => r[1]));
  const x1 = Math.max(...t.map(r => r[0] + r[2])), y1 = Math.max(...t.map(r => r[1] + r[3]));
  const pad = Math.max(x1 - x0, y1 - y0) * 0.06 + 10;
  return s('svg', { viewBox: `${x0 - pad} ${y0 - pad} ${x1 - x0 + pad * 2} ${y1 - y0 + pad * 2}`, 'aria-hidden': 'true' },
    t.map(r => s('rect', { x: r[0], y: r[1], width: r[2], height: r[3], rx: 4, fill: r[4] || 'none', stroke: r[4] ? 'rgba(0,0,0,.18)' : '#9aa8c4', 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke' })));
}

/* ---------- Home ---------- */
function renderHome() {
  board = null;
  const live = index.boards.filter(b => !b.trashed);
  const count = f => f === 'trash' ? index.boards.length - live.length : f === 'all' ? live.length : f === 'fav' ? live.filter(b => b.fav).length : live.filter(b => b.projectId === f).length;
  const nav = (f, label) => h('button', { class: 'nav' + (home.filter === f ? ' on' : ''), onclick: () => { home.filter = f; home.rename = null; renderHome(); } }, label, h('span', null, String(count(f))));
  const proj = index.projects.find(p => p.id === home.filter);
  const q = home.q.trim().toLowerCase();
  const list = index.boards.filter(b => (home.filter === 'trash' ? b.trashed : !b.trashed && (home.filter === 'all' || (home.filter === 'fav' ? b.fav : b.projectId === home.filter))) && (!q || b.name.toLowerCase().includes(q)))
    .sort((a, b) => b.updated - a.updated);
  const [sc, st] = statParts();
  const title = proj
    ? h('input', { class: 'title', id: 'proj-name', type: 'text', value: proj.name, 'aria-label': 'Project name', onchange: e => { proj.name = e.target.value.trim() || proj.name; saveIndex(); renderHome(); } })
    : h('h1', null, home.filter === 'fav' ? 'Favorites' : home.filter === 'trash' ? 'Trash' : 'All boards');
  $('#app').replaceChildren(h('div', { class: 'home' },
    h('aside', { class: 'side' },
      h('div', { class: 'brand' }, 'Index', h('i', null, 'ica')),
      nav('all', 'All boards'), nav('fav', 'Favorites'),
      h('div', { class: 'side-h' }, 'Projects'),
      index.projects.map(p => nav(p.id, p.name)),
      h('input', { type: 'text', id: 'new-project', placeholder: 'New project name', 'aria-label': 'New project name', onkeydown: e => { if (e.key === 'Enter' && e.target.value.trim()) { const p = { id: uid('p'), name: e.target.value.trim() }; index.projects.push(p); home.filter = p.id; saveIndex(); renderHome(); } } }),
      h('div', { class: 'grow' }), nav('trash', 'Trash'),
      h('div', { class: 'note', id: 'stat' }, h('span', { class: 'dot ' + sc }), st)),
    h('main', { class: 'main' },
      h('div', { class: 'head' }, title,
        h('input', { type: 'search', id: 'board-search', placeholder: 'Search boards', 'aria-label': 'Search boards', value: home.q, oninput: e => { home.q = e.target.value; renderHome(); const i = $('#board-search'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }),
        proj && h('button', { onclick: () => { index.boards.forEach(b => { if (b.projectId === proj.id) b.projectId = ''; }); index.projects = index.projects.filter(p => p !== proj); home.filter = 'all'; saveIndex(); renderHome(); toast('Project deleted. Its boards are in All boards.'); } }, 'Delete project'),
        home.filter !== 'trash' && h('button', { class: 'primary', onclick: newBoard }, 'New board')),
      list.length ? h('div', { class: 'grid' }, list.map(boardCard))
        : h('p', { class: 'empty' }, q ? 'No boards match that search.' : home.filter === 'trash' ? 'Trash is empty.' : 'No boards here yet. Select New board to start one.'))));
}
function boardCard(b) {
  const p = index.projects.find(x => x.id === b.projectId);
  const act = (label, fn, cls) => h('button', { class: cls, onclick: () => { fn(); saveIndex(); renderHome(); } }, label);
  const name = home.rename === b.id
    ? h('input', { type: 'text', id: 'rename-' + b.id, value: b.name, 'aria-label': 'Board name', onkeydown: e => { if (e.key === 'Enter') e.target.blur(); }, onblur: e => { b.name = e.target.value.trim() || b.name; home.rename = null; saveIndex(); renderHome(); } })
    : b.name;
  const card = h('div', { class: 'card' },
    h('button', { class: 'thumb', 'aria-label': 'Open ' + b.name, disabled: b.trashed, onclick: () => openBoard(b.id) }, thumbSvg(b.thumb)),
    h('div', { class: 'body' },
      h('div', { class: 'name' }, name),
      h('div', { class: 'meta' }, (p ? p.name : 'No project') + ' · edited ' + new Date(b.updated).toLocaleDateString()),
      h('div', { class: 'acts' }, b.trashed
        ? [act('Restore', () => { b.trashed = false; }), act('Delete forever', () => { index.boards = index.boards.filter(x => x !== b); Store.del('b_' + b.id); }, 'danger')]
        : [act(b.fav ? 'Favorited' : 'Favorite', () => { b.fav = !b.fav; }, b.fav ? 'fav-on' : ''),
           h('button', { onclick: () => { home.rename = b.id; renderHome(); const i = $('#rename-' + b.id); i.focus(); i.select(); } }, 'Rename'),
           h('button', { onclick: () => dupBoard(b) }, 'Duplicate'),
           h('select', { id: 'move-' + b.id, 'aria-label': 'Move to project', value: b.projectId || '', onchange: e => { b.projectId = e.target.value; saveIndex(); renderHome(); } },
             h('option', { value: '' }, 'No project'), index.projects.map(x => h('option', { value: x.id }, x.name))),
           act('Trash', () => { b.trashed = true; })])));
  return card;
}
function newBoard() {
  const b = { id: uid('b'), name: 'Untitled board', projectId: index.projects.some(p => p.id === home.filter) ? home.filter : '', fav: false, trashed: false, created: Date.now(), updated: Date.now(), thumb: [] };
  index.boards.push(b); Store.put('b_' + b.id, { els: {} }); saveIndex(); openBoard(b.id);
}
async function dupBoard(b) {
  const data = await Store.get('b_' + b.id) || { els: {} };
  const n = Object.assign(clone(b), { id: uid('b'), name: b.name + ' copy', fav: false, created: Date.now(), updated: Date.now() });
  index.boards.push(n); Store.put('b_' + n.id, data); saveIndex(); renderHome();
}

/* ---------- Board state ---------- */
let board = null;
const hist = new History();
let cam = { x: 0, y: 0, z: 1 }, tool = 'select', sel = new Set(), editing = null, clip = [];
let mode = null, spaceDown = false, lastDown = { t: 0, x: 0, y: 0 }, saveT = 0;
let tasksOpen = true, taskFilter = 'all', edFor = null;
let cv, vp, ov, C = {};
const E = id => board.els[id];
const all = () => Object.values(board.els);
const sorted = () => all().sort((a, b) => (a.type === 'frame') === (b.type === 'frame') ? a.z - b.z : a.type === 'frame' ? -1 : 1);
const topZ = () => all().reduce((m, e) => Math.max(m, e.z), 0);
const selEls = () => [...sel].map(E).filter(Boolean);
const group = id => { const e = E(id); return e && e.g ? all().filter(x => x.g === e.g).map(x => x.id) : [id]; };

function commit() { if (hist.commit(board.els)) queueSave(); refresh(); }
function travel(dir) {
  const gone = hist.step(board.els, dir); if (!gone) return;
  gone.forEach(id => sel.delete(id)); edFor = null; queueSave(); refresh();
}
function queueSave() { clearTimeout(saveT); saveT = setTimeout(saveNow, 600); }
function saveNow() {
  clearTimeout(saveT); if (!board) return;
  Store.put('b_' + board.id, { els: board.els });
  const m = meta(board.id); if (m) { m.updated = Date.now(); m.thumb = thumbOf(board.els); saveIndex(); }
}

/* ---------- Text and geometry helpers ---------- */
function textBlock(lines, x, y, size, fill, anchor, weight) {
  const t = s('text', { x, y, 'font-size': size, 'font-family': FONT, fill, 'text-anchor': anchor || 'start', 'font-weight': weight || 400, 'pointer-events': 'none' });
  lines.forEach((ln, i) => t.append(s('tspan', { x, dy: i ? size * 1.3 : 0 }, ln || ' '))); return t;
}
const ends = c => G.ends(c, E), bbox = e => G.bbox(e, E), bounds = list => G.bounds(list, E);

/* ---------- Rendering ---------- */
function renderEl(e, exp) {
  const g = s('g', { 'data-id': e.id }), ink = exp ? '#17202d' : C.ink, hide = !exp && editing === e.id;
  const { x, y, w, h: ht } = e;
  if (e.type === 'sticky') {
    g.append(s('rect', { x, y, width: w, height: ht, rx: 3, fill: e.fill, filter: exp ? null : 'url(#sh)' }));
    if (!hide) g.append(textBlock(wrap(e.text, w - 24, 16), x + 12, y + 28, 16, '#1d2530'));
  } else if (['rect', 'ellipse', 'diamond'].includes(e.type)) {
    const a = { fill: e.fill, stroke: '#2b3545', 'stroke-width': 1.5 };
    g.append(e.type === 'rect' ? s('rect', { x, y, width: w, height: ht, rx: 6, ...a })
      : e.type === 'ellipse' ? s('ellipse', { cx: x + w / 2, cy: y + ht / 2, rx: w / 2, ry: ht / 2, ...a })
      : s('polygon', { points: `${x + w / 2},${y} ${x + w},${y + ht / 2} ${x + w / 2},${y + ht} ${x},${y + ht / 2}`, ...a }));
    if (!hide) { const ls = wrap(e.text, w - 24, 15); g.append(textBlock(ls, x + w / 2, y + ht / 2 - ls.length * 19.5 / 2 + 14.5, 15, '#1d2530', 'middle')); }
  } else if (e.type === 'text') {
    g.append(s('rect', { x, y, width: w, height: ht, fill: 'transparent' }));
    if (!hide) g.append(textBlock(wrap(e.text, w - 4, 18), x + 2, y + 21, 18, ink));
  } else if (e.type === 'card') {
    const [label, col] = STATUS[e.status] || STATUS.todo, late = e.due && e.due < today() && e.status !== 'done';
    g.append(s('rect', { x, y, width: w, height: ht, rx: 8, fill: '#ffffff', stroke: '#c3ccda', filter: exp ? null : 'url(#sh)' }));
    g.append(s('rect', { x, y: y + 8, width: 5, height: ht - 16, rx: 2.5, fill: col, 'pointer-events': 'none' }));
    if (!hide) g.append(textBlock(wrap(e.text, w - 34, 14, 600).slice(0, 2), x + 18, y + 26, 14, '#1d2530', 'start', 600));
    const pw = measure(label, 11, 600) + 16;
    g.append(s('rect', { x: x + 18, y: y + ht - 30, width: pw, height: 18, rx: 9, fill: col, 'pointer-events': 'none' }));
    g.append(textBlock([label], x + 18 + pw / 2, y + ht - 17, 11, '#ffffff', 'middle', 600));
    const extra = [e.due && 'Due ' + e.due, e.notes && 'Notes'].filter(Boolean).join(' · ');
    if (extra) g.append(textBlock([extra], x + 26 + pw, y + ht - 17, 11, late ? '#d64545' : '#5d697c', 'start', late ? 600 : 400));
  } else if (e.type === 'frame') {
    g.append(s('rect', { x, y, width: w, height: ht, rx: 10, fill: exp ? 'rgba(36,71,214,.05)' : C.frame, stroke: exp ? '#9aa8c4' : C.frameLine, 'stroke-width': 1.5, 'pointer-events': 'none' }));
    if (!exp) g.append(s('rect', { x, y, width: w, height: ht, rx: 10, fill: 'none', stroke: 'transparent', 'stroke-width': 12, 'pointer-events': 'stroke' }));
    if (!hide) { const t = textBlock([e.text || 'Frame'], x + 4, y - 9, 13, exp ? '#5d697c' : C.muted, 'start', 600); t.removeAttribute('pointer-events'); g.append(t); }
  } else if (e.type === 'pen') {
    const d = 'M' + e.pts.map(p => (x + p[0]) + ' ' + (y + p[1])).join('L');
    g.append(s('path', { d, fill: 'none', stroke: e.stroke || ink, 'stroke-width': 2.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    if (!exp) g.append(s('path', { d, fill: 'none', stroke: 'transparent', 'stroke-width': 14 }));
  } else if (e.type === 'conn') {
    const [p, q] = ends(e), a = Math.atan2(q.y - p.y, q.x - p.x), L = 11, W = 0.42;
    g.append(s('line', { x1: p.x, y1: p.y, x2: q.x - Math.cos(a) * 6, y2: q.y - Math.sin(a) * 6, stroke: ink, 'stroke-width': 1.8, 'stroke-linecap': 'round' }));
    g.append(s('polygon', { points: `${q.x},${q.y} ${q.x - L * Math.cos(a - W)},${q.y - L * Math.sin(a - W)} ${q.x - L * Math.cos(a + W)},${q.y - L * Math.sin(a + W)}`, fill: ink }));
    if (!exp) g.append(s('line', { x1: p.x, y1: p.y, x2: q.x, y2: q.y, stroke: 'transparent', 'stroke-width': 14 }));
  }
  if (e.rot && e.type !== 'conn') g.setAttribute('transform', `rotate(${e.rot} ${x + w / 2} ${y + ht / 2})`);
  return g;
}
function draw() {
  const cs = getComputedStyle(document.documentElement), v = n => cs.getPropertyValue(n).trim();
  C = { ink: v('--ink'), muted: v('--muted'), accent: v('--accent'), frame: v('--frame'), frameLine: v('--frame-line') };
  const t = `translate(${cam.x},${cam.y}) scale(${cam.z})`;
  vp.setAttribute('transform', t); ov.setAttribute('transform', t); $('#dots').setAttribute('patternTransform', t);
  vp.replaceChildren(...sorted().map(e => renderEl(e, false)));
  drawOverlay();
  const zv = $('#zoomv'); if (zv) zv.textContent = Math.round(cam.z * 100) + '%';
}
function drawOverlay(extra) {
  const k = 1 / cam.z, list = selEls(), out = [];
  for (const e of list) {
    const b = e.type === 'conn' ? bbox(e) : e, col = e.locked ? '#d64545' : C.accent;
    const g = s('g', { transform: e.rot && e.type !== 'conn' ? `rotate(${e.rot} ${e.x + e.w / 2} ${e.y + e.h / 2})` : null },
      s('rect', { x: b.x - 3 * k, y: b.y - 3 * k, width: b.w + 6 * k, height: b.h + 6 * k, fill: 'none', stroke: col, 'stroke-width': 1.5 * k, 'stroke-dasharray': e.locked ? `${4 * k} ${3 * k}` : null, 'pointer-events': 'none' }));
    if (list.length === 1 && !e.locked && BOXY.includes(e.type) && !editing) {
      const mx = e.x + e.w / 2, my = e.y + e.h / 2, x1 = e.x + e.w, y1 = e.y + e.h;
      if (e.type !== 'frame') g.append(
        s('line', { x1: mx, y1: e.y - 3 * k, x2: mx, y2: e.y - 26 * k, stroke: col, 'stroke-width': k, 'pointer-events': 'none' }),
        s('circle', { 'data-h': 'rot', cx: mx, cy: e.y - 26 * k, r: 5.5 * k, fill: '#ffffff', stroke: col, 'stroke-width': 1.5 * k, style: 'cursor:grab' }, s('title', null, 'Rotate (hold Shift for 15 degree steps)')));
      for (const [n, px, py, cur] of [['n', mx, e.y, 'ns'], ['s', mx, y1, 'ns'], ['w', e.x, my, 'ew'], ['e', x1, my, 'ew'], ['nw', e.x, e.y, 'nwse'], ['ne', x1, e.y, 'nesw'], ['sw', e.x, y1, 'nesw'], ['se', x1, y1, 'nwse']]) {
        const r = (n.length === 1 ? 4 : 5) * k;
        g.append(s('rect', { 'data-h': n, x: px - r, y: py - r, width: r * 2, height: r * 2, rx: n.length === 1 ? r : 0, fill: '#ffffff', stroke: col, 'stroke-width': 1.5 * k, style: `cursor:${cur}-resize` }));
      }
    }
    out.push(g);
  }
  if (extra) out.push(extra);
  ov.replaceChildren(...out);
}
const otherBoxes = skip => all().filter(e => e.type !== 'conn' && !skip.has(e.id)).map(bbox);
function guideMarks(guides) {
  if (!guides.length) return null; const k = 1 / cam.z;
  return s('g', { 'pointer-events': 'none' }, guides.map(g => s('line', { ...(g.axis === 'x' ? { x1: g.pos, x2: g.pos, y1: g.from, y2: g.to } : { y1: g.pos, y2: g.pos, x1: g.from, x2: g.to }), stroke: '#e0409a', 'stroke-width': k })));
}
function refresh() {
  draw(); renderCtx(); renderTasks();
  const u = $('#undo'), r = $('#redo'); if (u) { u.disabled = !hist.undo.length; r.disabled = !hist.redo.length; }
  document.querySelectorAll('.tools button').forEach(b => b.classList.toggle('on', b.dataset.tool === tool));
}

/* ---------- Actions ---------- */
function removeSel() {
  const ids = new Set(selEls().filter(e => !e.locked).map(e => e.id)); if (!ids.size) return;
  for (const e of all()) if (ids.has(e.id) || (e.type === 'conn' && (ids.has(e.a) || ids.has(e.b)))) delete board.els[e.id];
  sel.clear(); commit();
}
function pasteEls(src, dx) {
  const map = {}, gmap = {}; let z = topZ(); sel.clear();
  for (const o of src) map[o.id] = uid('e');
  for (const o of src) {
    const e = clone(o); e.id = map[o.id]; e.z = ++z; delete e.locked;
    if (e.g) e.g = gmap[e.g] || (gmap[e.g] = uid('g'));
    if (e.type === 'conn') { e.a = map[e.a] || null; e.b = map[e.b] || null; e.ax += dx; e.ay += dx; e.bx += dx; e.by += dx; } else { e.x += dx; e.y += dx; }
    board.els[e.id] = e; sel.add(e.id);
  }
  commit();
}
function copySel() {
  clip = selEls().map(e => { const c = clone(e); if (c.type === 'conn') { const [p, q] = ends(e); c.ax = p.x; c.ay = p.y; c.bx = q.x; c.by = q.y; } return c; });
}
function align(kind) {
  const list = selEls().filter(e => !e.locked && e.type !== 'conn'), b = bounds(list); if (!b || list.length < 2) return;
  if (kind === 'dh' || kind === 'dv') {
    const ax = kind === 'dh' ? 'x' : 'y', sz = kind === 'dh' ? 'w' : 'h'; list.sort((p, q) => p[ax] + p[sz] / 2 - q[ax] - q[sz] / 2);
    const first = list[0][ax] + list[0][sz] / 2, last = list[list.length - 1][ax] + list[list.length - 1][sz] / 2;
    list.forEach((e, i) => { e[ax] = Math.round(first + (last - first) * i / (list.length - 1) - e[sz] / 2); });
  } else for (const e of list) {
    const bb = bbox(e);
    if (kind === 'l') e.x += b.x - bb.x; if (kind === 'c') e.x += b.x + (b.w - bb.w) / 2 - bb.x; if (kind === 'r') e.x += b.x + b.w - bb.w - bb.x;
    if (kind === 't') e.y += b.y - bb.y; if (kind === 'm') e.y += b.y + (b.h - bb.h) / 2 - bb.y; if (kind === 'b') e.y += b.y + b.h - bb.h - bb.y;
    e.x = Math.round(e.x); e.y = Math.round(e.y);
  }
  commit();
}
function arrange(kind) {
  const list = selEls(); if (!list.length) return;
  if (kind === 'front') { let z = topZ(); list.sort((a, b) => a.z - b.z).forEach(e => { e.z = ++z; }); }
  if (kind === 'back') { let z = all().reduce((m, e) => Math.min(m, e.z), 0) - list.length; list.sort((a, b) => a.z - b.z).forEach(e => { e.z = z++; }); }
  if (kind === 'group' && list.length > 1) { const g = uid('g'); list.forEach(e => { e.g = g; }); }
  if (kind === 'ungroup') list.forEach(e => { delete e.g; });
  if (kind === 'lock') list.forEach(e => { e.locked = true; });
  if (kind === 'unlock') list.forEach(e => { delete e.locked; });
  commit();
}
function zoomAt(f, sx, sy) {
  const r = cv.getBoundingClientRect(); if (sx == null) { sx = r.width / 2; sy = r.height / 2; }
  const z = Math.min(4, Math.max(0.1, cam.z * f)), k = z / cam.z;
  cam.x = sx - (sx - cam.x) * k; cam.y = sy - (sy - cam.y) * k; cam.z = z; draw(); placeEditor();
}
function fit(list) {
  const r = cv.getBoundingClientRect(), b = bounds(list || all());
  if (!b || !r.width) { cam = { x: r.width / 2 || 300, y: r.height / 2 || 200, z: 1 }; return draw(); }
  const z = Math.min(1.25, Math.max(0.1, Math.min((r.width - 100) / Math.max(b.w, 1), (r.height - 120) / Math.max(b.h, 1))));
  cam = { z, x: r.width / 2 - (b.x + b.w / 2) * z, y: r.height / 2 - (b.y + b.h / 2) * z + 14 }; draw();
}
function makeBox(type, x, y, w, ht) {
  const d = { sticky: [180, 150], text: [240, 30], rect: [160, 100], ellipse: [160, 100], diamond: [170, 110], card: [240, 100], frame: [480, 320] }[type];
  const drawn = w > 8 && ht > 8, e = { id: uid('e'), type, z: topZ() + 1, x: Math.round(drawn ? x : x - d[0] / 2), y: Math.round(drawn ? y : y - d[1] / 2), w: Math.round(drawn && type !== 'card' ? Math.max(w, 30) : d[0]), h: Math.round(drawn && type !== 'card' && type !== 'text' ? Math.max(ht, 30) : d[1]), text: '' };
  if (type === 'sticky') e.fill = FILLS[0];
  if (['rect', 'ellipse', 'diamond'].includes(type)) e.fill = '#ffffff';
  if (type === 'card') Object.assign(e, { text: 'New task', status: 'todo', due: '', notes: '' });
  if (type === 'frame') e.text = 'Frame';
  board.els[e.id] = e; sel = new Set([e.id]); tool = 'select'; commit();
  if (type !== 'frame') startEdit(e.id);
}

/* ---------- Text editing ---------- */
function placeEditor() {
  const ed = $('#ed'), e = editing && E(editing); if (!e) return;
  const z = cam.z, box = e.type === 'card' ? [e.x + 10, e.y + 6, e.w - 20, 46, 14] : e.type === 'frame' ? [e.x, e.y - 28, Math.max(e.w, 160), 24, 13]
    : e.type === 'sticky' ? [e.x, e.y, e.w, e.h, 16] : e.type === 'text' ? [e.x - 2, e.y - 2, e.w + 4, e.h + 4, 18] : [e.x, e.y, e.w, e.h, 15];
  Object.assign(ed.style, { display: 'block', left: cam.x + box[0] * z + 'px', top: cam.y + box[1] * z + 'px', width: box[2] * z + 'px', height: Math.max(box[3] * z, 24) + 'px', fontSize: box[4] * z + 'px',
    padding: (e.type === 'sticky' ? 10 : e.type === 'frame' || e.type === 'text' ? 2 : 8) * z + 'px', fontWeight: e.type === 'card' || e.type === 'frame' ? 600 : 400,
    textAlign: ['rect', 'ellipse', 'diamond'].includes(e.type) ? 'center' : 'left', background: e.type === 'sticky' ? e.fill : '#ffffff',
    transform: e.rot ? `rotate(${e.rot}deg)` : '', transformOrigin: `${(e.x + e.w / 2 - box[0]) * z}px ${(e.y + e.h / 2 - box[1]) * z}px` });
}
function startEdit(id) {
  const e = E(id); if (!e || e.locked || !TEXTY.includes(e.type)) return;
  editing = id; const ed = $('#ed'); ed.value = e.text || ''; placeEditor(); refresh(); ed.focus(); ed.select();
}
function endEdit() {
  if (!editing) return; const e = E(editing), ed = $('#ed'); editing = null; ed.style.display = 'none';
  if (e) { e.text = ed.value.replace(/\s+$/, ''); if (e.type === 'text' && !e.text) delete board.els[e.id]; else { if (e.type === 'frame' && !e.text) e.text = 'Frame'; if (e.type === 'card' && !e.text) e.text = 'Untitled task'; fitText(e); } }
  edFor = null; commit();
}

/* ---------- Pointer input ---------- */
function pt(ev) { const r = cv.getBoundingClientRect(), sx = ev.clientX - r.left, sy = ev.clientY - r.top; return { sx, sy, x: (sx - cam.x) / cam.z, y: (sy - cam.y) / cam.z }; }
function idAt(target) { const g = target && target.closest && target.closest('[data-id]'); return g ? g.getAttribute('data-id') : null; }
function onDown(ev) {
  if (ev.button === 2) return;
  const act = document.activeElement; if (act && act !== document.body && act.blur) act.blur();
  if (editing) endEdit();
  const p = pt(ev), id = idAt(ev.target), now = Date.now();
  const dbl = now - lastDown.t < 350 && Math.hypot(ev.clientX - lastDown.x, ev.clientY - lastDown.y) < 6; lastDown = { t: dbl ? 0 : now, x: ev.clientX, y: ev.clientY };
  cv.setPointerCapture(ev.pointerId);
  if (ev.button === 1 || spaceDown) { mode = { k: 'pan', sx: ev.clientX, sy: ev.clientY, cx: cam.x, cy: cam.y }; return; }
  if (tool === 'select') {
    if (ev.target.dataset && ev.target.dataset.h) { const e = selEls()[0], hd = ev.target.dataset.h; mode = hd === 'rot' ? { k: 'rotate', e } : { k: 'resize', hd, e, o: clone(e), p, others: otherBoxes(new Set([e.id])) }; return; }
    if (dbl) { if (id) { sel = new Set([id]); refresh(); startEdit(id); } else makeBox('sticky', p.x, p.y, 0, 0); return; }
    if (id) {
      const had = sel.has(id);
      if (ev.shiftKey) { group(id).forEach(i => had ? sel.delete(i) : sel.add(i)); refresh(); return; }
      if (!had) sel = new Set(group(id));
      const move = new Set(selEls().filter(e => !e.locked).map(e => e.id));
      for (const f of selEls()) if (f.type === 'frame' && !f.locked) for (const e of all()) if (e.type !== 'conn' && e.type !== 'frame' && !e.locked && e.x >= f.x && e.y >= f.y && e.x + e.w <= f.x + f.w && e.y + e.h <= f.y + f.h) move.add(e.id);
      mode = { k: 'drag', p, id, had, moved: false, start: [...move].map(i => clone(E(i))), box0: bounds([...move].map(E)), others: otherBoxes(move) }; refresh(); return;
    }
    if (!ev.shiftKey) sel.clear(); mode = { k: 'marquee', p, keep: new Set(sel) }; refresh(); return;
  }
  if (tool === 'pen') { mode = { k: 'pen', pts: [[p.x, p.y]] }; return; }
  if (tool === 'conn') { mode = { k: 'conn', a: id && E(id).type !== 'conn' ? id : null, p }; return; }
  mode = { k: 'create', p };
}
function onMove(ev) {
  if (!mode) return; const p = pt(ev), k = 1 / cam.z;
  if (mode.k === 'pan') { cam.x = mode.cx + ev.clientX - mode.sx; cam.y = mode.cy + ev.clientY - mode.sy; draw(); }
  else if (mode.k === 'drag') {
    let dx = p.x - mode.p.x, dy = p.y - mode.p.y, guides = []; if (!mode.moved && Math.hypot(dx, dy) * cam.z < 3) return; mode.moved = true;
    if (mode.box0 && !ev.ctrlKey && !ev.metaKey) { const r = snapMove({ x: mode.box0.x + dx, y: mode.box0.y + dy, w: mode.box0.w, h: mode.box0.h }, mode.others, 6 / cam.z); dx += r.dx; dy += r.dy; guides = r.guides; }
    for (const o of mode.start) { const e = E(o.id); if (e.type === 'conn') { e.ax = o.ax + dx; e.ay = o.ay + dy; e.bx = o.bx + dx; e.by = o.by + dy; } else { e.x = Math.round(o.x + dx); e.y = Math.round(o.y + dy); } }
    draw(); drawOverlay(guideMarks(guides));
  } else if (mode.k === 'resize') {
    const { e, o, hd } = mode, r = G.resizeBox(o, hd, p.x - mode.p.x, p.y - mode.p.y, 30), guides = [];
    if (!o.rot && !ev.ctrlKey && !ev.metaKey) {
      const thr = 6 / cam.z, west = hd.includes('w'), north = hd.includes('n');
      if (west || hd.includes('e')) { const sx = snapPoint(west ? r.x : r.x + r.w, 'x', mode.others, thr, [r.y, r.y + r.h]), w = sx && (west ? r.x + r.w - sx.v : sx.v - r.x); if (sx && w >= 30) { if (west) r.x = sx.v; r.w = w; guides.push(sx.guide); } }
      if (north || hd.includes('s')) { const sy = snapPoint(north ? r.y : r.y + r.h, 'y', mode.others, thr, [r.x, r.x + r.w]), ht = sy && (north ? r.y + r.h - sy.v : sy.v - r.y); if (sy && ht >= 30) { if (north) r.y = sy.v; r.h = ht; guides.push(sy.guide); } }
    }
    Object.assign(e, { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) }); fitText(e); draw(); drawOverlay(guideMarks(guides));
  } else if (mode.k === 'rotate') {
    const e = mode.e, a = G.handleAngle(e.x + e.w / 2, e.y + e.h / 2, p.x, p.y, ev.shiftKey);
    if (a) e.rot = a; else delete e.rot; draw();
  } else if (mode.k === 'marquee') {
    const x = Math.min(p.x, mode.p.x), y = Math.min(p.y, mode.p.y), w = Math.abs(p.x - mode.p.x), ht = Math.abs(p.y - mode.p.y);
    sel = new Set(mode.keep); for (const e of all()) { const b = bbox(e); if (b.x < x + w && b.x + b.w > x && b.y < y + ht && b.y + b.h > y) sel.add(e.id); }
    drawOverlay(s('rect', { x, y, width: w, height: ht, fill: C.accent, 'fill-opacity': 0.08, stroke: C.accent, 'stroke-width': k, 'pointer-events': 'none' }));
  } else if (mode.k === 'pen') {
    const l = mode.pts[mode.pts.length - 1]; if (Math.hypot(p.x - l[0], p.y - l[1]) * cam.z > 2) mode.pts.push([p.x, p.y]);
    drawOverlay(s('path', { d: 'M' + mode.pts.map(q => q[0] + ' ' + q[1]).join('L'), fill: 'none', stroke: C.ink, 'stroke-width': 2.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'pointer-events': 'none' }));
  } else if (mode.k === 'conn') {
    const a = mode.a ? E(mode.a) : null, from = a ? { x: a.x + a.w / 2, y: a.y + a.h / 2 } : mode.p;
    drawOverlay(s('line', { x1: from.x, y1: from.y, x2: p.x, y2: p.y, stroke: C.accent, 'stroke-width': 2 * k, 'stroke-dasharray': `${5 * k} ${4 * k}`, 'pointer-events': 'none' }));
  } else if (mode.k === 'create') {
    drawOverlay(s('rect', { x: Math.min(p.x, mode.p.x), y: Math.min(p.y, mode.p.y), width: Math.abs(p.x - mode.p.x), height: Math.abs(p.y - mode.p.y), fill: 'none', stroke: C.accent, 'stroke-width': 1.5 * k, 'pointer-events': 'none' }));
  }
}
function onUp(ev) {
  if (!mode) return; const m = mode, p = pt(ev); mode = null;
  if (m.k === 'drag') { if (m.moved) commit(); else if (m.had && sel.size > 1) { sel = new Set(group(m.id)); refresh(); } }
  else if (m.k === 'resize' || m.k === 'rotate') commit();
  else if (m.k === 'marquee') refresh();
  else if (m.k === 'pen') {
    if (m.pts.length > 1) {
      const x = Math.min(...m.pts.map(q => q[0])), y = Math.min(...m.pts.map(q => q[1]));
      const e = { id: uid('e'), type: 'pen', z: topZ() + 1, x: Math.round(x), y: Math.round(y), w: Math.round(Math.max(...m.pts.map(q => q[0])) - x), h: Math.round(Math.max(...m.pts.map(q => q[1])) - y), pts: m.pts.map(q => [Math.round((q[0] - x) * 10) / 10, Math.round((q[1] - y) * 10) / 10]) };
      board.els[e.id] = e;
    }
    commit();
  } else if (m.k === 'conn') {
    let b = idAt(document.elementFromPoint(ev.clientX, ev.clientY)); if (b && (E(b).type === 'conn' || b === m.a)) b = null;
    if ((m.a && b) || Math.hypot(p.x - m.p.x, p.y - m.p.y) > 12) { const e = { id: uid('e'), type: 'conn', z: topZ() + 1, a: m.a, b, ax: m.p.x, ay: m.p.y, bx: p.x, by: p.y }; board.els[e.id] = e; sel = new Set([e.id]); }
    tool = 'select'; commit();
  } else if (m.k === 'create') makeBox(tool, Math.min(p.x, m.p.x), Math.min(p.y, m.p.y), Math.abs(p.x - m.p.x), Math.abs(p.y - m.p.y));
}
function onKey(ev) {
  if (!board) return; const tgt = ev.target, typing = tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.tagName === 'SELECT');
  if (typing || (tgt && tgt.tagName === 'BUTTON' && (ev.key === 'Enter' || ev.key === ' '))) return;
  const mod = ev.ctrlKey || ev.metaKey, k = ev.key.toLowerCase(); let done = true;
  if (k === ' ') { spaceDown = true; cv.classList.add('pan'); }
  else if (mod && k === 'z') ev.shiftKey ? travel('redo') : travel('undo');
  else if (mod && k === 'y') travel('redo');
  else if (mod && k === 'd') { copySel(); const c = clip; pasteEls(c, 24); }
  else if (mod && k === 'c') copySel();
  else if (mod && k === 'v') { if (clip.length) { pasteEls(clip, 24); copySel(); } }
  else if (mod && k === 'a') { sel = new Set(Object.keys(board.els)); refresh(); }
  else if (mod && k === 'g') arrange(ev.shiftKey ? 'ungroup' : 'group');
  else if (mod && ev.shiftKey && k === 'l') arrange(selEls().some(e => !e.locked) ? 'lock' : 'unlock');
  else if (mod) done = false;
  else if (k === 'delete' || k === 'backspace') removeSel();
  else if (k === 'escape') { sel.clear(); tool = 'select'; refresh(); }
  else if (k.startsWith('arrow')) {
    const d = ev.shiftKey ? 10 : 1, dx = k === 'arrowleft' ? -d : k === 'arrowright' ? d : 0, dy = k === 'arrowup' ? -d : k === 'arrowdown' ? d : 0;
    for (const e of selEls()) if (!e.locked) { if (e.type === 'conn') { e.ax += dx; e.bx += dx; e.ay += dy; e.by += dy; } else { e.x += dx; e.y += dy; } } commit();
  }
  else if (k === ']') arrange('front'); else if (k === '[') arrange('back');
  else if (k === '=' || k === '+') zoomAt(1.2); else if (k === '-') zoomAt(1 / 1.2); else if (k === '1' && ev.shiftKey || k === '!') fit();
  else if (k === 'enter' && sel.size === 1) startEdit([...sel][0]);
  else { const t = { v: 'select', s: 'sticky', t: 'text', r: 'rect', o: 'ellipse', d: 'diamond', c: 'card', f: 'frame', l: 'conn', p: 'pen' }[k]; if (t) { tool = t; refresh(); } else done = false; }
  if (done) ev.preventDefault();
}

/* ---------- Board chrome ---------- */
const ICON = { select: 'M5 3l10 6-4.5 1.2L13 15l-2 1-2.4-4.7L5 14z', sticky: 'M4 4h12v8l-4 4H4zM16 12h-4v4', text: 'M5 5h10M10 5v11', rect: 'M4 6h12v8H4z', ellipse: 'M3 10a7 5 0 1 0 14 0a7 5 0 1 0-14 0',
  diamond: 'M10 3l7 7-7 7-7-7z', card: 'M3 5h14v10H3zM6 8.5h7M6 11.5h3', frame: 'M6 3v14M14 3v14M3 6h14M3 14h14', conn: 'M4 15L15 5M10 5h5v5', pen: 'M4 16l1-4 8-8 3 3-8 8z' };
const TOOLS = [['select', 'Select (V)'], ['sticky', 'Sticky note (S)'], ['text', 'Text (T)'], ['rect', 'Rectangle (R)'], ['ellipse', 'Ellipse (O)'], ['diamond', 'Diamond (D)'], ['card', 'Task card (C)'], ['frame', 'Frame (F)'], ['conn', 'Connector (L)'], ['pen', 'Draw (P)']];
async function openBoard(id) {
  const m = meta(id); if (!m) return;
  $('#app').replaceChildren(h('div', { class: 'loading' }, 'Opening ' + m.name));
  const data = await Store.get('b_' + id) || { els: {} };
  board = { id, els: data.els || {} }; hist.reset(board.els);
  sel = new Set(); tool = 'select'; editing = null; edFor = null; taskFilter = 'all'; tasksOpen = window.innerWidth > 800;
  const [sc, st] = statParts();
  const menu = (id2, label, opts, fn) => h('select', { id: id2, 'aria-label': label, onchange: e => { const v = e.target.value; e.target.value = ''; if (v) fn(v); } }, h('option', { value: '' }, label), opts.map(o => h('option', { value: o[0] }, o[1])));
  $('#app').replaceChildren(h('div', { class: 'board' },
    h('header', { class: 'top' },
      h('button', { onclick: () => { if (editing) endEdit(); saveNow(); renderHome(); } }, 'All boards'),
      h('input', { class: 'bname', id: 'board-name', type: 'text', value: m.name, 'aria-label': 'Board name', onchange: e => { m.name = e.target.value.trim() || m.name; e.target.value = m.name; saveIndex(); } }),
      h('div', { class: 'stat', id: 'stat' }, h('span', { class: 'dot ' + sc }), st),
      h('button', { id: 'undo', title: 'Undo (Ctrl+Z)', onclick: () => travel('undo') }, 'Undo'),
      h('button', { id: 'redo', title: 'Redo (Ctrl+Shift+Z)', onclick: () => travel('redo') }, 'Redo'),
      h('button', { title: 'Zoom out', 'aria-label': 'Zoom out', onclick: () => zoomAt(1 / 1.2) }, '−'),
      h('button', { class: 'zoomv', id: 'zoomv', title: 'Reset to 100%', onclick: () => zoomAt(1 / cam.z) }, '100%'),
      h('button', { title: 'Zoom in', 'aria-label': 'Zoom in', onclick: () => zoomAt(1.2) }, '+'),
      h('button', { title: 'Fit everything (Shift+1)', onclick: () => fit() }, 'Fit'),
      menu('export', 'Export', [['png', 'PNG image'], ['svg', 'SVG vector']], exportAs),
      h('button', { id: 'tasks-toggle', onclick: () => { tasksOpen = !tasksOpen; edFor = null; renderTasks(); } }, 'Tasks')),
    h('div', { class: 'work' },
      h('nav', { class: 'tools', 'aria-label': 'Tools' }, TOOLS.map(([t, label]) => h('button', { 'data-tool': t, title: label, 'aria-label': label, onclick: () => { tool = t; refresh(); } }, s('svg', { viewBox: '0 0 20 20' }, s('path', { d: ICON[t] }))))),
      h('div', { class: 'stage' }, h('div', { class: 'ctx', id: 'ctx', hidden: true }),
        h('textarea', { id: 'ed', 'aria-label': 'Edit text', onblur: endEdit, onkeydown: e => { e.stopPropagation(); const one = editing && ['card', 'frame'].includes(E(editing).type); if (e.key === 'Escape' || (e.key === 'Enter' && (one || e.ctrlKey || e.metaKey))) { e.preventDefault(); e.target.blur(); } } })),
      h('aside', { class: 'tasks', id: 'tasks', 'aria-label': 'Tasks' }, h('div', { id: 'thead' }), h('div', { id: 'ted' }), h('div', { class: 'tlist', id: 'tlist' })))));
  cv = s('svg', { id: 'cv', role: 'application', 'aria-label': 'Board canvas' },
    s('defs', null,
      s('pattern', { id: 'dots', width: 24, height: 24, patternUnits: 'userSpaceOnUse' }, s('circle', { cx: 1, cy: 1, r: 1, style: 'fill:var(--dot)' })),
      s('filter', { id: 'sh', x: '-10%', y: '-10%', width: '120%', height: '130%' }, s('feDropShadow', { dx: 0, dy: 2, stdDeviation: 3, 'flood-color': '#0a1428', 'flood-opacity': 0.16 }))),
    s('rect', { width: '100%', height: '100%', fill: 'url(#dots)' }));
  vp = s('g'); ov = s('g'); cv.append(vp, ov); $('.stage').prepend(cv);
  cv.addEventListener('pointerdown', onDown); cv.addEventListener('mousedown', ev => ev.preventDefault()); cv.addEventListener('pointermove', onMove); cv.addEventListener('pointerup', onUp); cv.addEventListener('pointercancel', onUp);
  cv.addEventListener('wheel', ev => { ev.preventDefault(); const p = pt(ev); if (ev.ctrlKey || ev.metaKey) zoomAt(Math.exp(-ev.deltaY * 0.01), p.sx, p.sy); else { cam.x -= ev.deltaX; cam.y -= ev.deltaY; draw(); placeEditor(); } }, { passive: false });
  fit(); refresh();
}
function renderCtx() {
  const el = $('#ctx'); if (!el) return; const list = selEls();
  if (!list.length || editing) { el.hidden = true; return; } el.hidden = false;
  const menu = (id, label, opts, fn) => h('select', { id, 'aria-label': label, onchange: e => { const v = e.target.value; if (v) fn(v); } }, h('option', { value: '' }, label), opts.map(o => h('option', { value: o[0] }, o[1])));
  const fillable = list.filter(e => ['sticky', 'rect', 'ellipse', 'diamond'].includes(e.type) && !e.locked);
  el.replaceChildren(...[
    fillable.length ? FILLS.map(c => h('button', { class: 'sw', style: 'background:' + c, title: 'Fill ' + c, 'aria-label': 'Fill ' + c, onclick: () => { fillable.forEach(e => { e.fill = c; }); commit(); } })) : [],
    list.length > 1 ? menu('align', 'Align', [['l', 'Left edges'], ['c', 'Centers'], ['r', 'Right edges'], ['t', 'Top edges'], ['m', 'Middles'], ['b', 'Bottom edges'], ['dh', 'Space evenly across'], ['dv', 'Space evenly down']], align) : null,
    menu('arrange', 'Arrange', [['front', 'Bring to front'], ['back', 'Send to back'], ['group', 'Group'], ['ungroup', 'Ungroup'], ['lock', 'Lock'], ['unlock', 'Unlock']], arrange),
    h('button', { onclick: () => { copySel(); pasteEls(clip, 24); } }, 'Duplicate'),
    h('button', { class: 'danger', onclick: removeSel }, 'Delete')].flat().filter(Boolean));
}
function renderTasks() {
  const el = $('#tasks'); if (!el) return; el.hidden = !tasksOpen; if (!tasksOpen) return;
  const cards = all().filter(e => e.type === 'card').sort((a, b) => (a.due || '9') < (b.due || '9') ? -1 : 1), cur = selEls().length === 1 && selEls()[0].type === 'card' ? selEls()[0] : null;
  const n = k => cards.filter(c => k === 'all' || c.status === k).length;
  $('#thead').replaceChildren(h('h2', null, 'Tasks'),
    h('div', { class: 'chips' }, [['all', 'All'], ...Object.entries(STATUS).map(([k, v]) => [k, v[0], v[1]])].map(([k, label, col]) =>
      h('button', { class: 'chip' + (taskFilter === k ? ' on' : ''), onclick: () => { taskFilter = k; renderTasks(); } }, col && h('b', { style: 'background:' + col }), `${label} ${n(k)}`))));
  if ((cur ? cur.id : '') !== edFor) {
    edFor = cur ? cur.id : '';
    const set = (key, live) => e => { cur[key] = e.target.value; if (live) draw(); else commit(); };
    $('#ted').replaceChildren(...(cur ? [h('div', { class: 'ted' },
      h('label', { for: 'task-title' }, 'Task'), h('input', { type: 'text', id: 'task-title', value: cur.text, oninput: set('text', true), onchange: () => commit() }),
      h('div', { class: 'row' },
        h('select', { id: 'task-status', 'aria-label': 'Status', value: cur.status, onchange: set('status') }, Object.entries(STATUS).map(([k, v]) => h('option', { value: k }, v[0]))),
        h('input', { type: 'date', id: 'task-due', 'aria-label': 'Due date', value: cur.due || '', onchange: set('due') })),
      h('label', { for: 'task-notes' }, 'Notes'), h('textarea', { id: 'task-notes', value: cur.notes || '', oninput: e => { cur.notes = e.target.value; }, onchange: () => commit() }))] : []));
  }
  const show = cards.filter(c => taskFilter === 'all' || c.status === taskFilter);
  $('#tlist').replaceChildren(...(show.length ? show.map(c => {
    const late = c.due && c.due < today() && c.status !== 'done';
    return h('button', { class: 'trow' + (cur === c ? ' on' : ''), onclick: () => { sel = new Set([c.id]); const r = cv.getBoundingClientRect(); cam.x = r.width / 2 - (c.x + c.w / 2) * cam.z; cam.y = r.height / 2 - (c.y + c.h / 2) * cam.z; refresh(); } },
      h('i', { style: 'background:' + STATUS[c.status][1] }), h('div', null, h('strong', null, c.text), h('small', { class: late ? 'late' : '' }, STATUS[c.status][0] + (c.due ? (late ? ' · overdue ' : ' · due ') + c.due : ''))));
  }) : [h('p', { class: 'note' }, cards.length ? 'No tasks with this status.' : 'No tasks yet. Press C and click the board to add a task card.')]));
}

/* ---------- Export ---------- */
async function saveFile(name, data, mime) {
  const dl = window.claude && window.claude.use ? await window.claude.use('downloads') : null;
  if (dl) { try { await dl.save({ filename: name, data }); } catch (e) { if (!e || e.code !== 'declined') toast('Export failed. ' + ((e && e.message) || '')); } return; }
  const a = h('a', { href: URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type: mime })), download: name }); document.body.append(a); a.click(); a.remove();
}
function exportAs(kind) {
  const list = (sel.size ? selEls() : all()), b = bounds(list); if (!b) return toast('Nothing to export yet.');
  const pad = 36, w = Math.ceil(b.w + pad * 2), ht = Math.ceil(b.h + pad * 2), x = Math.floor(b.x - pad), y = Math.floor(b.y - pad);
  const order = sorted().filter(e => list.includes(e));
  const svg = s('svg', { viewBox: `${x} ${y} ${w} ${ht}`, width: w, height: ht }, s('rect', { x, y, width: w, height: ht, fill: '#ffffff' }), order.map(e => renderEl(e, true)));
  const str = new XMLSerializer().serializeToString(svg), name = (meta(board.id).name || 'board').replace(/[^\w\- ]+/g, '').trim() || 'board';
  if (kind === 'svg') return saveFile(name + '.svg', str, 'image/svg+xml');
  const img = new Image(), url = URL.createObjectURL(new Blob([str], { type: 'image/svg+xml' }));
  img.onload = () => {
    const k = Math.min(2, 8000 / Math.max(w, ht)), c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(ht * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
    c.toBlob(blob => blob ? saveFile(name + '.png', blob, 'image/png') : toast('Export failed. Try SVG instead.'), 'image/png');
  };
  img.onerror = () => toast('Export failed. Try SVG instead.'); img.src = url;
}

/* ---------- Boot ---------- */
window.addEventListener('keydown', onKey);
window.addEventListener('keyup', ev => { if (ev.key === ' ') { spaceDown = false; if (cv) cv.classList.remove('pan'); } });
window.addEventListener('pagehide', () => { if (board) saveNow(); });
(async () => {
  await Store.init();
  let idx = await Store.get('index');
  if (!idx && Store.mode === 'cloud' && Store.local('index')) { idx = Store.local('index'); for (const b of idx.boards) { const d = Store.local('b_' + b.id); if (d) Store.put('b_' + b.id, d); } Store.put('index', idx); }
  if (!idx) { idx = seed(); Store.put('index', idx); }
  index = idx; renderHome();
})();
