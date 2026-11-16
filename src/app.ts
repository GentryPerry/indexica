// @ts-nocheck
// UI layer, ported as-is from the single-file prototype. It is not type-checked yet:
// it will be split into typed modules when the canvas renderer is rebuilt.
import { $, h, s, uid, clone, today, toast } from './dom';
import { STATUS, FILLS, VIVID, FONTS, WEIGHTS, SIZES, TEXTY, BOXY } from './types';
import { fitText } from './geometry';
import { connGeom } from './connectors';
import { kick, step, still, atRest } from './cable';
import { renderEl } from './render';
import { STICKERS, TAPES } from './stickers';
import { monthGrid, shiftMonth, monthPrefix } from './calendar';
import { barPosition, miniFit, miniToWorld, union } from './layout';
import { groupTasks } from './tasks';
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
let tasksOpen = true, taskFilter = 'all', edFor = null, taskView = 'list', calDay = '';
let cal = { year: new Date().getFullYear(), month: new Date().getMonth() };
let stamp = { type: 'sticker', shape: 'star', pattern: 'stripes', fill: VIVID[2] }, connStyle = 'straight';
let kanban = false, miniOn = true, miniState = null, miniDrag = false, mini = null;
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
const ends = c => G.ends(c, E), bbox = e => G.bbox(e, E), bounds = list => G.bounds(list, E);

/* ---------- Rendering ---------- */
// Cables swing when their ends move. `mids` remembers where each cable was; `sways` holds the ones still moving.
const sways = new Map(), mids = new Map(); let swayRaf = 0, swayT = 0;
const calm = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const rctx = exp => ({ exp, ink: C.ink, muted: C.muted, canvas: C.canvas, frame: C.frame, frameLine: C.frameLine, hideId: exp ? null : editing, get: E, sway: exp ? undefined : id => sways.get(id) });
function trackCables() {
  const seen = new Set();
  for (const e of all()) if (e.type === 'conn' && e.style === 'cable') {
    const [p, q] = G.ends(e, E, 0), mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }, last = mids.get(e.id); seen.add(e.id); mids.set(e.id, mid);
    if (last && !calm && (last.x !== mid.x || last.y !== mid.y)) sways.set(e.id, kick(sways.get(e.id) || still(), mid.x - last.x, mid.y - last.y));
  }
  for (const id of [...mids.keys()]) if (!seen.has(id)) { mids.delete(id); sways.delete(id); }
  if (sways.size && !swayRaf) { swayT = performance.now(); swayRaf = requestAnimationFrame(swing); }
}
function swing(now) {
  swayRaf = 0; if (!board) { sways.clear(); return; }
  const dt = (now - swayT) / 1000;
  for (const [id, sp] of [...sways]) { const n = step(sp, dt); if (atRest(n)) sways.delete(id); else sways.set(id, n); }
  draw();
}
function draw() {
  const cs = getComputedStyle(document.documentElement), v = n => cs.getPropertyValue(n).trim();
  C = { ink: v('--ink'), muted: v('--muted'), accent: v('--accent'), canvas: v('--canvas'), frame: v('--frame'), frameLine: v('--frame-line') };
  trackCables();
  const t = `translate(${cam.x},${cam.y}) scale(${cam.z})`;
  vp.setAttribute('transform', t); ov.setAttribute('transform', t); $('#dots').setAttribute('patternTransform', t);
  const rc = rctx(false); vp.replaceChildren(...sorted().map(e => renderEl(e, rc)));
  drawOverlay();
  const zv = $('#zoomv'); if (zv) zv.textContent = Math.round(cam.z * 100) + '%';
  drawMini(); placeCtx();
}
function centerOn(e) { const r = cv.getBoundingClientRect(), b = bbox(e); cam.x = r.width / 2 - (b.x + b.w / 2) * cam.z; cam.y = r.height / 2 - (b.y + b.h / 2) * cam.z; }
function drawMini() {
  const el = $('#mini'); if (!el || !mini) return; el.hidden = !miniOn || kanban; if (el.hidden) return;
  const r = cv.getBoundingClientRect(), view = { x: -cam.x / cam.z, y: -cam.y / cam.z, w: r.width / cam.z, h: r.height / cam.z }, content = bounds(all());
  // While the map is being dragged the scale is frozen, so the board does not slide under the pointer.
  if (!miniDrag || !miniState) miniState = miniFit(content ? union(content, view) : view, 180, 120);
  const m = miniState, box = b => ({ x: b.x * m.k + m.ox, y: b.y * m.k + m.oy, width: Math.max(b.w * m.k, 1.5), height: Math.max(b.h * m.k, 1.5) });
  mini.replaceChildren(
    ...sorted().filter(e => e.type !== 'conn' && e.type !== 'pen').map(e => s('rect', { ...box(bbox(e)), rx: 1,
      fill: e.type === 'frame' ? 'none' : e.type === 'card' ? STATUS[e.status][1] : e.fill || C.muted, 'fill-opacity': e.type === 'text' ? 0.5 : 1, stroke: e.type === 'frame' ? C.frameLine : 'rgba(0,0,0,.15)', 'stroke-width': 0.75 })),
    s('rect', { ...box(view), rx: 2, fill: C.accent, 'fill-opacity': 0.1, stroke: C.accent, 'stroke-width': 1.5 }));
}
function miniGo(ev) {
  const r = mini.getBoundingClientRect(), w = miniToWorld(miniState, ev.clientX - r.left, ev.clientY - r.top), st = cv.getBoundingClientRect();
  cam.x = st.width / 2 - w.x * cam.z; cam.y = st.height / 2 - w.y * cam.z; draw(); placeEditor();
}
function placeCtx() {
  const el = $('#ctx'); if (!el || el.hidden) return; const b = bounds(selEls()); if (!b) return;
  const r = cv.getBoundingClientRect(), pos = barPosition({ x: cam.x + b.x * cam.z, y: cam.y + b.y * cam.z, w: b.w * cam.z, h: b.h * cam.z }, { w: el.offsetWidth, h: el.offsetHeight }, { w: r.width, h: r.height });
  el.style.left = pos.left + 'px'; el.style.top = pos.top + 'px';
}
function rotateHandle(mx, top, col, k) {
  return [s('line', { x1: mx, y1: top, x2: mx, y2: top - 23 * k, stroke: col, 'stroke-width': k, 'pointer-events': 'none' }),
    s('circle', { 'data-h': 'rot', cx: mx, cy: top - 23 * k, r: 5.5 * k, fill: '#ffffff', stroke: col, 'stroke-width': 1.5 * k, style: 'cursor:grab' }, s('title', null, 'Rotate (hold Shift for 15 degree steps)'))];
}
function drawOverlay(extra) {
  const k = 1 / cam.z, list = selEls(), out = [];
  for (const e of list) {
    const b = e.type === 'conn' ? bbox(e) : e, col = e.locked ? '#d64545' : C.accent;
    const g = s('g', { transform: e.rot && e.type !== 'conn' ? `rotate(${e.rot} ${e.x + e.w / 2} ${e.y + e.h / 2})` : null },
      s('rect', { x: b.x - 3 * k, y: b.y - 3 * k, width: b.w + 6 * k, height: b.h + 6 * k, fill: 'none', stroke: col, 'stroke-width': 1.5 * k, 'stroke-dasharray': e.locked ? `${4 * k} ${3 * k}` : null, 'pointer-events': 'none' }));
    if (list.length === 1 && !e.locked && e.type !== 'conn' && !editing) {
      const mx = e.x + e.w / 2, my = e.y + e.h / 2, x1 = e.x + e.w, y1 = e.y + e.h;
      g.append(...rotateHandle(mx, e.y - 3 * k, col, k));
      if (BOXY.includes(e.type)) for (const [n, px, py, cur] of [['n', mx, e.y, 'ns'], ['s', mx, y1, 'ns'], ['w', e.x, my, 'ew'], ['e', x1, my, 'ew'], ['nw', e.x, e.y, 'nwse'], ['ne', x1, e.y, 'nesw'], ['sw', e.x, y1, 'nesw'], ['se', x1, y1, 'nwse']]) {
        const r = (n.length === 1 ? 4 : 5) * k;
        g.append(s('rect', { 'data-h': n, x: px - r, y: py - r, width: r * 2, height: r * 2, rx: n.length === 1 ? r : 0, fill: '#ffffff', stroke: col, 'stroke-width': 1.5 * k, style: `cursor:${cur}-resize` }));
      }
    }
    if (list.length === 1 && !e.locked && e.type === 'conn' && !editing && !(mode && mode.k === 'connEnd')) {
      const gm = connGeom(e, E);
      for (const [n, at] of [['ca', gm.p], ['cb', gm.q]]) g.append(s('circle', { 'data-h': n, cx: at.x, cy: at.y, r: 6 * k, fill: '#ffffff', stroke: col, 'stroke-width': 1.5 * k, style: 'cursor:move' }, s('title', null, 'Drag to re-attach this end')));
    }
    out.push(g);
  }
  // Several pieces selected: one dashed box around them all, with a handle that turns the whole selection.
  const free = list.filter(e => !e.locked);
  if (list.length > 1 && free.filter(e => e.type !== 'conn').length > 1 && !editing) {
    const turning = mode && mode.k === 'grotate' ? mode : null, b = turning ? turning.box0 : bounds(free), mx = b.x + b.w / 2, pad = 9 * k;
    out.push(s('g', { transform: turning && turning.ang ? `rotate(${turning.ang} ${mx} ${b.y + b.h / 2})` : null },
      s('rect', { x: b.x - pad, y: b.y - pad, width: b.w + pad * 2, height: b.h + pad * 2, fill: 'none', stroke: C.accent, 'stroke-width': k, 'stroke-dasharray': `${5 * k} ${4 * k}`, 'pointer-events': 'none' }),
      rotateHandle(mx, b.y - pad, C.accent, k)));
  }
  if (extra) out.push(extra);
  ov.replaceChildren(...out);
}
/** Ids that move together: the unlocked selection plus everything sitting inside a selected frame. */
function moveSet() {
  const move = new Set(selEls().filter(e => !e.locked).map(e => e.id));
  for (const f of selEls()) if (f.type === 'frame' && !f.locked) for (const e of all()) if (e.type !== 'conn' && e.type !== 'frame' && !e.locked && e.x >= f.x && e.y >= f.y && e.x + e.w <= f.x + f.w && e.y + e.h <= f.y + f.h) move.add(e.id);
  return move;
}
const otherBoxes = skip => all().filter(e => e.type !== 'conn' && !skip.has(e.id)).map(bbox);
function guideMarks(guides) {
  if (!guides.length) return null; const k = 1 / cam.z;
  return s('g', { 'pointer-events': 'none' }, guides.map(g => s('line', { ...(g.axis === 'x' ? { x1: g.pos, x2: g.pos, y1: g.from, y2: g.to } : { y1: g.pos, y2: g.pos, x1: g.from, x2: g.to }), stroke: '#e0409a', 'stroke-width': k })));
}
function refresh() {
  draw(); renderCtx(); renderTasks(); renderFly(); renderKanban(); renderFrames();
  const u = $('#undo'), r = $('#redo'); if (u) { u.disabled = !hist.undo.length; r.disabled = !hist.redo.length; }
  document.querySelectorAll('.tools button').forEach(b => b.classList.toggle('on', b.dataset.tool === tool));
}

/* ---------- Actions ---------- */
function removeSel() {
  const ids = new Set(selEls().filter(e => !e.locked).map(e => e.id)); if (!ids.size) return;
  for (const e of all()) if (ids.has(e.id) || (e.type === 'conn' && (ids.has(e.a) || ids.has(e.b)))) delete board.els[e.id];
  sel.clear(); commit();
}
function pasteEls(src, dx, dy = dx, quiet = false) {
  const map = {}, gmap = {}; let z = topZ(); sel.clear();
  for (const o of src) map[o.id] = uid('e');
  for (const o of src) {
    const e = clone(o); e.id = map[o.id]; e.z = ++z; delete e.locked;
    if (e.g) e.g = gmap[e.g] || (gmap[e.g] = uid('g'));
    if (e.type === 'conn') { e.a = map[e.a] || null; e.b = map[e.b] || null; e.ax += dx; e.ay += dy; e.bx += dx; e.by += dy; } else { e.x += dx; e.y += dy; }
    board.els[e.id] = e; sel.add(e.id);
  }
  if (!quiet) commit();
}
// Copies of the selection that stand on their own: connector ends are stored as points in case their piece is not copied.
function snapSel() {
  return selEls().map(e => { const c = clone(e); if (c.type === 'conn') { const [p, q] = ends(e); c.ax = p.x; c.ay = p.y; c.bx = q.x; c.by = q.y; } return c; });
}
function copySel() { clip = snapSel(); }
function pasteAt(p) {
  const b = G.bounds(clip, id => clip.find(e => e.id === id)); if (!b) return;
  pasteEls(clip, Math.round(p.x - b.x - b.w / 2), Math.round(p.y - b.y - b.h / 2));
}
function nextSticky(id) {
  const o = E(id); if (!o || o.type !== 'sticky') return;
  const e = { ...clone(o), id: uid('e'), z: topZ() + 1, x: o.x + o.w + 20, text: '' }; delete e.g; delete e.locked;
  // Keep stepping right until the new note is not sitting on top of another piece.
  const hits = () => all().some(x => x.type !== 'frame' && x.type !== 'conn' && x.x < e.x + e.w && x.x + x.w > e.x && x.y < e.y + e.h && x.y + x.h > e.y);
  for (let i = 0; i < 40 && hits(); i++) e.x += 20;
  board.els[e.id] = e; sel = new Set([e.id]); commit(); startEdit(e.id);
}
function addTask(status) {
  const cards = all().filter(e => e.type === 'card'), r = cv.getBoundingClientRect();
  const x = cards.length ? Math.min(...cards.map(c => c.x)) : Math.round((r.width / 2 - cam.x) / cam.z - 120), y = cards.length ? Math.max(...cards.map(c => c.y + c.h)) + 20 : Math.round((r.height / 2 - cam.y) / cam.z - 50);
  const e = { id: uid('e'), type: 'card', z: topZ() + 1, x, y, w: 240, h: 100, text: 'New task', status, due: '', notes: '' };
  board.els[e.id] = e; sel = new Set([e.id]); tasksOpen = true; edFor = null; commit();
  const title = $('#task-title'); if (title) { title.focus(); title.select(); }
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
  const d = { sticky: [180, 150], text: [240, 30], rect: [160, 100], ellipse: [160, 100], diamond: [170, 110], card: [240, 100], frame: [480, 320], sticker: [84, 84], tape: [220, 32] }[type];
  const drawn = w > 8 && ht > 8, e = { id: uid('e'), type, z: topZ() + 1, x: Math.round(drawn ? x : x - d[0] / 2), y: Math.round(drawn ? y : y - d[1] / 2), w: Math.round(drawn && type !== 'card' ? Math.max(w, 30) : d[0]), h: Math.round(drawn && type !== 'card' && type !== 'text' ? Math.max(ht, 30) : d[1]), text: '' };
  if (type === 'sticky') e.fill = FILLS[0];
  if (['rect', 'ellipse', 'diamond'].includes(type)) e.fill = '#ffffff';
  if (type === 'card') Object.assign(e, { text: 'New task', status: 'todo', due: '', notes: '' });
  if (type === 'frame') e.text = 'Frame';
  const stuck = type === 'sticker' || type === 'tape';
  if (stuck) delete e.text;
  if (type === 'sticker') Object.assign(e, { shape: stamp.shape, fill: stamp.fill });
  if (type === 'tape') { Object.assign(e, { pattern: stamp.pattern || 'stripes', fill: stamp.fill }); if (!drawn) e.rot = -3; }
  // Stickers and tape keep the tool active so several can be placed in a row.
  board.els[e.id] = e; sel = new Set([e.id]); tool = stuck ? 'stamp' : 'select'; commit();
  if (type !== 'frame' && !stuck) startEdit(e.id);
}

/* ---------- Text editing ---------- */
function placeEditor() {
  const ed = $('#ed'), e = editing && E(editing); if (!e) return;
  const z = cam.z, st = G.textStyle(e), lab = e.type === 'conn' ? connGeom(e, E).label : null, centered = !!lab || ['rect', 'ellipse', 'diamond'].includes(e.type);
  const box = lab ? [lab.x - 90, lab.y - 15, 180, 30] : e.type === 'card' ? [e.x + 10, e.y + 6, e.w - 20, 46] : e.type === 'frame' ? [e.x, e.y - 28, Math.max(e.w, 160), 24]
    : e.type === 'text' ? [e.x - 2, e.y - 2, e.w + 4, e.h + 4] : [e.x, e.y, e.w, e.h];
  Object.assign(ed.style, { display: 'block', left: cam.x + box[0] * z + 'px', top: cam.y + box[1] * z + 'px', width: box[2] * z + 'px', height: Math.max(box[3] * z, 24) + 'px',
    fontSize: st.size * z + 'px', fontFamily: st.family, fontWeight: st.weight, fontStyle: st.italic ? 'italic' : 'normal',
    padding: (e.type === 'sticky' ? 10 : e.type === 'frame' || e.type === 'text' || lab ? 2 : 8) * z + 'px',
    textAlign: centered ? 'center' : 'left', background: e.type === 'sticky' ? e.fill : '#ffffff',
    transform: e.rot && !lab ? `rotate(${e.rot}deg)` : '', transformOrigin: lab ? '' : `${(e.x + e.w / 2 - box[0]) * z}px ${(e.y + e.h / 2 - box[1]) * z}px` });
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
  closeMenu(); if (ev.button === 2) return;
  const act = document.activeElement; if (act && act !== document.body && act.blur) act.blur();
  if (editing) endEdit();
  const p = pt(ev), id = idAt(ev.target), now = Date.now();
  const dbl = now - lastDown.t < 350 && Math.hypot(ev.clientX - lastDown.x, ev.clientY - lastDown.y) < 6; lastDown = { t: dbl ? 0 : now, x: ev.clientX, y: ev.clientY };
  cv.setPointerCapture(ev.pointerId);
  if (ev.button === 1 || spaceDown) { mode = { k: 'pan', sx: ev.clientX, sy: ev.clientY, cx: cam.x, cy: cam.y }; return; }
  if (tool === 'select') {
    if (ev.target.dataset && ev.target.dataset.h) { const e = selEls()[0], hd = ev.target.dataset.h; 
      if (hd === 'ca' || hd === 'cb') { mode = { k: 'connEnd', e, end: hd === 'ca' ? 'a' : 'b' }; return; }
      if (hd === 'rot') {
        const one = sel.size === 1, b = one ? e : bounds(selEls().filter(x => !x.locked)), c = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
        mode = { k: 'grotate', start: [...moveSet()].map(i => clone(E(i))), c, a0: Math.atan2(p.y - c.y, p.x - c.x), ang: 0, base: one ? e.rot || 0 : 0, box0: { x: b.x, y: b.y, w: b.w, h: b.h } }; return;
      }
      mode = { k: 'resize', hd, e, o: clone(e), p, others: otherBoxes(new Set([e.id])) }; return;
    }
    if (dbl) { if (id) { sel = new Set([id]); refresh(); startEdit(id); } else makeBox('sticky', p.x, p.y, 0, 0); return; }
    if (id) {
      const had = sel.has(id);
      if (ev.shiftKey) { group(id).forEach(i => had ? sel.delete(i) : sel.add(i)); refresh(); return; }
      if (!had) sel = new Set(group(id));
      // Alt-drag pulls a copy off the selection and leaves the original in place.
      if (ev.altKey) pasteEls(snapSel(), 0, 0, true);
      const move = moveSet();
      mode = { k: 'drag', p, id, had, dup: ev.altKey, moved: false, start: [...move].map(i => clone(E(i))), box0: bounds([...move].map(E)), others: otherBoxes(move) }; refresh(); return;
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
    if (ev.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
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
  } else if (mode.k === 'grotate') {
    const raw = (Math.atan2(p.y - mode.c.y, p.x - mode.c.x) - mode.a0) * 180 / Math.PI;
    mode.ang = G.snapAngle(mode.base + raw, ev.shiftKey) - mode.base;
    for (const o of mode.start) { const e = E(o.id); delete e.rot; Object.assign(e, G.rotateEl(o, mode.c.x, mode.c.y, mode.ang)); }
    draw();
  } else if (mode.k === 'connEnd') {
    const e = mode.e, n = mode.end; e[n] = null; e[n + 'x'] = Math.round(p.x); e[n + 'y'] = Math.round(p.y); draw();
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
  if (m.k === 'drag') { if (m.moved || m.dup) commit(); else if (m.had && sel.size > 1) { sel = new Set(group(m.id)); refresh(); } }
  else if (m.k === 'resize' || m.k === 'grotate') commit();
  else if (m.k === 'connEnd') {
    const other = m.end === 'a' ? m.e.b : m.e.a;
    const hit = document.elementsFromPoint(ev.clientX, ev.clientY).map(idAt).find(id => id && id !== other && E(id) && E(id).type !== 'conn');
    if (hit) m.e[m.end] = hit; commit();
  }
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
    if ((m.a && b) || Math.hypot(p.x - m.p.x, p.y - m.p.y) > 12) { const e = { id: uid('e'), type: 'conn', z: topZ() + 1, a: m.a, b, ax: m.p.x, ay: m.p.y, bx: p.x, by: p.y, ...(connStyle !== 'straight' ? { style: connStyle } : {}) }; board.els[e.id] = e; sel = new Set([e.id]); }
    tool = 'select'; commit();
  } else if (m.k === 'create') {
    let w = Math.abs(p.x - m.p.x), ht = Math.abs(p.y - m.p.y); if (ev.shiftKey) w = ht = Math.max(w, ht);
    makeBox(tool === 'stamp' ? stamp.type : tool, Math.min(p.x, m.p.x), Math.min(p.y, m.p.y), w, ht);
  }
}
function onKey(ev) {
  if (!board) return; const tgt = ev.target, typing = tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.tagName === 'SELECT');
  if (typing || (tgt && tgt.tagName === 'BUTTON' && (ev.key === 'Enter' || ev.key === ' '))) return;
  const mod = ev.ctrlKey || ev.metaKey, k = ev.key.toLowerCase(); let done = true;
  if (kanban && !mod && !['delete', 'backspace', 'escape', '?'].includes(k)) return;
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
  else if (k === 'escape') { closeMenu(); const hp = $('#help'); if (hp) hp.remove(); else if (kanban) kanban = false; else { sel.clear(); tool = 'select'; } refresh(); }
  else if (k.startsWith('arrow')) {
    const d = ev.shiftKey ? 10 : 1, dx = k === 'arrowleft' ? -d : k === 'arrowright' ? d : 0, dy = k === 'arrowup' ? -d : k === 'arrowdown' ? d : 0;
    for (const e of selEls()) if (!e.locked) { if (e.type === 'conn') { e.ax += dx; e.bx += dx; e.ay += dy; e.by += dy; } else { e.x += dx; e.y += dy; } } commit();
  }
  else if (k === '?') toggleHelp();
  else if (k === 'tab' && sel.size === 1 && E([...sel][0]).type === 'sticky') nextSticky([...sel][0]);
  else if (k === 'm') { miniOn = !miniOn; draw(); }
  else if (k === ']') arrange('front'); else if (k === '[') arrange('back');
  else if (k === '=' || k === '+') zoomAt(1.2); else if (k === '-') zoomAt(1 / 1.2); else if (k === '1' && ev.shiftKey || k === '!') fit();
  else if (k === 'enter' && sel.size === 1) startEdit([...sel][0]);
  else { const t = { v: 'select', s: 'sticky', t: 'text', r: 'rect', o: 'ellipse', d: 'diamond', c: 'card', f: 'frame', l: 'conn', p: 'pen', k: 'stamp' }[k]; if (t) { tool = t; refresh(); } else done = false; }
  if (done) ev.preventDefault();
}

/* ---------- Board chrome ---------- */
const ICON = { select: 'M5 3l10 6-4.5 1.2L13 15l-2 1-2.4-4.7L5 14z', sticky: 'M4 4h12v8l-4 4H4zM16 12h-4v4', text: 'M5 5h10M10 5v11', rect: 'M4 6h12v8H4z', ellipse: 'M3 10a7 5 0 1 0 14 0a7 5 0 1 0-14 0',
  diamond: 'M10 3l7 7-7 7-7-7z', card: 'M3 5h14v10H3zM6 8.5h7M6 11.5h3', frame: 'M6 3v14M14 3v14M3 6h14M3 14h14', conn: 'M4 15L15 5M10 5h5v5', pen: 'M4 16l1-4 8-8 3 3-8 8z', stamp: 'M10 2.5l2.3 4.8 5.2.7-3.8 3.6.9 5.2L10 14.3l-4.6 2.5.9-5.2L2.5 8l5.2-.7z' };
const TOOLS = [['select', 'Select (V)'], ['sticky', 'Sticky note (S)'], ['text', 'Text (T)'], ['rect', 'Rectangle (R)'], ['ellipse', 'Ellipse (O)'], ['diamond', 'Diamond (D)'], ['card', 'Task card (C)'], ['frame', 'Frame (F)'], ['conn', 'Connector (L)'], ['pen', 'Draw (P)'], ['stamp', 'Stickers and tape (K)']];
async function openBoard(id) {
  const m = meta(id); if (!m) return;
  $('#app').replaceChildren(h('div', { class: 'loading' }, 'Opening ' + m.name));
  const data = await Store.get('b_' + id) || { els: {} };
  board = { id, els: data.els || {} }; hist.reset(board.els); mids.clear(); sways.clear(); kanban = false; miniState = null;
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
      h('select', { id: 'frames', 'aria-label': 'Jump to frame', hidden: true, onchange: e => { const f = E(e.target.value); e.target.value = ''; if (f) { kanban = false; fit([f]); refresh(); } } }),
      menu('export', 'Export', [['png', 'PNG image'], ['svg', 'SVG vector']], exportAs),
      h('button', { id: 'tasks-toggle', onclick: () => { tasksOpen = !tasksOpen; edFor = null; renderTasks(); } }, 'Tasks'),
      h('button', { id: 'kanban-toggle', title: 'Show tasks as columns by status', onclick: () => { if (editing) endEdit(); kanban = !kanban; refresh(); } }, 'Kanban'),
      h('button', { title: 'Keyboard shortcuts (?)', onclick: toggleHelp }, 'Keys')),
    h('div', { class: 'work' },
      h('nav', { class: 'tools', 'aria-label': 'Tools' }, TOOLS.map(([t, label]) => h('button', { 'data-tool': t, title: label, 'aria-label': label, onclick: () => { tool = t; refresh(); } }, s('svg', { viewBox: '0 0 20 20' }, s('path', { d: ICON[t] }))))),
      h('div', { class: 'stage' }, h('div', { class: 'ctx', id: 'ctx', hidden: true }), h('div', { class: 'fly', id: 'fly', hidden: true }), h('div', { class: 'mini', id: 'mini', title: 'Click or drag to move around the board (M hides this)' }), h('div', { class: 'kan', id: 'kan', hidden: true }),
        h('textarea', { id: 'ed', 'aria-label': 'Edit text', onblur: endEdit, onkeydown: e => { e.stopPropagation(); if (e.key === 'Tab' && editing && E(editing).type === 'sticky') { e.preventDefault(); const id = editing; e.target.blur(); nextSticky(id); return; } const one = editing && ['card', 'frame', 'conn'].includes(E(editing).type); if (e.key === 'Escape' || (e.key === 'Enter' && (one || e.ctrlKey || e.metaKey))) { e.preventDefault(); e.target.blur(); } } })),
      h('aside', { class: 'tasks', id: 'tasks', 'aria-label': 'Tasks' }, h('div', { id: 'thead' }), h('div', { id: 'ted' }), h('div', { class: 'tlist', id: 'tlist' })))));
  cv = s('svg', { id: 'cv', role: 'application', 'aria-label': 'Board canvas' },
    s('defs', null,
      s('pattern', { id: 'dots', width: 24, height: 24, patternUnits: 'userSpaceOnUse' }, s('circle', { cx: 1, cy: 1, r: 1, style: 'fill:var(--dot)' })),
      s('filter', { id: 'sh', x: '-10%', y: '-10%', width: '120%', height: '130%' }, s('feDropShadow', { dx: 0, dy: 2, stdDeviation: 3, 'flood-color': '#0a1428', 'flood-opacity': 0.16 }))),
    s('rect', { width: '100%', height: '100%', fill: 'url(#dots)' }));
  vp = s('g'); ov = s('g'); cv.append(vp, ov); $('.stage').prepend(cv);
  mini = s('svg', { width: 180, height: 120, 'aria-hidden': 'true' }); $('#mini').append(mini);
  mini.addEventListener('pointerdown', ev => { miniDrag = true; mini.setPointerCapture(ev.pointerId); miniGo(ev); });
  mini.addEventListener('pointermove', ev => { if (miniDrag) miniGo(ev); });
  const miniEnd = () => { miniDrag = false; draw(); }; mini.addEventListener('pointerup', miniEnd); mini.addEventListener('pointercancel', miniEnd);
  cv.addEventListener('contextmenu', openMenu);
  cv.addEventListener('pointerdown', onDown); cv.addEventListener('mousedown', ev => ev.preventDefault()); cv.addEventListener('pointermove', onMove); cv.addEventListener('pointerup', onUp); cv.addEventListener('pointercancel', onUp);
  cv.addEventListener('wheel', ev => { ev.preventDefault(); const p = pt(ev); if (ev.ctrlKey || ev.metaKey) zoomAt(Math.exp(-ev.deltaY * 0.01), p.sx, p.sy); else { cam.x -= ev.deltaX; cam.y -= ev.deltaY; draw(); placeEditor(); } }, { passive: false });
  fit(); refresh();
}
function renderCtx() {
  const el = $('#ctx'); if (!el) return; const list = selEls();
  if (!list.length || editing) { el.hidden = true; return; } el.hidden = false;
  const free = list.filter(e => !e.locked), of = types => free.filter(e => types.includes(e.type));
  const same = (els, key) => els.length && els.every(e => e[key] === els[0][key]) ? els[0][key] ?? '' : '';
  const menu = (id, label, opts, fn) => h('select', { id, 'aria-label': label, onchange: e => { const v = e.target.value; if (v) fn(v); } }, h('option', { value: '' }, label), opts.map(o => h('option', { value: o[0] }, o[1])));
  // A picker that shows the current value; choosing its first entry goes back to the default.
  const pick = (id, label, opts, cur, fn) => h('select', { id, 'aria-label': label, title: label, value: String(cur), onchange: e => fn(e.target.value) }, h('option', { value: '' }, label), opts.map(o => h('option', { value: String(o[0]) }, o[1])));
  const setAll = (els, key, val) => { els.forEach(e => { if (val === '' || val == null || val === false) delete e[key]; else e[key] = val; fitText(e); }); commit(); };
  const swatch = (c, fn) => h('button', { class: 'sw', style: 'background:' + c, title: 'Color ' + c, 'aria-label': 'Color ' + c, onclick: fn });
  const fillable = of(['sticky', 'rect', 'ellipse', 'diamond']), vivid = of(['sticker', 'tape']), conns = of(['conn']), tapes = of(['tape']), texty = free.filter(e => TEXTY.includes(e.type));
  el.replaceChildren(...[
    fillable.length ? FILLS.map(c => swatch(c, () => setAll(fillable, 'fill', c))) : [],
    !fillable.length && (vivid.length || conns.length) ? VIVID.map(c => swatch(c, () => { vivid.forEach(e => { e.fill = c; }); conns.forEach(e => { e.stroke = c; }); commit(); })) : [],
    conns.length ? pick('conn-style', 'Line style', [['straight', 'Straight'], ['curve', 'Curved'], ['elbow', 'Right angle'], ['cable', 'Cable']], same(conns, 'style') || 'straight', v => { connStyle = v || 'straight'; setAll(conns, 'style', connStyle === 'straight' ? '' : connStyle); }) : null,
    tapes.length ? pick('tape-pattern', 'Pattern', Object.entries(TAPES), same(tapes, 'pattern') || 'stripes', v => setAll(tapes, 'pattern', v)) : null,
    texty.length ? [
      pick('font', 'Font', Object.entries(FONTS).map(([k, v]) => [k, v.label]), same(texty, 'font'), v => setAll(texty, 'font', v)),
      pick('weight', 'Weight', WEIGHTS, same(texty, 'weight'), v => setAll(texty, 'weight', v ? Number(v) : '')),
      pick('size', 'Size', SIZES.map(n => [n, n + ' px']), same(texty, 'size'), v => setAll(texty, 'size', v ? Number(v) : '')),
      h('button', { class: same(texty, 'italic') === true ? 'fav-on' : '', title: 'Italic', style: 'font-style:italic', onclick: () => setAll(texty, 'italic', !texty.every(e => e.italic)) }, 'Italic')] : [],
    list.length > 1 ? menu('align', 'Align', [['l', 'Left edges'], ['c', 'Centers'], ['r', 'Right edges'], ['t', 'Top edges'], ['m', 'Middles'], ['b', 'Bottom edges'], ['dh', 'Space evenly across'], ['dv', 'Space evenly down']], align) : null,
    menu('arrange', 'Arrange', [['front', 'Bring to front'], ['back', 'Send to back'], ['group', 'Group'], ['ungroup', 'Ungroup'], ['lock', 'Lock'], ['unlock', 'Unlock']], arrange),
    h('button', { onclick: () => { copySel(); pasteEls(clip, 24); } }, 'Duplicate'),
    h('button', { class: 'danger', onclick: removeSel }, 'Delete')].flat().filter(Boolean));
  placeCtx();
}
function renderFly() {
  const el = $('#fly'); if (!el) return; el.hidden = tool !== 'stamp'; if (el.hidden) return;
  const pv = (e, vb) => s('svg', { viewBox: vb, 'aria-hidden': 'true' }, renderEl({ id: 'pv-' + (e.shape || e.pattern), z: 0, x: 0, y: 0, ...e }, rctx(true)));
  const btn = (on, label, fn, kid) => h('button', { class: on ? 'on' : '', title: label, 'aria-label': label, onclick: () => { fn(); renderFly(); } }, kid);
  el.replaceChildren(
    h('div', { class: 'fly-h' }, 'Stickers'),
    h('div', { class: 'fly-g' }, Object.entries(STICKERS).map(([k, v]) => btn(stamp.type === 'sticker' && stamp.shape === k, v.label, () => { stamp = { ...stamp, type: 'sticker', shape: k }; }, pv({ type: 'sticker', shape: k, fill: stamp.fill, w: 100, h: 100 }, '-10 -10 120 120')))),
    h('div', { class: 'fly-h' }, 'Washi tape'),
    h('div', { class: 'fly-t' }, Object.entries(TAPES).map(([k, v]) => btn(stamp.type === 'tape' && stamp.pattern === k, v + ' tape', () => { stamp = { ...stamp, type: 'tape', pattern: k }; }, pv({ type: 'tape', pattern: k, fill: stamp.fill, w: 120, h: 26 }, '-4 -4 128 34')))),
    h('div', { class: 'fly-h' }, 'Color'),
    h('div', { class: 'fly-c' }, VIVID.map(c => h('button', { class: 'sw' + (stamp.fill === c ? ' on' : ''), style: 'background:' + c, title: 'Color ' + c, 'aria-label': 'Color ' + c, onclick: () => { stamp = { ...stamp, fill: c }; renderFly(); } }))),
    h('p', { class: 'fly-n' }, 'Click the board to place it, or drag to set the size. Press Esc when done.'));
}
function calendarEl(cards) {
  const byDay = {}; for (const c of cards) if (c.due) (byDay[c.due] ||= []).push(c);
  const pre = monthPrefix(cal.year, cal.month), name = new Date(cal.year, cal.month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const go = by => () => { cal = shiftMonth(cal.year, cal.month, by); calDay = ''; renderTasks(); };
  const undated = cards.filter(c => !c.due).length;
  return h('div', { class: 'cal' },
    h('div', { class: 'cal-h' }, h('button', { 'aria-label': 'Previous month', onclick: go(-1) }, '‹'), h('strong', null, name), h('button', { 'aria-label': 'Next month', onclick: go(1) }, '›')),
    h('div', { class: 'cal-g' }, ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => h('span', { class: 'cal-w' }, d)),
      monthGrid(cal.year, cal.month).flat().map(day => {
        const due = byDay[day] || [];
        return h('button', { class: 'cal-d' + (day.startsWith(pre) ? '' : ' out') + (day === today() ? ' now' : '') + (day === calDay ? ' on' : ''), 'aria-label': `${day}, ${due.length} tasks due`, onclick: () => { calDay = calDay === day ? '' : day; renderTasks(); } },
          String(Number(day.slice(8))), h('span', { class: 'cal-m' }, due.slice(0, 4).map(c => h('b', { style: 'background:' + STATUS[c.status][1] }))));
      })),
    undated ? h('p', { class: 'note' }, `${undated} ${undated === 1 ? 'task has' : 'tasks have'} no due date.`) : null);
}
function renderTasks() {
  const el = $('#tasks'); if (!el) return; el.hidden = !tasksOpen; if (!tasksOpen) return;
  const cards = all().filter(e => e.type === 'card').sort((a, b) => (a.due || '9') < (b.due || '9') ? -1 : 1), cur = selEls().length === 1 && selEls()[0].type === 'card' ? selEls()[0] : null;
  const n = k => cards.filter(c => k === 'all' || c.status === k).length;
  $('#thead').replaceChildren(h('h2', null, 'Tasks'),
    h('div', { class: 'tabs' }, [['list', 'List'], ['cal', 'Calendar']].map(([k, label]) => h('button', { class: taskView === k ? 'on' : '', onclick: () => { taskView = k; renderTasks(); } }, label))),
    taskView === 'cal' ? calendarEl(cards) : h('div', { class: 'chips' }, [['all', 'All'], ...Object.entries(STATUS).map(([k, v]) => [k, v[0], v[1]])].map(([k, label, col]) =>
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
  const show = taskView === 'cal' ? cards.filter(c => calDay ? c.due === calDay : (c.due || '').startsWith(monthPrefix(cal.year, cal.month))) : cards.filter(c => taskFilter === 'all' || c.status === taskFilter);
  const none = taskView === 'cal' ? (calDay ? 'Nothing is due on this day.' : 'Nothing is due this month.') : cards.length ? 'No tasks with this status.' : 'No tasks yet. Press C and click the board to add a task card.';
  $('#tlist').replaceChildren(...(show.length ? show.map(c => {
    const late = c.due && c.due < today() && c.status !== 'done';
    return h('button', { class: 'trow' + (cur === c ? ' on' : ''), onclick: () => { sel = new Set([c.id]); centerOn(c); refresh(); } },
      h('i', { style: 'background:' + STATUS[c.status][1] }), h('div', null, h('strong', null, c.text), h('small', { class: late ? 'late' : '' }, STATUS[c.status][0] + (c.due ? (late ? ' · overdue ' : ' · due ') + c.due : ''))));
  }) : [h('p', { class: 'note' }, none)]));
}

function renderFrames() {
  const el = $('#frames'); if (!el) return; const fs = all().filter(e => e.type === 'frame').sort((a, b) => a.y - b.y || a.x - b.x);
  el.hidden = !fs.length; el.replaceChildren(h('option', { value: '' }, 'Frames'), ...fs.map(f => h('option', { value: f.id }, f.text || 'Frame')));
}
function renderKanban() {
  const el = $('#kan'), btn = $('#kanban-toggle'); if (!el) return; el.hidden = !kanban; btn.classList.toggle('fav-on', kanban); if (!kanban) return;
  const groups = groupTasks(all());
  el.replaceChildren(...Object.entries(STATUS).map(([k, [label, col]]) => h('section', { class: 'kcol', 'aria-label': label,
    ondragover: e => { e.preventDefault(); e.currentTarget.classList.add('over'); }, ondragleave: e => e.currentTarget.classList.remove('over'),
    ondrop: e => { e.preventDefault(); e.currentTarget.classList.remove('over'); const c = E(e.dataTransfer.getData('text/plain')); if (c && c.type === 'card' && c.status !== k) { c.status = k; edFor = null; commit(); } } },
    h('header', null, h('b', { style: 'background:' + col }), label, h('span', null, String(groups[k].length))),
    h('div', { class: 'klist' }, groups[k].map(c => {
      const late = c.due && c.due < today() && c.status !== 'done';
      return h('article', { class: 'kcard' + (sel.has(c.id) ? ' on' : ''), draggable: 'true', tabindex: '0', style: 'border-left-color:' + col,
        ondragstart: e => e.dataTransfer.setData('text/plain', c.id), onclick: () => { sel = new Set([c.id]); tasksOpen = true; refresh(); },
        onkeydown: e => { if (e.key === 'Enter') { sel = new Set([c.id]); tasksOpen = true; refresh(); } },
        ondblclick: () => { kanban = false; sel = new Set([c.id]); centerOn(c); refresh(); } },
        h('strong', null, c.text), c.due ? h('small', { class: late ? 'late' : '' }, (late ? 'Overdue ' : 'Due ') + c.due) : null, c.notes ? h('p', null, c.notes) : null);
    })),
    h('button', { class: 'kadd', onclick: () => addTask(k) }, 'Add task'))));
}
function closeMenu() { const m = $('#menu'); if (m) m.remove(); }
function openMenu(ev) {
  ev.preventDefault(); if (editing) endEdit(); closeMenu();
  const p = pt(ev), id = idAt(ev.target);
  if (id && !sel.has(id)) { sel = new Set(group(id)); refresh(); } else if (!id && sel.size) { sel.clear(); refresh(); }
  const list = selEls(), item = (label, fn, cls) => h('button', { class: cls, role: 'menuitem', onclick: () => { closeMenu(); fn(); } }, label);
  const items = id ? [
    list.length === 1 && TEXTY.includes(list[0].type) ? item('Edit text', () => startEdit(list[0].id)) : null,
    item('Duplicate', () => { copySel(); pasteEls(clip, 24); }), item('Copy', copySel), h('hr'),
    item('Bring to front', () => arrange('front')), item('Send to back', () => arrange('back')),
    list.length > 1 ? item('Group', () => arrange('group')) : null, list.some(e => e.g) ? item('Ungroup', () => arrange('ungroup')) : null,
    list.every(e => e.locked) ? item('Unlock', () => arrange('unlock')) : item('Lock', () => arrange('lock')), h('hr'),
    item('Delete', removeSel, 'danger')]
    : [clip.length ? item('Paste here', () => pasteAt(p)) : null,
      item('Add sticky note', () => makeBox('sticky', p.x, p.y, 0, 0)), item('Add task card', () => makeBox('card', p.x, p.y, 0, 0)), item('Add text', () => makeBox('text', p.x, p.y, 0, 0)), h('hr'),
      item('Select all', () => { sel = new Set(Object.keys(board.els)); refresh(); }), item('Fit everything', () => fit())];
  const m = h('div', { class: 'menu', id: 'menu', role: 'menu' }, items.filter(Boolean)), r = cv.getBoundingClientRect(); $('.stage').append(m);
  m.style.left = Math.max(4, Math.min(p.sx, r.width - m.offsetWidth - 6)) + 'px'; m.style.top = Math.max(4, Math.min(p.sy, r.height - m.offsetHeight - 6)) + 'px';
}
const KEYS = [
  ['Tools', [['V', 'Select'], ['S', 'Sticky note'], ['T', 'Text'], ['R / O / D', 'Rectangle, ellipse, diamond'], ['C', 'Task card'], ['F', 'Frame'], ['L', 'Connector'], ['P', 'Draw'], ['K', 'Stickers and tape']]],
  ['Editing', [['Double-click', 'Edit text, or add a note on empty space'], ['Enter', 'Edit the selected piece'], ['Tab', 'Next sticky note beside this one'], ['Ctrl+D', 'Duplicate'], ['Alt+drag', 'Drag a copy'], ['Ctrl+C / Ctrl+V', 'Copy and paste'], ['Ctrl+Z / Ctrl+Shift+Z', 'Undo and redo'], ['Ctrl+G / Ctrl+Shift+G', 'Group and ungroup'], ['Ctrl+Shift+L', 'Lock or unlock'], ['[ and ]', 'Send to back, bring to front'], ['Delete', 'Delete the selection']]],
  ['Moving and sizing', [['Arrow keys', 'Nudge by 1 (Shift for 10)'], ['Shift while dragging', 'Keep to a straight line'], ['Shift while drawing', 'Keep it square'], ['Ctrl while dragging', 'Turn off snapping'], ['Shift while rotating', 'Turn in 15 degree steps']]],
  ['View', [['Space+drag', 'Pan'], ['Ctrl+scroll', 'Zoom'], ['+ and -', 'Zoom in and out'], ['Shift+1', 'Fit everything'], ['M', 'Show or hide the minimap'], ['Right-click', 'Open the menu'], ['?', 'Show this list'], ['Esc', 'Deselect or close']]]];
function toggleHelp() {
  const open = $('#help'); if (open) { open.remove(); return; }
  document.body.append(h('div', { class: 'help', id: 'help', onclick: e => { if (e.target.id === 'help') e.target.remove(); } },
    h('div', { class: 'help-b', role: 'dialog', 'aria-label': 'Keyboard shortcuts' },
      h('div', { class: 'help-t' }, h('h2', null, 'Keyboard shortcuts'), h('button', { onclick: toggleHelp }, 'Close')),
      h('div', { class: 'help-g' }, KEYS.map(([title, rows]) => h('section', null, h('h3', null, title), rows.map(([key, what]) => h('div', { class: 'help-r' }, h('kbd', null, key), h('span', null, what)))))),
      h('p', { class: 'note' }, 'On a Mac, use Cmd in place of Ctrl.'))));
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
  const svg = s('svg', { viewBox: `${x} ${y} ${w} ${ht}`, width: w, height: ht }, s('rect', { x, y, width: w, height: ht, fill: '#ffffff' }), order.map(e => renderEl(e, rctx(true))));
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
window.addEventListener('pointerdown', ev => { if (!(ev.target.closest && ev.target.closest('#menu'))) closeMenu(); }, true);
window.addEventListener('keyup', ev => { if (ev.key === ' ') { spaceDown = false; if (cv) cv.classList.remove('pan'); } });
window.addEventListener('pagehide', () => { if (board) saveNow(); });
(async () => {
  await Store.init();
  let idx = await Store.get('index');
  if (!idx && Store.mode === 'cloud' && Store.local('index')) { idx = Store.local('index'); for (const b of idx.boards) { const d = Store.local('b_' + b.id); if (d) Store.put('b_' + b.id, d); } Store.put('index', idx); }
  if (!idx) { idx = seed(); Store.put('index', idx); }
  index = idx; renderHome();
})();
