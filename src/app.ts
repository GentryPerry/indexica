// @ts-nocheck
// UI layer, ported as-is from the single-file prototype. It is not type-checked yet:
// it will be split into typed modules when the canvas renderer is rebuilt.
import { $, h, s, uid, clone, today, toast } from './dom';
import { STATUS, FILLS, VIVID, FONTS, WEIGHTS, SIZES, TEXT_COLORS, TEXTY, BOXY } from './types';
import { fitText } from './geometry';
import { connGeom, nearSide, pickTarget, sidePoint, sideDir, OPPOSITE, SIDES } from './connectors';
import { kick, step, still, atRest } from './cable';
import { renderEl } from './render';
import { STICKERS, TAPES } from './stickers';
import { monthGrid, shiftMonth, monthPrefix } from './calendar';
import { miniFit, miniToWorld, union } from './layout';
import { outlineRows, TYPE_NAMES, LIVE_NAMES } from './outline';
import { migrateBoard, clonePages, nextPageName, TEMPLATES } from './templates';
import { groupTasks } from './tasks';
import { TABLE_KINDS, cellLook, emptyCells, normCells, cellAt, cellBox, stepCell, insertRow, insertCol, removeRow, removeCol, rowsOf, colsOf, colFractions, resizeCols, sharesWithCol, sharesWithoutCol } from './table';
import { buildPdf } from './pdf';
import * as G from './geometry';
import { Store } from './store';
import { History } from './history';
import { snapMove, snapPoint } from './snap';
import * as L from './library';
import { paintFill, outlineFor, inkOn, SURFACE, adjust } from './palette';
import { trayIcon } from './tray';
import * as SL from './slides';
import * as DK from './deck';
import * as RT from './richtext';
import * as RE from './richedit';
import * as PIC from './picture';
import * as V from './vector';
import * as B from './boolean';
import { BRUSHES, PROFILES, brushOutline, outlineD, profileOutline, shaped, eraseStroke, touches } from './brush';
import * as PT from './paint';
import * as PO from './pathops';
import * as PG from './presetgeom';
import * as CH from './chart';
import * as LOD from './lod';
import { writePptx } from './pptx-write';
import { readPptx } from './pptx-read';
import * as X from './exact';
import * as LB from './livebool';
import * as VE from './vecerase';

function statParts() {
  if (Store.err) return ['err', Store.err];
  if (Store.busy) return ['warn', 'Saving'];
  return Store.mode === 'cloud' ? ['', Store.where === 'site' ? 'Saved to your account' : 'Saved to your Claude account'] : ['warn', 'Saved in this browser only'];
}
function stat() { const el = $('#stat'); if (!el) return; const [c, t] = statParts(); el.replaceChildren(h('span', { class: 'dot ' + c }), t); }
Store.onChange = stat;

/* ---------- Workspace index ---------- */
let index = { projects: [], boards: [] };
let home = { filter: 'all', q: '', rename: null };
const saveIndex = () => Store.put('index', index);
const meta = id => index.boards.find(b => b.id === id);

function seed() {
  const p = { id: uid('p'), name: 'JAM build' };
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
  return Object.values(els).filter(e => e.type !== 'conn' && e.type !== 'pen' && e.type !== 'text').sort((a, b) => (a.type === 'frame') === (b.type === 'frame') ? a.z - b.z : a.type === 'frame' ? -1 : 1).slice(0, 80)
    .map(e => [Math.round(e.x), Math.round(e.y), Math.round(e.w), Math.round(e.h), e.type === 'frame' ? '' : e.type === 'card' ? STATUS[e.status][1] : e.type === 'table' ? '#ffffff' : e.fill || '#ffffff', { card: 'c', sticky: 's', ellipse: 'e', diamond: 'd' }[e.type] || '']);
}
const themeNow = () => getComputedStyle(document.documentElement).getPropertyValue('color-scheme').trim() === 'dark' ? 'dark' : 'light';
/** A tabbed folder drawn in its project's color, with a sheet peeking out for each of its first boards. */
function folderArt(color, n) {
  const dark = themeNow() === 'dark', back = adjust(color, ([l, c, hh]) => [dark ? 0.5 : 0.72, c * 0.75, hh]), front = adjust(color, ([l, c, hh]) => [dark ? 0.36 : 0.9, c * (dark ? 0.45 : 0.3), hh]);
  return s('svg', { viewBox: '0 0 160 110', width: 150, height: 103, 'aria-hidden': 'true' },
    s('path', { d: 'M14 20a7 7 0 0 1 7-7h36l10 10h72a7 7 0 0 1 7 7v62a7 7 0 0 1-7 7H21a7 7 0 0 1-7-7z', fill: back }),
    [...Array(Math.min(3, n))].map((_, i) => s('rect', { x: 26 + i * 6, y: 28 - i * 5, width: 104 - i * 12, height: 50, rx: 4, style: 'fill:var(--frame);stroke:var(--line)', 'stroke-width': 1 })),
    s('path', { d: 'M14 46a7 7 0 0 1 7-7h118a7 7 0 0 1 7 7v46a7 7 0 0 1-7 7H21a7 7 0 0 1-7-7z', fill: front }));
}
function thumbSvg(t) {
  if (!t || !t.length) return s('svg', { viewBox: '0 0 10 10' });
  const x0 = Math.min(...t.map(r => r[0])), y0 = Math.min(...t.map(r => r[1]));
  const x1 = Math.max(...t.map(r => r[0] + r[2])), y1 = Math.max(...t.map(r => r[1] + r[3]));
  const pad = Math.max(x1 - x0, y1 - y0) * 0.08 + 10;
  const th = themeNow(), u = Math.max(x1 - x0, y1 - y0) / 160, bar = (x, y, w, fill) => s('rect', { x, y, width: w, height: 2.4 * u, rx: 1.2 * u, fill });
  // A miniature of the board: frames as soft panels, notes and shapes in their colors with a hint of text,
  // and task cards as white cards with a status chip.
  return s('svg', { viewBox: `${x0 - pad} ${y0 - pad} ${x1 - x0 + pad * 2} ${y1 - y0 + pad * 2}`, 'aria-hidden': 'true' },
    t.map(([x, y, w, ht, col, kind]) => {
      const r = Math.min(w, ht) * 0.08, ink = th === 'dark' ? 'rgba(255,255,255,.28)' : 'rgba(23,32,45,.2)';
      if (!col) return s('rect', { x, y, width: w, height: ht, rx: Math.min(w, ht) * 0.04, style: 'fill:var(--frame);stroke:var(--frame-line)', 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' });
      if (kind === 'c') return s('g', null, s('rect', { x, y, width: w, height: ht, rx: r, fill: SURFACE[th].card, stroke: SURFACE[th].cardLine, 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' }),
        bar(x + w * 0.08, y + ht * 0.2, w * 0.6, ink), s('rect', { x: x + w * 0.08, y: y + ht * 0.62, width: w * 0.26, height: ht * 0.2, rx: ht * 0.1, fill: col }));
      const fill = paintFill(col, th), shape = kind === 'e' ? s('ellipse', { cx: x + w / 2, cy: y + ht / 2, rx: w / 2, ry: ht / 2, fill })
        : kind === 'd' ? s('polygon', { points: `${x + w / 2},${y} ${x + w},${y + ht / 2} ${x + w / 2},${y + ht} ${x},${y + ht / 2}`, fill })
        : s('rect', { x, y, width: w, height: ht, rx: kind === 's' ? r * 0.4 : r, fill, stroke: col.toLowerCase() === '#ffffff' ? outlineFor(col, th) : 'none', 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' });
      return kind === 's' && w > 30 * u ? s('g', null, shape, bar(x + w * 0.1, y + ht * 0.16, w * 0.7, ink), bar(x + w * 0.1, y + ht * 0.16 + 5 * u, w * 0.5, ink)) : shape;
    }));
}

/* ---------- Theme ---------- */
// The viewer's choice is kept in this browser only. 'auto' follows the host page or the system setting.
const hostTheme = document.documentElement.getAttribute('data-theme');
const themePref = () => Store.local('theme') || 'auto';
function applyTheme(pref) {
  const r = document.documentElement;
  if (pref === 'auto') { if (hostTheme) r.setAttribute('data-theme', hostTheme); else r.removeAttribute('data-theme'); }
  else r.setAttribute('data-theme', pref);
}
function setTheme(pref) { Store.local('theme', pref === 'auto' ? null : pref); applyTheme(pref); if (board) refresh(); else renderHome(); }
const THEMES = [['light', 'Light'], ['dark', 'Dark'], ['auto', 'Auto']];

/* ---------- Shared chrome pieces ---------- */
const STAR = 'M10 2.5l2.3 4.8 5.2.7-3.8 3.6.9 5.2L10 14.3l-4.6 2.5.9-5.2L2.5 8l5.2-.7z';
const LOCK = 'M6.5 9V7a3.5 3.5 0 0 1 7 0v2M5 9h10v8H5z';
const MI = { open: 'M8 4h8v8M16 4L5 15', rename: 'M4 16l1-3.5 8.5-8.5 2.5 2.5L7.5 15z', dup: 'M7.5 7.5h8.5v8.5H7.5zM4.5 12.5V4.5h8', tpl: 'M4 4h12v12H4zM4 8.5h12M8.5 8.5V16', trash: 'M4.5 6h11M8 6V4.5h4V6M6 6l.8 10h6.4L14 6', restore: 'M4.5 10a5.5 5.5 0 1 0 1.8-4.1M4.5 4.5v3h3', out: 'M11 4.5H5v11h6M9 10h7M13.5 7.5L16 10l-2.5 2.5',
  image: 'M3.5 4.5h13v11h-13zM3.5 13l3.5-3.5 2.5 2.5 2-2 4 4', code: 'M7 6l-4 4 4 4M13 6l4 4-4 4', pdf: 'M5 3h6.5L15 6.5V17H5zM11.5 3v3.5H15', front: 'M10 16V7M6.5 10.5L10 7l3.5 3.5M5 4h10', back: 'M10 4v9M6.5 9.5L10 13l3.5-3.5M5 16h10', lock: 'M6.5 9V7a3.5 3.5 0 0 1 7 0v2M5 9h10v8H5z', copy: 'M7 7h9v9H7zM4 13V4h9', group: 'M3.5 3.5h5v5h-5zM11.5 11.5h5v5h-5zM8.5 6h3.5a2 2 0 0 1 2 2v3.5', grid: 'M4 4h5v5H4zM11 4h5v5h-5zM4 11h5v5H4zM11 11h5v5h-5z' };
const FOLDER = 'M2.75 6A1.5 1.5 0 0 1 4.25 4.5h3.3l1.6 1.75h6.6a1.5 1.5 0 0 1 1.5 1.5v6.75a1.5 1.5 0 0 1-1.5 1.5H4.25a1.5 1.5 0 0 1-1.5-1.5z';
const icon = (d, size = 14, extra = {}) => s('svg', { width: size, height: size, viewBox: '0 0 20 20', 'aria-hidden': 'true', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', ...extra }, s('path', { d }));
const logo = () => h('span', { class: 'logo', 'aria-hidden': 'true' }, s('svg', { width: 14, height: 14, viewBox: '0 0 14 14', fill: 'none', stroke: '#ffffff', 'stroke-width': 1.6, 'stroke-linecap': 'round' }, s('path', { d: 'M4 2v10M10 2v10M2 4h10M2 10h10' })));
const fmtDate = t => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

function closeMenu() { const m = $('#menu'); if (m) m.remove(); }
/**
 * A menu of [label, action, class, icon] items at a screen point. '-' draws a divider, { head } a small
 * group label; null items are skipped. An icon is a path drawn in a small tile before the label.
 */
function popupAt(x, y, items, alignRight = false) {
  closeMenu();
  const list = items.filter(Boolean).filter((it, i, a) => it !== '-' || (i > 0 && i < a.length - 1 && a[i - 1] !== '-'));
  const tiles = list.some(it => Array.isArray(it) && it[3]);
  const m = h('div', { class: 'menu' + (tiles ? ' tiles' : ''), id: 'menu', role: 'menu' }, list.map(it => it === '-' ? h('hr') : it.head ? h('div', { class: 'menu-h', role: 'presentation' }, it.head)
    : h('button', { class: it[2] || '', role: 'menuitem', onclick: () => { closeMenu(); it[1](); } }, tiles ? h('span', { class: 'mi', 'aria-hidden': 'true' }, it[3] ? icon(it[3], 14) : null) : null, h('span', { class: 'ml' }, it[0]))));
  document.body.append(m);
  const left = alignRight ? x - m.offsetWidth : x;
  m.style.left = Math.max(4, Math.min(left, innerWidth - m.offsetWidth - 6)) + 'px';
  m.style.top = Math.max(4, Math.min(y, innerHeight - m.offsetHeight - 6)) + 'px';
  const first = m.querySelector('button'); if (first) first.focus({ preventScroll: true });
}
function popup(anchor, items) { const r = anchor.getBoundingClientRect(); popupAt(r.right, r.bottom + 4, items, true); }
/** Arrow keys move through an open menu and Esc closes it. Returns true when the key was used. */
function menuKeys(ev) {
  const menu = $('#menu'); if (!menu) return false;
  const items = [...menu.querySelectorAll('button')], i = items.indexOf(document.activeElement);
  if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); items[(i + (ev.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus(); return true; }
  if (ev.key === 'Escape') { ev.preventDefault(); closeMenu(); return true; }
  if (ev.key === 'Tab') closeMenu();
  return false;
}

/* ---------- Home ---------- */
function renderHome() {
  board = null; closeMenu();
  const live = index.boards.filter(b => !b.trashed);
  const scope = L.scopeOf(index, home.filter);
  if (scope.kind === 'all') home.filter = 'all';
  const count = f => L.boardsIn(index, L.scopeOf(index, f), true).length;
  const go = f => { home.filter = f; home.rename = null; home.newFolder = false; renderHome(); };
  const lead = (f, sub, color) => sub ? icon(FOLDER, 14, { style: 'color:' + color }) : color ? h('span', { class: 'pdot', style: 'background:' + color }) : icon({ all: MI.grid, fav: STAR, trash: MI.trash }[f], 14);
  const nav = (f, label, sub, color) => h('button', { class: 'nav' + (sub ? ' sub' : '') + (home.filter === f ? ' on' : ''), 'aria-current': home.filter === f ? 'page' : null, onclick: () => go(f) },
    h('span', { class: 'nav-l' }, h('span', { class: 'nav-i' }, lead(f, sub, color)), h('span', { class: 'nav-t' }, label)), h('span', { class: 'num' }, String(count(f))));
  const proj = scope.kind === 'project' || scope.kind === 'folder' ? scope.project : null, folder = scope.kind === 'folder' ? scope.folder : null;
  const q = home.q.trim().toLowerCase();
  const sorter = { edited: (a, b) => b.updated - a.updated, created: (a, b) => b.created - a.created, name: (a, b) => a.name.localeCompare(b.name) }[home.sort || 'edited'];
  const list = L.boardsIn(index, scope, !!q).filter(b => !q || b.name.toLowerCase().includes(q)).sort(sorter);
  const folders = scope.kind === 'project' && !q ? (proj.folders || []) : [];
  const [sc, st] = statParts();
  const addProject = name => { const p = { id: uid('p'), name, folders: [] }; index.projects.push(p); home.filter = p.id; home.newProj = false; saveIndex(); renderHome(); };
  const addFolder = name => { const f = L.addFolder(index, proj.id, name, uid); home.newFolder = false; saveIndex(); if (f) go(L.folderKey(f.id)); };
  const nameInput = (obj, id, label) => h('input', { class: 'h-title', id, type: 'text', value: obj.name, 'aria-label': label, onkeydown: e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { e.target.value = obj.name; e.target.blur(); } }, onchange: e => { obj.name = e.target.value.trim() || obj.name; saveIndex(); renderHome(); } });
  const title = folder
    ? h('div', { class: 'h-path' }, h('button', { class: 'crumb', onclick: () => go(proj.id) }, proj.name), h('span', { class: 'crumb-sep', 'aria-hidden': 'true' }, '/'), nameInput(folder, 'folder-name', 'Folder name'))
    : proj ? nameInput(proj, 'proj-name', 'Project name')
    : h('h1', { class: 'h-title' }, home.filter === 'fav' ? 'Favorites' : home.filter === 'trash' ? 'Trash' : 'All boards');
  const folderTile = f => {
    const n = index.boards.filter(b => !b.trashed && b.projectId === proj.id && b.folderId === f.id).length;
    return h('div', { class: 'card fcard' },
      h('button', { class: 'thumb ftile', 'aria-label': 'Open folder ' + f.name, onclick: () => go(L.folderKey(f.id)) }, folderArt(L.projectColor(proj), n)),
      h('div', { class: 'c-row' }, h('div', { class: 'c-text' }, h('div', { class: 'c-name' }, f.name), h('div', { class: 'meta' }, n === 1 ? '1 board' : n + ' boards'))));
  };
  const newFolderTile = home.newFolder ? h('div', { class: 'card fcard' },
    h('div', { class: 'thumb ftile' }, folderArt(L.projectColor(proj), 0)),
    h('input', { type: 'text', id: 'new-folder', class: 'inp', placeholder: 'Folder name', 'aria-label': 'New folder name',
      onkeydown: e => { if (e.key === 'Enter' && e.target.value.trim()) addFolder(e.target.value.trim()); else if (e.key === 'Escape') { home.newFolder = false; renderHome(); } },
      onblur: e => { if (home.newFolder && e.target.value.trim()) addFolder(e.target.value.trim()); else if (home.newFolder) { home.newFolder = false; renderHome(); } } })) : null;
  const nb = list.length, nf = folders.length;
  const subline = [nf ? (nf === 1 ? '1 folder' : nf + ' folders') : '', nb === 1 ? '1 board' : nb + ' boards'].filter(Boolean).join(' · ') + (q ? ' matching "' + home.q.trim() + '"' : '');
  const deleteProject = () => { L.removeProject(index, proj.id); home.filter = 'all'; saveIndex(); renderHome(); toast('Project deleted. Its boards are in All boards.'); };
  const deleteFolder = () => { L.removeFolder(index, folder.id); home.filter = proj.id; saveIndex(); renderHome(); toast(`Folder deleted. Its boards are in ${proj.name}.`); };
  $('#app').replaceChildren(h('div', { class: 'home' },
    h('nav', { class: 'lib', 'aria-label': 'Library' },
      h('div', { class: 'brand' }, logo(), h('span', { class: 'word' }, 'JAM')),
      h('input', { type: 'search', id: 'board-search', class: 'search', placeholder: 'Search boards', 'aria-label': 'Search boards', value: home.q, oninput: e => { home.q = e.target.value; renderHome(); const i = $('#board-search'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }),
      nav('all', 'All boards'), nav('fav', 'Favorites'), nav('trash', 'Trash'),
      h('div', { class: 'lib-h' }, 'Projects', h('button', { class: 'icon-btn sm', title: 'New project', 'aria-label': 'New project', onclick: () => { home.newProj = true; renderHome(); $('#new-project').focus(); } }, icon('M10 4v12M4 10h12', 12))),
      home.newProj ? h('input', { type: 'text', id: 'new-project', class: 'inp', placeholder: 'Project name', 'aria-label': 'New project name',
        onkeydown: e => { if (e.key === 'Enter' && e.target.value.trim()) addProject(e.target.value.trim()); else if (e.key === 'Escape') { home.newProj = false; renderHome(); } },
        onblur: e => { if (!e.target.value.trim() && home.newProj) { home.newProj = false; renderHome(); } } }) : null,
      index.projects.map(p => [nav(p.id, p.name, false, L.projectColor(p)), (p.folders || []).map(f => nav(L.folderKey(f.id), f.name, true, L.projectColor(p)))]).flat(2),
      !index.projects.length && !home.newProj ? h('p', { class: 'lib-empty' }, 'No projects yet.') : null,
      h('div', { class: 'grow' }),
      h('div', { class: 'seg theme', role: 'group', 'aria-label': 'Theme' }, THEMES.map(([k, label]) => h('button', { 'aria-pressed': String(themePref() === k), title: k === 'auto' ? 'Match your system setting' : label + ' theme', onclick: () => setTheme(k) }, label))),
      h('div', { class: 'stat', id: 'stat' }, h('span', { class: 'dot ' + sc }), st)),
    h('main', { class: 'lib-main' },
      h('header', { class: 'lib-top' }, h('div', { class: 'h-block' }, title, h('div', { class: 'h-sub' }, subline)),
        folder ? h('button', { class: 'btn danger-t', onclick: deleteFolder }, 'Delete folder')
          : proj ? h('button', { class: 'btn danger-t', onclick: deleteProject }, 'Delete project') : null,
        scope.kind === 'project' ? h('button', { class: 'btn', onclick: () => { home.newFolder = true; renderHome(); $('#new-folder').focus(); } }, 'New folder') : null,
        home.filter !== 'trash' ? h('select', { class: 'sel ghost', id: 'sort', 'aria-label': 'Sort boards', value: home.sort || 'edited', onchange: e => { home.sort = e.target.value; renderHome(); } },
          h('option', { value: 'edited' }, 'Last edited'), h('option', { value: 'created' }, 'Date created'), h('option', { value: 'name' }, 'Name')) : null,
        home.filter !== 'trash' ? h('button', { class: 'btn primary', onclick: newBoard }, 'New board') : null),
      list.length || folders.length || newFolderTile ? h('div', { class: 'cards' }, folders.map(folderTile), newFolderTile, list.map(boardCard))
        : h('p', { class: 'empty' }, q ? 'No boards match that search.' : home.filter === 'trash' ? 'Trash is empty.' : folder ? 'No boards in this folder yet. Select New board, or move a board here from its menu.' : 'No boards here yet. Select New board to start one.'))));
}
function boardCard(b) {
  const where = L.pathOf(index, b);
  const name = home.rename === b.id
    ? h('input', { class: 'inp', type: 'text', id: 'rename-' + b.id, value: b.name, 'aria-label': 'Board name', onkeydown: e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { home.rename = null; renderHome(); } }, onblur: e => { if (home.rename !== b.id) return; b.name = e.target.value.trim() || b.name; home.rename = null; saveIndex(); renderHome(); } })
    : h('div', { class: 'c-name' }, b.name);
  const pc = index.projects.find(x => x.id === b.projectId);
  return h('div', { class: 'card' + (b.trashed ? ' gone' : '') },
    pc ? h('span', { class: 'ctab', 'aria-hidden': 'true', style: 'background:' + L.projectColor(pc) }) : null,
    h('button', { class: 'thumb', 'aria-label': b.trashed ? b.name + ', in Trash' : 'Open ' + b.name, disabled: b.trashed, onclick: () => openBoard(b.id) }, thumbSvg(b.thumb)),
    h('div', { class: 'c-row' },
      h('div', { class: 'c-text' }, name, h('div', { class: 'meta' }, (where || 'No project') + ' · Edited ' + fmtDate(b.updated))),
      b.trashed ? null : h('button', { class: 'icon-btn sm star' + (b.fav ? ' on' : ''), title: b.fav ? 'Remove from favorites' : 'Add to favorites', 'aria-label': b.fav ? 'Remove from favorites' : 'Add to favorites', 'aria-pressed': String(!!b.fav), onclick: () => { b.fav = !b.fav; saveIndex(); renderHome(); } }, icon(STAR, 14, b.fav ? { fill: 'currentColor' } : {})),
      h('button', { class: 'icon-btn sm more', title: 'More', 'aria-label': 'More actions for ' + b.name, 'aria-haspopup': 'menu', onclick: e => cardMenu(b, e.currentTarget) }, icon('M4.5 10h.01M10 10h.01M15.5 10h.01', 14, { 'stroke-width': 2.6 }))));
}
function cardMenu(b, anchor) {
  const done = fn => () => { fn(); saveIndex(); renderHome(); };
  const targets = L.moveTargets(index, b);
  popup(anchor, b.trashed ? [
    ['Restore', done(() => { b.trashed = false; }), '', MI.restore],
    ['Delete forever', done(() => { index.boards = index.boards.filter(x => x !== b); Store.del('b_' + b.id); (b.imgs || []).filter(i => !imgUsed(i)).forEach(i => Store.del('img_' + i)); }), 'danger', MI.trash]]
  : [['Open', () => openBoard(b.id), '', MI.open],
    ['Rename', () => { home.rename = b.id; renderHome(); const i = $('#rename-' + b.id); i.focus(); i.select(); }, '', MI.rename],
    ['Duplicate', () => dupBoard(b), '', MI.dup],
    ['Save as template', async () => { const d = await Store.get('b_' + b.id); saveTemplate(b.name, migrateBoard(d, uid).pages); }, '', MI.tpl], '-',
    targets.length ? { head: 'Move to' } : null,
    ...targets.map(x => [x.label, done(() => L.moveBoard(index, b, x.projectId, x.folderId)), '', FOLDER]),
    b.folderId && L.folderOf(index, b) ? ['Move out of folder', done(() => L.moveBoard(index, b, b.projectId)), '', MI.out] : null,
    b.projectId ? ['Remove from project', done(() => L.moveBoard(index, b, '')), '', MI.out] : null, '-',
    ['Move to Trash', done(() => { b.trashed = true; }), 'danger', MI.trash]]);
}
const imgsOf = pages => [...new Set(pages.flatMap(p => Object.values(p.els)).filter(e => e.type === 'image' && e.src).map(e => e.src))];
const imgUsed = i => index.boards.some(x => (x.imgs || []).includes(i)) || (index.templates || []).some(x => (x.imgs || []).includes(i));
function createBoard(name, pages) {
  const b = { id: uid('b'), name, ...L.homeOf(L.scopeOf(index, home.filter)), fav: false, trashed: false, created: Date.now(), updated: Date.now(), thumb: thumbOf(pages[0].els), imgs: imgsOf(pages) };
  index.boards.push(b); Store.put('b_' + b.id, { pages }); saveIndex(); openBoard(b.id);
}
function newBoard() { templatePicker(); }
function saveTemplate(name, pages) {
  const id = uid('t');
  Store.put('tpl_' + id, { pages });
  index.templates = [...(index.templates || []), { id, name, created: Date.now(), thumb: thumbOf(pages[0].els), imgs: imgsOf(pages) }];
  saveIndex(); toast(`Saved "${name}" as a template. Pick it under New board.`);
}
function templatePicker() {
  closeMenu(); const old = $('#tpl'); if (old) old.remove();
  const close = () => { const m = $('#tpl'); if (m) m.remove(); };
  const card = (name, blurb, thumb, pick, extra) => h('div', { class: 'card tcard' },
    h('button', { class: 'thumb', 'aria-label': 'Start from ' + name, onclick: () => { close(); pick(); } }, thumbSvg(thumb)),
    h('div', { class: 'c-row' }, h('div', { class: 'c-text' }, h('div', { class: 'c-name' }, name), h('div', { class: 'meta' }, blurb)), extra || null));
  const mine = index.templates || [];
  document.body.append(h('div', { class: 'help', id: 'tpl', onclick: e => { if (e.target.id === 'tpl') close(); } },
    h('div', { class: 'help-b tpl-b', role: 'dialog', 'aria-label': 'New board' },
      h('div', { class: 'help-t' }, h('h2', null, 'New board'), h('button', { class: 'btn', onclick: close }, 'Close')),
      h('h3', { class: 'tpl-h' }, 'Start from'),
      h('div', { class: 'tgrid' }, TEMPLATES.map(t => card(t.name, t.blurb, thumbOf(t.build(uid)), () => createBoard(t.key === 'blank' ? 'Untitled board' : t.name, [{ id: uid('pg'), name: 'Page 1', els: t.build(uid) }])))),
      h('h3', { class: 'tpl-h' }, 'Your templates'),
      mine.length ? h('div', { class: 'tgrid' }, mine.map(t => card(t.name, 'Saved ' + fmtDate(t.created), t.thumb,
        async () => { const d = await Store.get('tpl_' + t.id); if (!d) return toast('That template could not be loaded.'); createBoard(t.name, clonePages(migrateBoard(d, uid).pages, uid)); },
        h('button', { class: 'icon-btn sm', title: 'Delete template', 'aria-label': 'Delete template ' + t.name, onclick: () => {
          index.templates = mine.filter(x => x !== t); Store.del('tpl_' + t.id); (t.imgs || []).filter(i => !imgUsed(i)).forEach(i => Store.del('img_' + i)); saveIndex(); templatePicker(); } }, icon('M5 5l10 10M15 5L5 15', 12)))))
        : h('p', { class: 'hint' }, 'None yet. Open a board’s menu on the home screen, or the Export menu inside a board, and choose Save as template.'))));
  const first = $('#tpl .thumb'); if (first) first.focus();
}

async function dupBoard(b) {
  const data = await Store.get('b_' + b.id) || { els: {} };
  const n = Object.assign(clone(b), { id: uid('b'), name: b.name + ' copy', fav: false, created: Date.now(), updated: Date.now() });
  index.boards.push(n); Store.put('b_' + n.id, data); saveIndex(); renderHome();
}

/* ---------- Board state ---------- */
let board = null;
let hist = new History();
const hists = new Map();
let cam = { x: 0, y: 0, z: 1 }, tool = 'select', sel = new Set(), editing = null, clip = [];
let mode = null, spaceDown = false, lastDown = { t: 0, x: 0, y: 0 }, saveT = 0;
let rightTab = 'design', panelHold = false, fieldSync = [], outlineSig = '', outlineKey = '', taskFilter = 'all', edFor = null, taskView = 'list', calDay = '';
let cal = { year: new Date().getFullYear(), month: new Date().getMonth() };
let stamp = { type: 'sticker', shape: 'star', pattern: 'stripes', fill: VIVID[2] }, connStyle = 'straight', connColor = '';
let taskScope = 'page', penMode = 'pen', penColor = '', penWidth = 0, editCell = null;
const PEN_WIDTHS = { ...Object.fromEntries(Object.entries(BRUSHES).map(([k, v]) => [k, v.widths])), hl: [[12, 'Thin'], [18, 'Medium'], [28, 'Thick']] };
/** The width each drawing tool starts with. */
const PEN_DEFAULT = { pen: 2, brush: 10, pencil: 2.5, marker: 7, hl: 18 };
const penW = () => penWidth || (penMode === 'hl' ? 18 : (BRUSHES[penMode] || BRUSHES.pen).width);
/** Pen pressure when drawing with a stylus; nothing for a mouse or finger, so the brush simulates it. */
const pressure = ev => ev.pointerType === 'pen' && ev.pressure > 0 ? [Math.round(ev.pressure * 100) / 100] : [];
const HL_COLORS = ['#f5c518', '#7ee0a1', '#8fc7ff', '#ff9ec7', '#ffb27a'];
let kanban = false, miniOn = true, miniState = null, miniDrag = false, mini = null;
let cv, vp, ov, C = {};
const E = id => board.els[id];
// While a draw runs the set of pieces cannot change, so the piece list and drawing order are worked
// out once per draw (Object.values over a big board costs milliseconds each time).
let frameAll = null, frameSorted = null;
const all = () => frameAll ? frameAll.slice() : Object.values(board.els);
const sortedFresh = () => all().sort((a, b) => (a.type === 'frame') === (b.type === 'frame') ? a.z - b.z || (a.boolIn ? 1 : 0) - (b.boolIn ? 1 : 0) : a.type === 'frame' ? -1 : 1);
const sorted = () => frameSorted ? frameSorted.slice() : sortedFresh();
const topZ = () => all().reduce((m, e) => Math.max(m, e.z), 0);
const selEls = () => [...sel].map(E).filter(Boolean);
const group = id => { const e = E(id); return e && e.g ? all().filter(x => x.g === e.g).map(x => x.id) : [id]; };

/** Bumped on every committed edit and undo step, so views that only depend on content can skip camera moves. */
let editVer = 0;
function commit() { editVer++; if (hist.commit(board.els)) queueSave(); refresh(); }
/** Commits a change known to touch only these pieces, plus connectors on them and live booleans. */
function commitIds(ids) {
  const set = new Set(ids);
  for (const e of all()) if ((e.type === 'conn' && (set.has(e.a) || set.has(e.b))) || e.live || (e.boolIn && set.has(e.boolIn))) set.add(e.id);
  editVer++; if (hist.commit(board.els, set)) queueSave(); refresh();
}
function travel(dir) {
  const gone = hist.step(board.els, dir); if (!gone) return; editVer++;
  LB.trust(board.els, liveSeen);
  gone.forEach(id => sel.delete(id)); edFor = null; queueSave(); refresh();
}
function queueSave() { clearTimeout(saveT); saveT = setTimeout(saveNow, 600); }
function saveNow() {
  clearTimeout(saveT); if (!board) return;
  Store.put('b_' + board.id, { pages: board.pages });
  const m = meta(board.id); if (m) { m.updated = Date.now(); m.thumb = thumbOf(board.pages[0].els); m.imgs = imgsOf(board.pages); saveIndex(); }
}

/* ---------- Text and geometry helpers ---------- */
// Connector bounds need the routed line; during a draw they are worked out once per connector.
let frameBox = null;
/** A box sure to hold a piece, cheap for connectors (their ends plus room for curves and bends), for culling. */
function cullBox(e) {
  if (e.type !== 'conn') return e.rot ? G.bbox(e, E) : e;
  const [p, q] = ends(e), m = 160;
  return { x: Math.min(p.x, q.x) - m, y: Math.min(p.y, q.y) - m, w: Math.abs(p.x - q.x) + 2 * m, h: Math.abs(p.y - q.y) + 2 * m };
}
const ends = c => G.ends(c, E), bounds = list => G.bounds(list, E);
const bbox = e => { if (!frameBox || e.type !== 'conn') return G.bbox(e, E); let b = frameBox.get(e.id); if (!b) { b = G.bbox(e, E); frameBox.set(e.id, b); } return b; };

/* ---------- Rendering ---------- */
// Cables swing when their ends move. `mids` remembers where each cable was; `sways` holds the ones still moving.
const sways = new Map(), mids = new Map(); let swayRaf = 0, swayT = 0;
const calm = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
// Exports always use the light look, whatever the theme on screen.
const LIGHT = { theme: 'light', ink: '#17202d', muted: '#5d697c', line: '#5b6679', canvas: '#eef0f3', frame: '#ffffff', frameLine: '#dce1e8' };
/** The slide a piece sits on (its center inside the frame), if any. */
function slideAt(e, slides = all().filter(f => f.type === 'frame' && f.slide)) {
  const b = G.bbox(e, E), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  return slides.find(f => f.id !== e.id && cx >= f.x && cx <= f.x + f.w && cy >= f.y && cy <= f.y + f.h);
}
/** For text sitting on a frame with a background: that background as painted, so default text reads on it. */
function underFn(els, theme) {
  const frames = (board && els === board.els ? all() : Object.values(els || {})).filter(f => f.type === 'frame' && f.fill).sort((a, b) => a.w * a.h - b.w * b.h);
  if (!frames.length) return undefined;
  return e => { if (e.type !== 'text') return undefined; const cx = e.x + e.w / 2, cy = e.y + e.h / 2, f = frames.find(f => cx >= f.x && cx <= f.x + f.w && cy >= f.y && cy <= f.y + f.h); return f ? paintFill(f.fill, theme) : undefined; };
}
/** Display names for sticky authors, looked up once per id and redrawn when they arrive. */
const names = new Map();
function nameOf(id) {
  if (names.has(id)) return names.get(id);
  names.set(id, '');
  Store.names([id]).then(r => { if (r[id]) { names.set(id, r[id]); if (board) draw(); } });
  return '';
}
const footFn = f => DK.footerPieces(f, DK.themeById(f.theme), DK.footDate());
/** A page's chart colors: its deck theme's six accents. */
const accentsOf = els => { const t = DK.pageTheme(board && els === board.els ? all() : els).colors; return [t.accent1, t.accent2, t.accent3, t.accent4, t.accent5, t.accent6]; };
const rctx = (exp, els = board ? board.els : {}) => ({ exp, nameOf, foot: footFn, accents: () => accentsOf(els), zoom: exp ? 1 : cam.z, under: underFn(els, exp ? 'light' : C.theme), accent: exp ? '#2447d6' : C.accentFill, ...(exp ? LIGHT : { theme: C.theme, ink: C.ink, muted: C.muted, line: C.line, canvas: C.canvas, frame: C.frame, frameLine: C.frameLine }), hideId: exp ? null : editing, editCell: exp ? null : editCell, get: E, sway: exp ? undefined : id => sways.get(id), image: id => images.get(id) });
// Pictures are stored one per storage document and cached here by id as data URLs.
const images = new Map();
async function loadImages(els = all()) {
  const ids = [...new Set(els.filter(e => e.type === 'image' && e.src && !images.has(e.src)).map(e => e.src))], bid = board.id; if (!ids.length) return;
  await Promise.all(ids.map(async id => { const d = await Store.get('img_' + id); if (d && d.url) images.set(id, d.url); }));
  if (board && board.id === bid) draw();
}
function encodeImage(bmp, scale, alpha) {
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(bmp.width * scale)); c.height = Math.max(1, Math.round(bmp.height * scale));
  const x = c.getContext('2d');
  if (alpha) { x.drawImage(bmp, 0, 0, c.width, c.height); const u = c.toDataURL('image/webp', 0.85); if (u.startsWith('data:image/webp')) return u; }
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(bmp, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', 0.84);
}
/** The insert buttons in an empty content placeholder: a styled table filling it, or a picture. */
function phInsert(id, what) {
  const ph = E(id); if (!ph) return;
  if (what === 'picture') { imgSlot = id; const inp = $('#img-file'); if (inp) { inp.multiple = false; inp.addEventListener('cancel', () => { imgSlot = null; inp.multiple = true; }, { once: true }); inp.click(); } return; }
  if (what === 'chart') { makeChart(0, 0, 0, 0, false, ph); return; }
  const rows = 4, cols = 3, rowH = 52, t = { id: uid('e'), type: 'table', z: ph.z, x: ph.x, y: ph.y, w: ph.w, h: Math.min(ph.h, rows * rowH), cells: emptyCells(rows, cols), header: true, tstyle: 'medium2', band: true, size: 20 };
  DK.linkTheme(t, 'tacc', 'accent1', deckTheme());
  delete board.els[id]; board.els[t.id] = t; sel = new Set([t.id]); commit(); startEdit(t.id, [0, 0]);
}
/* Cropping a picture: the image stays put while the handles move the window and a drag slides the image under it. */
let cropId = null;
function startCrop(id) {
  const e = E(id); if (!e || e.type !== 'image' || e.locked) return;
  if (e.rot) return toast('Straighten the picture to crop it.');
  if (editing) endEdit(); cropId = id; sel = new Set([id]); refresh();
  toast('Drag the handles to crop, drag the picture to move it inside. Enter or Esc when done.');
}
function endCrop() { if (!cropId) return; cropId = null; commit(); refresh(); }
/** The faded rest of the image around a picture's crop window, and its outline. */
function cropMarks(e, k) {
  const f = PIC.fullRect(e), href = e.src && images.get(e.src), id = 'cropout-' + e.id;
  return s('g', { 'pointer-events': 'none' },
    s('clipPath', { id }, s('path', { d: `M${f.x} ${f.y}h${f.w}v${f.h}h${-f.w}zM${e.x} ${e.y}v${e.h}h${e.w}v${-e.h}z`, 'clip-rule': 'evenodd' })),
    href ? s('image', { x: f.x, y: f.y, width: f.w, height: f.h, href, preserveAspectRatio: 'none', opacity: 0.35, 'clip-path': `url(#${id})` }) : null,
    s('rect', { x: f.x, y: f.y, width: f.w, height: f.h, fill: 'none', stroke: C.accent, 'stroke-width': k, 'stroke-dasharray': `${4 * k} ${3 * k}` }));
}
/** True for a slide placeholder still showing its prompt. */
const emptyPh = e => !!e && e.type === 'text' && !!e.ph && !e.locked && (e.ph === 'picture' || !(e.text || '').trim());
/** A click on an empty placeholder starts typing in it, or picks a picture for a picture placeholder. */
let imgSlot = null;
function phClick(e) {
  if (e.ph !== 'picture') { startEdit(e.id); return; }
  imgSlot = e.id; const inp = $('#img-file'); if (!inp) return;
  inp.multiple = false; inp.addEventListener('cancel', () => { imgSlot = null; inp.multiple = true; }, { once: true }); inp.click();
}
async function addImage(file, at, slotId) {
  if (!board || !file || !file.type.startsWith('image/')) return;
  let bmp; try { bmp = await createImageBitmap(file); } catch (e) { return toast('That picture could not be read.'); }
  // Shrink until the picture fits in one storage document.
  let scale = Math.min(1, 1400 / Math.max(bmp.width, bmp.height)), url = '';
  for (let i = 0; i < 9; i++) { url = encodeImage(bmp, scale, file.type !== 'image/jpeg'); if (url.length < 220000) break; scale *= 0.8; }
  if (url.length >= 220000) return toast('That picture is too detailed to store. Try a smaller one.');
  const id = uid('i'); images.set(id, url); Store.put('img_' + id, { url });
  if (Store.mode !== 'cloud' && !Store.local('img_' + id)) toast('This browser is out of storage space, so this picture will not be kept after you close the page.');
  const w = Math.min(bmp.width, 420), ht = Math.round(w * bmp.height / bmp.width), r = cvBox();
  const c = at || { x: (r.width / 2 - cam.x) / cam.z, y: (r.height / 2 - cam.y) / cam.z };
  const e = { id: uid('e'), type: 'image', z: topZ() + 1, x: Math.round(c.x - w / 2), y: Math.round(c.y - ht / 2), w, h: ht, src: id };
  const slot = slotId && E(slotId);
  if (slot) {
    // A placeholder takes the picture filling its box, cropped to fit (double-click to adjust the crop), on the same layer.
    e.z = slot.z; PIC.fillBox(e, slot, bmp.width / bmp.height);
    delete board.els[slot.id];
  }
  board.els[e.id] = e; sel = new Set([e.id]); tool = 'select'; commit();
}
function onPaste(ev) {
  const tgt = ev.target; if (!board || kanban || (tgt && (['INPUT', 'TEXTAREA', 'SELECT'].includes(tgt.tagName) || tgt.isContentEditable))) return;
  const data = ev.clipboardData, file = data && [...data.files].find(f => f.type.startsWith('image/')), text = data ? data.getData('text/plain').trim() : '';
  const r = cvBox(), at = { x: (r.width / 2 - cam.x) / cam.z, y: (r.height / 2 - cam.y) / cam.z };
  if (file) addImage(file);
  else if (clip.length) { pasteEls(clip, 24); copySel(); }
  else if (text) { makeBox('sticky', at.x, at.y, 0, 0); $('#ed').value = text.slice(0, 2000); endEdit(); }
  else return;
  ev.preventDefault();
}

function trackCables() {
  const seen = new Set();
  for (const e of (cc && cc.ver === editVer ? cc.cables : all())) if (e.type === 'conn' && e.style === 'cable') {
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
/** What each live boolean result was last computed from (see livebool.ts). */
const liveSeen = new Map();
/** The selection as the panel and commands see it: the operands of a selected live result belong to it. */
const panelEls = () => selEls().filter(e => !(e.boolIn && sel.has(e.boolIn)));
/** A single selected live result. */
const liveOne = () => { const l = panelEls(); return l.length === 1 && l[0].live && !l[0].locked ? l[0] : null; };
/** Selecting a piece inside a live boolean: the piece, plus everything under it when it is a result itself. */
const withKids = id => { const e = E(id); return e && e.live ? [id, ...LB.descendantsOf(board.els, id).map(d => d.id)] : [id]; };
/** A lone selected operand under the pointer, which stays the target for dragging and double-clicks. */
function selectedOperandAt(p) {
  if (!sel.size) return null;
  const roots = panelEls(); if (roots.length !== 1 || !roots[0].boolIn || roots[0].locked) return null;
  return LB.contains(roots[0], p.x, p.y) ? roots[0] : null;
}
/**
 * What a draw needs from the board's content, kept until the next edit: the piece list, the drawing
 * order, and a grid index of where pieces are. Edits bump editVer; the piece count catches anything
 * added or removed before its commit. Pieces moving right now (the selection, what a drag carries,
 * connectors on them, live booleans) are drawn from their current place whatever the index says.
 */
let cc = null;
const STEADY = new Set(['drag', 'resize', 'rotate', 'grotate', 'gscale', 'pan', 'cpan', 'adjh', 'marquee', 'colsz', 'grad']);
function contentCache() {
  // Gestures that only move pieces cannot add or remove any, so the count check (itself a full scan) is skipped while they run.
  if (cc && cc.ver === editVer && cc.els === board.els && mode && STEADY.has(mode.k)) return cc;
  const n = Object.keys(board.els).length;
  if (cc && cc.ver === editVer && cc.els === board.els && cc.n === n) return cc;
  frameAll = null; frameSorted = null;
  const list = Object.values(board.els);
  frameAll = list;
  const order = sortedFresh(), idx = new LOD.GridIndex();
  frameBox = frameBox || new Map();
  for (const e of order) idx.add(e.id, cullBox(e));
  cc = { ver: editVer, els: board.els, n, list, order, idx, cables: list.filter(e => e.type === 'conn' && e.style === 'cable'), live: list.filter(e => e.live) };
  return cc;
}
/** Ids whose place may differ from the index right now. */
function movingIds() {
  const ids = new Set(sel);
  if (mode && mode.start) for (const e of mode.start) ids.add(e.id);
  if (mode && mode.e) ids.add(mode.e.id);
  if (editing) ids.add(editing);
  if (!ids.size && !cc.live.length) return ids;
  for (const e of cc.live) { ids.add(e.id); }
  for (const e of cc.order) if (e.type === 'conn' && (ids.has(e.a) || ids.has(e.b))) ids.add(e.id);
  return ids;
}
/** Pieces meeting a box, in drawing order, including anything moving. */
function piecesIn(box) {
  const c = contentCache(), hit = c.idx.query(box), moving = movingIds(), out = [];
  for (const e of c.order) if (hit.has(e.id) || moving.has(e.id)) out.push(e);
  for (const id of moving) { const e = E(id); if (e && !c.idx.box(id)) out.push(e); }
  return out;
}
function draw() {
  frameBox = new Map();
  const c = contentCache(); frameAll = c.list; frameSorted = c.order;
  try { drawFrame(); } finally { frameAll = frameSorted = frameBox = null; }
}
function drawFrame() {
  const cs = getComputedStyle(document.documentElement), v = n => cs.getPropertyValue(n).trim();
  C = { theme: v('color-scheme') === 'dark' ? 'dark' : 'light', ink: v('--ink'), muted: v('--muted'), line: v('--conn'), accent: v('--accent'), accentFill: v('--accent-fill'), canvas: v('--canvas'), frame: v('--frame'), frameLine: v('--frame-line'), dot: v('--dot') };
  trackCables();
  const t = `translate(${cam.x},${cam.y}) scale(${cam.z})`;
  vp.setAttribute('transform', t); ov.setAttribute('transform', t);
  // Far out, paper shadows and tiny text cost more to paint than they show: drop them below set zooms.
  vp.classList.toggle('far', cam.z < 0.35); vp.classList.toggle('very-far', cam.z < 0.16);
  dotGrid();
  LB.syncLive(board.els, liveSeen, cc.live);
  frameBox.clear();
  const changed = drawEls(rctx(false));
  drawOverlay();
  const zv = $('#zoomt'); if (zv) zv.textContent = Math.round(cam.z * 100) + '%';
  // The minimap's pieces follow edits and drags, not the camera.
  drawMini(changed && (miniVer !== editVer || !!mode)); miniVer = editVer;
}
/**
 * Drawing only what changed, on screen. Each piece's SVG is kept with a signature of everything it
 * is drawn from (its own data, plus what it depends on: a connector's ends, a mask, the frame under a
 * text, a loaded picture, an author name, and the zoom for frame labels). A piece whose signature is
 * unchanged reuses its node; pieces outside the view (with a margin) are left out. Returns whether
 * any piece was redrawn or the set changed, so the minimap can skip rebuilding.
 */
const drawn = new Map();
let drawnKey = '', drawnIds = '';
const geo = x => x ? [x.type, x.x, x.y, x.w, x.h, x.rot, x.paths, x.pts, x.shape, x.style] : null;
let lodCv = null, lodOn = false, lodIdx = null, lodOrder = [], farVer = -1;
const lodImgs = new Map();
/** A decoded picture for the far view (an Image made once per picture). */
function lodImage(src) {
  const href = images.get(src); if (!href) return undefined;
  let im = lodImgs.get(src);
  if (!im || im.src !== href) { im = new Image(); im.onload = () => { if (lodOn) draw(); }; im.src = href; lodImgs.set(src, im); }
  return im.complete && im.naturalWidth ? im : undefined;
}
/**
 * The far view: below LOD_ZOOM every piece is drawn simplified into one canvas, culled through a grid
 * index that also answers clicks. Returns true while it is on.
 */
let farCache = null, farTimer = 0;
function drawFar() {
  if (!lodCv) return false;
  const r = cvBox(), dpr = window.devicePixelRatio || 1, W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
  if (lodCv.width !== W || lodCv.height !== H) { lodCv.width = W; lodCv.height = H; farCache = null; }
  const g = lodCv.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H);
  lodOn = cam.z < LOD.LOD_ZOOM && !kanban;
  if (!lodOn) { lodIdx = null; farCache = null; return false; }
  const view = { x: -cam.x / cam.z, y: -cam.y / cam.z, w: r.width / cam.z, h: r.height / cam.z };
  // Camera moves reuse the last picture (with a margin around the view) until the pointer rests, then
  // the view is drawn afresh: panning and zooming cost a single image copy per frame.
  const key = [editVer, C.theme, editing, mode && mode.k !== 'pan' ? Math.random() : '', PG.presetsReady(), lodImgs.size].join('|'), fc = farCache;
  const ratio = fc ? cam.z / fc.z : 0;
  const inside = fc && view.x >= fc.wx && view.y >= fc.wy && view.x + view.w <= fc.wx + fc.ww && view.y + view.h <= fc.wy + fc.wh;
  if (!fc || fc.key !== key || fc.fresh === false && !inside || ratio < 0.5 || ratio > 2 || !inside) farRender(view, dpr, key);
  else { clearTimeout(farTimer); farTimer = setTimeout(() => { if (farCache) farCache.key = ''; drawSoon(); }, 140); }
  const c = farCache, k = dpr * cam.z;
  g.drawImage(c.cv, dpr * cam.x + c.wx * k, dpr * cam.y + c.wy * k, c.ww * k, c.wh * k);
  LOD.drawFrameNames(g, c.frames, cam, dpr, C.muted);
  return true;
}
/** Draws the far view into an offscreen picture covering the view plus a margin, and indexes the board. */
function farRender(view, dpr, key) {
  const m = 0.25, wx = view.x - view.w * m, wy = view.y - view.h * m, ww = view.w * (1 + 2 * m), wh = view.h * (1 + 2 * m), k = dpr * cam.z;
  const cvs = farCache && farCache.cv || document.createElement('canvas'), W = Math.ceil(ww * k), H = Math.ceil(wh * k);
  if (cvs.width !== W || cvs.height !== H) { cvs.width = W; cvs.height = H; }
  const g = cvs.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H);
  const list = piecesIn({ x: wx, y: wy, w: ww, h: wh }).filter(e => e.id !== editing);
  lodIdx = cc.idx; lodOrder = cc.order;
  g.setTransform(k, 0, 0, k, -wx * k, -wy * k);
  LOD.drawFar(g, list, { theme: C.theme, ink: C.ink, muted: C.muted, frame: C.frame, frameLine: C.frameLine, line: C.line, card: SURFACE[C.theme].card }, { get: E, bbox, image: lodImage }, 1 / cam.z);
  farCache = { cv: cvs, wx, wy, ww, wh, z: cam.z, key, frames: list.filter(e => e.type === 'frame') };
}
function drawEls(rc) {
  const key = [C.theme, C.ink, C.muted, C.line, C.accentFill, C.frame, editing, editCell && editCell.join(), PG.presetsReady()].join('|');
  if (key !== drawnKey) { drawn.clear(); drawnKey = key; }
  if (drawFar()) {
    // Far view: the SVG layer keeps only the piece being typed in.
    const keep = editing && E(editing) ? [renderEl(E(editing), rc)] : [];
    // Camera moves alone leave the minimap's pieces as they were; edits and drags still refresh them.
    const changed = drawnIds !== 'far' || farVer !== editVer || !!mode; farVer = editVer;
    vp.replaceChildren(...keep); drawnIds = 'far'; return changed;
  }
  const r = cvBox(), pad = 120 / cam.z;
  const view = { x: -cam.x / cam.z - pad, y: -cam.y / cam.z - pad, w: r.width / cam.z + 2 * pad, h: r.height / cam.z + 2 * pad };
  const nodes = [], ids = [];
  // In the dark theme, pieces on a slide still draw in the light look, so the slide shows its real
  // colors (slides always render light); frames keep their dark labels.
  const slides = C.theme === 'dark' ? all().filter(f => f.type === 'frame' && f.slide) : [];
  const rcL = slides.length ? { ...rc, ...LIGHT, under: underFn(board.els, 'light') } : rc;
  const onSlide = e => slides.length && e.type !== 'frame' && !!slideAt(e, slides);
  let changed = false;
  // Frame labels sit above their frames, so the query reaches a little higher.
  for (const e of piecesIn({ x: view.x, y: view.y - 48 / cam.z, w: view.w, h: view.h + 48 / cam.z })) {
    if (e.id !== editing && e.type !== 'conn') {
      const b = e.rot ? G.bbox(e, E) : e, top = e.type === 'frame' ? 48 / cam.z : 0;
      if (b.x > view.x + view.w || b.x + b.w < view.x || b.y > view.y + view.h || b.y + b.h < view.y - top) continue;
    }
    let dep = '';
    if (e.type === 'conn') dep = rc.sway && rc.sway(e.id) ? null : JSON.stringify([geo(E(e.a)), geo(E(e.b))]);
    else if (e.type === 'frame') dep = String(cam.z) + (e.foot && e.foot.date ? DK.footDate() : '');
    else if (e.type === 'chart') dep = accentsOf(board.els).join();
    else if (e.type === 'text' && rc.under) dep = rc.under(e) || '';
    if (dep !== null) {
      if (e.mask) dep += JSON.stringify(geo(E(e.mask)));
      if (e.src) dep += images.has(e.src) ? '+' : '-';
      if (e.author) dep += names.get(e.author) || '';
    }
    const light = onSlide(e), sig = dep === null ? null : JSON.stringify(e) + '#' + dep + (light ? 'L' : ''), hit = drawn.get(e.id);
    let node;
    if (sig && hit && hit.sig === sig) node = hit.node;
    else { node = renderEl(e, light ? rcL : rc); changed = true; if (sig) drawn.set(e.id, { sig, node }); else drawn.delete(e.id); }
    nodes.push(node); ids.push(e.id);
  }
  // Put the nodes in order, moving only the ones out of place.
  const kids = vp.childNodes;
  nodes.forEach((n, i) => { if (kids[i] !== n) vp.insertBefore(n, kids[i] || null); });
  while (kids.length > nodes.length) vp.lastChild.remove();
  for (const id of drawn.keys()) if (!board.els[id]) drawn.delete(id);
  const idKey = ids.join();
  if (idKey !== drawnIds) { drawnIds = idKey; changed = true; }
  return changed;
}
/**
 * The canvas dot grid. Two levels are drawn: the finer one fades out as you zoom out, and the next
 * level, four times wider, takes over, so the grid never turns into noise.
 */
function dotGrid() {
  if (!cv) return;
  let fine = 24; while (fine * cam.z < 10) fine *= 4;
  const f = fine * cam.z, c = f * 4, a = Math.max(0, Math.min(1, (f - 10) / 14)), rgb = hexRgb(C.dot);
  const dot = (alpha, r) => `radial-gradient(circle at 1px 1px, rgba(${rgb},${alpha}) ${r}px, rgba(${rgb},0) ${r + 0.6}px)`;
  const bg = lodCv || cv;
  bg.style.backgroundImage = `${dot(a, 0.8)}, ${dot(1, 0.9)}`;
  bg.style.backgroundSize = `${f}px ${f}px, ${c}px ${c}px`;
  bg.style.backgroundPosition = `${cam.x - 1}px ${cam.y - 1}px`;
}
const hexRgb = hex => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return '150,160,175'; const n = parseInt(m[1], 16); return `${n >> 16},${(n >> 8) & 255},${n & 255}`; };
function centerOn(e) { const r = cvBox(), b = bbox(e); cam.x = r.width / 2 - (b.x + b.w / 2) * cam.z; cam.y = r.height / 2 - (b.y + b.h / 2) * cam.z; }
let miniVer = -1, miniPieces = null, miniSig = '', miniDirty = true, miniAt = 0, miniBounds = null, miniBoundsVer = -1;
function drawMini(changed = true) {
  if (changed) miniDirty = true;
  const el = $('#mini'); if (!el || !mini) return; el.hidden = !miniOn || kanban; if (el.hidden) return;
  const r = cvBox(), view = { x: -cam.x / cam.z, y: -cam.y / cam.z, w: r.width / cam.z, h: r.height / cam.z };
  if (miniBoundsVer !== editVer || !miniBounds || (mode && performance.now() - miniAt > 200)) { miniBounds = { b: bounds(all()) }; miniBoundsVer = editVer; }
  const content = miniBounds.b;
  // While the map is being dragged the scale is frozen, so the board does not slide under the pointer.
  if (!miniDrag || !miniState) miniState = miniFit(content ? union(content, view) : view, 144, 96);
  const m = miniState, box = b => ({ x: b.x * m.k + m.ox, y: b.y * m.k + m.oy, width: Math.max(b.w * m.k, 1.5), height: Math.max(b.h * m.k, 1.5) });
  // The pieces layer is rebuilt only when the board or the map's scale changed; panning just moves the view box.
  const ms = [m.k, m.ox, m.oy, C.theme].join();
  // While dragging, the map's pieces catch up a few times a second rather than on every move.
  const due = !mode || performance.now() - miniAt > 200;
  if ((miniDirty && due) || !miniPieces || ms !== miniSig) {
    miniSig = ms; miniDirty = false; miniAt = performance.now();
    // The pieces are painted into one small bitmap: thousands of SVG rects here cost more than the board.
    const mc = document.createElement('canvas'); mc.width = 288; mc.height = 192;
    const g = mc.getContext('2d'); g.scale(2, 2);
    for (const e of sorted()) {
      if (e.type === 'conn' || e.type === 'pen' || e.boolIn) continue;
      const b = box(bbox(e));
      if (e.type === 'frame') { g.strokeStyle = C.frameLine; g.lineWidth = 0.75; g.strokeRect(b.x, b.y, b.width, b.height); continue; }
      g.globalAlpha = e.type === 'text' ? 0.5 : 1;
      g.fillStyle = e.type === 'card' ? STATUS[e.status][1] : e.type === 'table' ? C.frame : paintFill(e.fill, C.theme) || C.muted;
      g.fillRect(b.x, b.y, b.width, b.height);
    }
    miniPieces = s('image', { x: 0, y: 0, width: 144, height: 96, href: mc.toDataURL() });
  }
  mini.replaceChildren(miniPieces, s('rect', { ...box(view), rx: 2, fill: C.accent, 'fill-opacity': 0.1, stroke: C.accent, 'stroke-width': 1.5 }));
}
function miniGo(ev) {
  const r = mini.getBoundingClientRect(), w = miniToWorld(miniState, ev.clientX - r.left, ev.clientY - r.top), st = cvBox();
  cam.x = st.width / 2 - w.x * cam.z; cam.y = st.height / 2 - w.y * cam.z; draw(); placeEditor();
}
function rotateHandle(mx, top, col, k) {
  return [s('line', { x1: mx, y1: top, x2: mx, y2: top - 18 * k, stroke: col, 'stroke-width': k, 'pointer-events': 'none' }),
    s('circle', { 'data-h': 'rot', cx: mx, cy: top - 18 * k, r: 4.5 * k, fill: '#ffffff', stroke: col, 'stroke-width': 1.5 * k, style: 'cursor:grab' }, s('title', null, 'Rotate (hold Shift for 15 degree steps)'))];
}
const handleSq = (n, x, y, r, k, cur, title) => s('rect', { 'data-h': n, x: x - r, y: y - r, width: r * 2, height: r * 2, rx: 1.5 * k, fill: '#ffffff', stroke: C.accent, 'stroke-width': 1.25 * k, style: `cursor:${cur}-resize` }, title ? s('title', null, title) : null);
/** An invisible strip along one edge of a selection that resizes on that side. */
const edgeGrip = (n, x, y, w, ht, cur) => s('rect', { 'data-h': n, x, y, width: w, height: ht, fill: 'transparent', style: `cursor:${cur}-resize` });
/** The blue width-by-height badge under a selection. */
function sizeBadge(b, w, ht, k, below = false) {
  const label = `${Math.round(w)} × ${Math.round(ht)}`, tw = (G.measure(label, 11, 500) + 14) * k, y = b.y + b.h + (below ? 32 : 8) * k;
  return s('g', { 'pointer-events': 'none' },
    s('rect', { x: b.x + b.w / 2 - tw / 2, y, width: tw, height: 18 * k, rx: 5 * k, fill: C.accentFill }),
    s('text', { x: b.x + b.w / 2, y: y + 12.6 * k, 'font-size': 11 * k, 'font-weight': 500, 'font-family': 'Inter,system-ui,sans-serif', fill: '#ffffff', 'text-anchor': 'middle' }, label));
}
/**
 * Gradient handles, as in Figma: a selected vector with a gradient shows its line (or, for radial
 * ones, its center and edge) and the ends can be dragged on the canvas. The layer chosen in the panel
 * wins; otherwise the first gradient fill.
 */
function gradTarget(e) {
  const pick = (k, i) => { const list = k === 'fill' ? PT.fillLayers(e) : PT.strokeLayers(e).map(l => l.paint); return PT.isGrad(list[i]) ? { k, i, g: list[i] } : null; };
  if (paintSel && paintSel.id === e.id) { const t = pick(paintSel.k, paintSel.i); if (t) return t; }
  const fi = PT.fillLayers(e).findIndex(PT.isGrad);
  return fi >= 0 ? pick('fill', fi) : null;
}
function gradMarks(e, g, k) {
  const at = (fx, fy) => [e.x + fx * e.w, e.y + fy * e.h], geo = PT.gradientGeom(g), out = [];
  const dot = (n, x, y, title) => s('circle', { 'data-h': 'gr-' + n, cx: x, cy: y, r: 5 * k, fill: '#ffffff', stroke: C.accent, 'stroke-width': 1.5 * k, style: 'cursor:move' }, s('title', null, title));
  if ('cx' in geo) {
    const [cx, cy] = at(geo.cx, geo.cy), [ex, ey] = at(geo.cx + geo.r, geo.cy);
    out.push(s('line', { x1: cx, y1: cy, x2: ex, y2: ey, stroke: C.accent, 'stroke-width': 1.25 * k, 'pointer-events': 'none' }), dot('center', cx, cy, 'Drag to move the gradient center'), dot('edge', ex, ey, 'Drag to change the gradient size'));
  } else {
    const [x1, y1] = at(geo.x1, geo.y1), [x2, y2] = at(geo.x2, geo.y2);
    out.push(s('line', { x1, y1, x2, y2, stroke: C.accent, 'stroke-width': 1.25 * k, 'pointer-events': 'none' }), dot('from', x1, y1, 'Drag to move where the gradient starts'), dot('to', x2, y2, 'Drag to move where the gradient ends'));
  }
  return out;
}
/** A board point in a piece's own box, as fractions of its width and height (rotation undone). */
function boxFrac(e, p) {
  let x = p.x, y = p.y;
  if (e.rot) { const cx = e.x + e.w / 2, cy = e.y + e.h / 2, a = -e.rot * Math.PI / 180; x = cx + (p.x - cx) * Math.cos(a) - (p.y - cy) * Math.sin(a); y = cy + (p.x - cx) * Math.sin(a) + (p.y - cy) * Math.cos(a); }
  return [(x - e.x) / (e.w || 1), (y - e.y) / (e.h || 1)];
}
function drawOverlay(extra) {
  if (vedit && E(vedit.id)) { ov.replaceChildren(nodeMarks(E(vedit.id)), ...(extra ? [extra] : [])); return; }
  const k = 1 / cam.z, list = selEls(), out = [], solo = panelEls().length === 1 && list.length === 1 && !editing;
  for (const e of list) {
    const col = e.locked ? '#b93232' : C.accent;
    // Operands are not drawn, so their outlines are: hairlines while the boolean is selected, a full
    // outline (with the usual box and handles) when an operand is selected on its own.
    if (e.boolIn) {
      const inside = sel.has(e.boolIn);
      out.push(s('path', { d: V.pathD(B.outlineOf(e)), fill: 'none', stroke: col, 'stroke-width': (inside ? 1 : 1.5) * k, 'stroke-opacity': inside ? 0.5 : 0.9, 'pointer-events': 'none' }));
      if (inside) continue;
    }
    if (e.live && list.some(x => x.boolIn === e.id)) continue;
    if (e.type === 'conn') {
      const gm = connGeom(e, E);
      out.push(s('path', { d: gm.d, fill: 'none', stroke: col, 'stroke-width': 1.25 * k, 'stroke-opacity': 0.7, 'pointer-events': 'none' }));
      if (solo && !e.locked && !(mode && mode.k === 'connEnd')) for (const [n, at] of [['ca', gm.p], ['cb', gm.q]]) out.push(s('circle', { 'data-h': n, cx: at.x, cy: at.y, r: 4.5 * k, fill: '#ffffff', stroke: col, 'stroke-width': 1.25 * k, style: 'cursor:move' }, s('title', null, 'Drag to re-attach this end')));
      continue;
    }
    if (e.id === cropId) out.push(cropMarks(e, k));
    const g = s('g', { transform: e.rot ? `rotate(${e.rot} ${e.x + e.w / 2} ${e.y + e.h / 2})` : null },
      s('rect', { x: e.x, y: e.y, width: e.w, height: e.h, fill: 'none', stroke: col, 'stroke-width': 1.25 * k, 'stroke-dasharray': e.locked ? `${4 * k} ${3 * k}` : null, 'pointer-events': 'none' }));
    if (solo && !e.locked) {
      const mx = e.x + e.w / 2, my = e.y + e.h / 2, x1 = e.x + e.w, y1 = e.y + e.h;
      g.append(s('circle', { 'data-h': 'rot', cx: x1 + 12 * k, cy: e.y - 12 * k, r: 4 * k, fill: '#ffffff', stroke: col, 'stroke-width': 1.25 * k, style: 'cursor:grab' }, s('title', null, 'Rotate (hold Shift for 15 degree steps)')));
      if (e.type === 'table') { const fr = colFractions(e); let acc = 0; fr.slice(0, -1).forEach((f, i) => { acc += f; g.append(s('rect', { 'data-h': 'col-' + i, class: 'colh', x: e.x + acc * e.w - 4 * k, y: e.y, width: 8 * k, height: e.h, fill: C.accent, 'fill-opacity': 0, style: 'cursor:col-resize' }, s('title', null, 'Drag to resize columns'))); }); }
      const gt = e.type === 'path' && !vedit ? gradTarget(e) : null;
      if (gt) g.append(...gradMarks(e, gt.g, k));
      if (BOXY.includes(e.type)) {
        const gw = 8 * k;
        g.append(edgeGrip('n', e.x, e.y - gw / 2, e.w, gw, 'ns'), edgeGrip('s', e.x, y1 - gw / 2, e.w, gw, 'ns'), edgeGrip('w', e.x - gw / 2, e.y, gw, e.h, 'ew'), edgeGrip('e', x1 - gw / 2, e.y, gw, e.h, 'ew'));
        for (const [n, px, py, cur] of [['nw', e.x, e.y, 'nwse'], ['ne', x1, e.y, 'nesw'], ['sw', e.x, y1, 'nesw'], ['se', x1, y1, 'nwse']]) g.append(handleSq(n, px, py, 4 * k, k, cur));
      }
      // Adjust handles go on top of the edge grips so they can be caught where they overlap.
      const pdef = e.preset && PG.presetDef(e.preset);
      if (pdef && e.type === 'rect') for (const hd of PG.presetHandles(pdef, e.w, e.h, e.adj)) {
        const hx = e.x + hd.x, hy = e.y + hd.y, r = 5 * k;
        g.append(s('path', { 'data-h': 'adj-' + hd.i, class: 'adjh', d: `M${hx} ${hy - r}L${hx + r} ${hy}L${hx} ${hy + r}L${hx - r} ${hy}Z`, fill: '#ffffff', stroke: C.accent, 'stroke-width': 1.25 * k, style: 'cursor:pointer' }, s('title', null, 'Drag to adjust the shape')));
      }
    }
    out.push(g);
    if (solo) out.push(sizeBadge(bbox(e), e.w, e.h, k, !e.locked && e.type !== 'frame' && e.type !== 'tape' && !mode && !e.rot));
    // Quick connect: drag a + handle to another piece, or click it to add a connected piece on that side.
    if (solo && !e.locked && e.type !== 'frame' && e.type !== 'tape' && !mode && e.id !== cropId) for (const sd of SIDES) {
      const at = sidePoint(e, sd, 20 * k), r = 6.5 * k;
      out.push(s('g', { 'data-h': 'qc-' + sd, class: 'qc', style: 'cursor:crosshair' },
        s('title', null, 'Drag to connect, or click to add a connected piece'),
        s('circle', { 'data-h': 'qc-' + sd, cx: at.x, cy: at.y, r, fill: C.frame, stroke: C.accent, 'stroke-width': 1.25 * k }),
        s('path', { 'data-h': 'qc-' + sd, d: `M${at.x - r * 0.42} ${at.y}H${at.x + r * 0.42}M${at.x} ${at.y - r * 0.42}V${at.y + r * 0.42}`, stroke: C.accent, 'stroke-width': 1.4 * k, 'stroke-linecap': 'round', 'pointer-events': 'none' })));
    }
  }
  // Several pieces selected: one box around them all, with handles that turn or scale the whole selection.
  const free = list.filter(e => !e.locked);
  if (list.length > 1 && free.filter(e => e.type !== 'conn').length > 1 && !editing) {
    // A boolean's box is its result's, not the (hidden) shapes inside it.
    const turning = mode && mode.k === 'grotate' ? mode : null, b = turning ? turning.box0 : bounds(panelEls().filter(e => !e.locked)), pad = 6 * k;
    const box = { x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 };
    out.push(s('g', { transform: turning && turning.ang ? `rotate(${turning.ang} ${b.x + b.w / 2} ${b.y + b.h / 2})` : null },
      s('rect', { x: box.x, y: box.y, width: box.w, height: box.h, fill: 'none', stroke: C.accent, 'stroke-width': k, 'pointer-events': 'none' }),
      rotateHandle(box.x + box.w / 2, box.y, C.accent, k),
      turning ? [] : [['nw', box.x, box.y, 'nwse'], ['ne', box.x + box.w, box.y, 'nesw'], ['sw', box.x, box.y + box.h, 'nesw'], ['se', box.x + box.w, box.y + box.h, 'nwse']]
        .map(([n, px, py, cur]) => handleSq('gs-' + n, px, py, 4 * k, k, cur, 'Drag to resize the whole selection'))));
    if (!turning) out.push(sizeBadge(box, b.w, b.h, k));
  }
  if (extra) out.push(extra);
  const hm = hoverMark(k); if (hm) out.unshift(hm);
  ov.replaceChildren(...out);
}
/** Ids that move together: the unlocked selection plus everything sitting inside a selected frame. */
function moveSet() {
  const move = new Set(selEls().filter(e => !e.locked).map(e => e.id));
  for (const f of selEls()) if (f.type === 'frame' && !f.locked) for (const e of all()) if (e.type !== 'conn' && e.type !== 'frame' && !e.locked && e.x >= f.x && e.y >= f.y && e.x + e.w <= f.x + f.w && e.y + e.h <= f.y + f.h) move.add(e.id);
  return move;
}
/** Snap candidates: pieces within a screen of the view (snapping to what you cannot see helps no one, and a big board would make every move scan everything). */
const otherBoxes = skip => {
  const r = cvBox(), vw = r.width / cam.z, vh = r.height / cam.z, v = { x: -cam.x / cam.z - vw, y: -cam.y / cam.z - vh, w: vw * 3, h: vh * 3 };
  return all().filter(e => e.type !== 'conn' && !skip.has(e.id) && e.x <= v.x + v.w && e.x + e.w >= v.x && e.y <= v.y + v.h && e.y + e.h >= v.y).map(bbox);
};
/** Pink measuring lines with end ticks for equal gaps. */
function gapMarks(gaps) {
  if (!gaps || !gaps.length) return null; const k = 1 / cam.z, t = 4 * k;
  return s('g', { 'pointer-events': 'none', stroke: '#e0409a', 'stroke-width': k }, gaps.map(g => g.axis === 'x'
    ? s('path', { d: `M${g.from} ${g.at}H${g.to}M${g.from} ${g.at - t}V${g.at + t}M${g.to} ${g.at - t}V${g.at + t}` })
    : s('path', { d: `M${g.at} ${g.from}V${g.to}M${g.at - t} ${g.from}H${g.at + t}M${g.at - t} ${g.to}H${g.at + t}` })));
}
function guideMarks(guides) {
  if (!guides.length) return null; const k = 1 / cam.z;
  return s('g', { 'pointer-events': 'none' }, guides.map(g => s('line', { ...(g.axis === 'x' ? { x1: g.pos, x2: g.pos, y1: g.from, y2: g.to } : { y1: g.pos, y2: g.pos, x1: g.from, x2: g.to }), stroke: '#e0409a', 'stroke-width': k })));
}
function refresh() {
  if (vedit && !(sel.size === 1 && sel.has(vedit.id) && E(vedit.id))) vedit = null;
  draw(); renderRight(); renderPages(); renderOutline(); renderFly(); renderKanban();
  const u = $('#undo'), r = $('#redo'); if (u) { u.disabled = !hist.undo.length; r.disabled = !hist.redo.length; }
  if (cv) cv.style.cursor = tool === 'pen' ? (penMode === 'erase' ? 'cell' : 'crosshair') : tool === 'select' ? '' : 'crosshair';
  document.querySelectorAll('.toolbar button').forEach(b => { const on = b.dataset.tool === tool; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
}

/* ---------- Actions ---------- */
function removeSel() {
  const ids = new Set(selEls().filter(e => !e.locked).map(e => e.id)); if (!ids.size) return;
  for (const id of [...ids]) if (E(id) && E(id).live) for (const d of LB.descendantsOf(board.els, id)) ids.add(d.id);
  for (let i = 0; i < 8; i++) { const gone = LB.orphans(Object.fromEntries(all().filter(e => !ids.has(e.id)).map(e => [e.id, e]))); if (!gone.length) break; gone.forEach(r => ids.add(r.id)); }
  for (const e of all()) if (ids.has(e.id) || (e.type === 'conn' && (ids.has(e.a) || ids.has(e.b)))) delete board.els[e.id];
  sel.clear(); commit();
}
function pasteEls(src, dx, dy = dx, quiet = false) {
  const map = {}, gmap = {}; let z = topZ(); sel.clear(); editVer++;
  for (const o of src) map[o.id] = uid('e');
  for (const o of src) {
    const e = clone(o); e.id = map[o.id]; e.z = ++z; delete e.locked;
    if (e.g) e.g = gmap[e.g] || (gmap[e.g] = uid('g'));
    if (e.mask) { if (map[e.mask]) e.mask = map[e.mask]; else delete e.mask; }
    if (e.boolIn) { if (map[e.boolIn]) e.boolIn = map[e.boolIn]; else delete e.boolIn; }
    if (e.type === 'conn') { e.a = map[e.a] || null; e.b = map[e.b] || null; e.ax += dx; e.ay += dy; e.bx += dx; e.by += dy; } else { e.x += dx; e.y += dy; }
    board.els[e.id] = e; sel.add(e.id);
  }
  for (const id of sel) { const e = board.els[id]; if (e.live && !all().some(o => o.boolIn === id)) delete e.live; }
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
  const e = { ...clone(o), id: uid('e'), z: topZ() + 1, x: o.x + o.w + 20, text: '' }; delete e.g; delete e.locked; delete e.boolIn; delete e.fit;
  if (Store.uid) e.author = Store.uid; else delete e.author;
  // Keep stepping right until the new note is not sitting on top of another piece.
  const hits = () => all().some(x => x.type !== 'frame' && x.type !== 'conn' && x.x < e.x + e.w && x.x + x.w > e.x && x.y < e.y + e.h && x.y + x.h > e.y);
  for (let i = 0; i < 40 && hits(); i++) e.x += 20;
  board.els[e.id] = e; sel = new Set([e.id]); commit(); startEdit(e.id);
}
function addTask(status) {
  const cards = all().filter(e => e.type === 'card'), r = cvBox();
  const x = cards.length ? Math.min(...cards.map(c => c.x)) : Math.round((r.width / 2 - cam.x) / cam.z - 120), y = cards.length ? Math.max(...cards.map(c => c.y + c.h)) + 20 : Math.round((r.height / 2 - cam.y) / cam.z - 50);
  const e = { id: uid('e'), type: 'card', z: topZ() + 1, x, y, w: 240, h: 100, text: 'New task', status, due: '', notes: '' };
  board.els[e.id] = e; sel = new Set([e.id]); rightTab = 'design'; edFor = null; commit();
  const title = $('#d-task-title'); if (title) { title.focus(); title.select(); }
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
  if (kind === 'ungroup') {
    const freed = [];
    for (const r of panelEls().filter(e => e.live && !e.locked)) {
      const ops = LB.release(board.els, r.id, () => uid('g')), top = ops[ops.length - 1];
      for (const c of all()) if (c.type === 'conn') { if (c.a === r.id) c.a = top ? top.id : null; if (c.b === r.id) c.b = top ? top.id : null; }
      freed.push(...ops);
    }
    for (const e of list) if (board.els[e.id] && !e.live && !e.boolIn) delete e.g;
    for (const e of freed) if (!e.live) delete e.g;
    sel = new Set([...sel].filter(id => board.els[id]));
  }
  if (kind === 'lock') list.forEach(e => { e.locked = true; });
  if (kind === 'unlock') list.forEach(e => { delete e.locked; });
  commit();
}
/** One redraw per frame for streams of pan and zoom events. */
let drawQueued = false;
function drawSoon() { if (drawQueued) return; drawQueued = true; requestAnimationFrame(() => { drawQueued = false; if (board) { draw(); placeEditor(); } }); }
function zoomAt(f, sx, sy, soon = false) {
  const r = cvBox(); if (sx == null) { sx = r.width / 2; sy = r.height / 2; }
  const z = Math.min(4, Math.max(0.1, cam.z * f)), k = z / cam.z;
  cam.x = sx - (sx - cam.x) * k; cam.y = sy - (sy - cam.y) * k; cam.z = z; if (soon) drawSoon(); else { draw(); placeEditor(); }
}
function fit(list) {
  const r = cvBox(), b = bounds(list || all());
  if (!b || !r.width) { cam = { x: r.width / 2 || 300, y: r.height / 2 || 200, z: 1 }; return draw(); }
  const z = Math.min(1.25, Math.max(0.1, Math.min((r.width - 100) / Math.max(b.w, 1), (r.height - 120) / Math.max(b.h, 1))));
  cam = { z, x: r.width / 2 - (b.x + b.w / 2) * z, y: r.height / 2 - (b.y + b.h / 2) * z + 14 }; draw();
}
/** The color of the last sticky note colored by hand, used for the next new one (as FigJam does). */
let lastSticky = null;
function makeChart(x, y, w, ht, keep, into) {
  const drawn = w > 40 && ht > 40, dw = 480, dh = 300;
  const e = into ? { id: uid('e'), type: 'chart', z: into.z, x: into.x, y: into.y, w: into.w, h: into.h, chart: CH.sampleChart() }
    : { id: uid('e'), type: 'chart', z: topZ() + 1, x: Math.round(drawn ? x : x - dw / 2), y: Math.round(drawn ? y : y - dh / 2), w: Math.round(drawn ? w : dw), h: Math.round(drawn ? ht : dh), chart: CH.sampleChart() };
  if (into) delete board.els[into.id];
  board.els[e.id] = e; sel = new Set([e.id]); if (!keep) tool = 'select'; commit();
}
function makeShape(x, y, w, ht, keep) {
  const drawn = w > 8 && ht > 8, sq = SQUARE_SHAPES.test(shapePick), dw = sq ? 120 : 180, dh = sq ? 120 : 100;
  const e = { id: uid('e'), type: 'rect', preset: shapePick, z: topZ() + 1, x: Math.round(drawn ? x : x - dw / 2), y: Math.round(drawn ? y : y - dh / 2), w: Math.round(drawn ? Math.max(w, 20) : dw), h: Math.round(drawn ? Math.max(ht, 20) : dh), text: '', fill: '#ffffff' };
  // On a slide a shape takes the theme's first accent, as PowerPoint's default shape style does.
  if (slideAt(e)) { const th = deckTheme(); DK.linkTheme(e, 'fill', 'accent1', th); DK.linkTheme(e, 'stroke', 'accent1', th); e.color = '#ffffff'; }
  board.els[e.id] = e; sel = new Set([e.id]); if (!keep) tool = 'select'; commit(); startEdit(e.id);
}
/** The preset the Shapes tool places, and the shapes that start square. */
let shapePick = 'rightArrow';
const SQUARE_SHAPES = /^(star|irregularSeal|ellipse|flowChartConnector|flowChartOr|flowChartSummingJunction|smileyFace|sun|moon|heart|noSmoking|donut|blockArc|pie|chord|teardrop|octagon|hexagon|heptagon|decagon|dodecagon|pentagon|plus|math|cloud|gear|cube|can|frame|lightningBolt|circularArrow|quadArrow|triangle|rtTriangle|diamond|flowChartDecision|flowChartSort|flowChartCollate)/;
function makeBox(type, x, y, w, ht, keep = false) {
  if (type === 'shape') { makeShape(x, y, w, ht, keep); return; }
  if (type === 'chart') { makeChart(x, y, w, ht, keep); return; }
  const d = { sticky: [G.STICKY_SIDE, G.STICKY_SIDE], text: [240, 30], rect: [160, 100], ellipse: [160, 100], diamond: [170, 110], card: [240, 100], frame: [480, 320], sticker: [84, 84], tape: [220, 32], table: [360, 120] }[type];
  const drawn = w > 8 && ht > 8, e = { id: uid('e'), type, z: topZ() + 1, x: Math.round(drawn ? x : x - d[0] / 2), y: Math.round(drawn ? y : y - d[1] / 2), w: Math.round(drawn && type !== 'card' ? Math.max(w, 30) : d[0]), h: Math.round(drawn && type !== 'card' && type !== 'text' ? Math.max(ht, 30) : d[1]), text: '' };
  if (type === 'sticky') { e.fill = lastSticky || FILLS[0]; if (Store.uid) e.author = Store.uid; }
  if (['rect', 'ellipse', 'diamond'].includes(type)) e.fill = '#ffffff';
  if (type === 'card') Object.assign(e, { text: 'New task', status: 'todo', due: '', notes: '' });
  if (type === 'frame') e.text = 'Frame';
  if (type === 'table') {
    delete e.text; Object.assign(e, { cells: emptyCells(3, 3), header: true });
    // On a slide a table takes the deck's table style, painted from the theme's first accent.
    if (slideAt(e)) { Object.assign(e, { tstyle: 'medium2', band: true, size: 20 }); DK.linkTheme(e, 'tacc', 'accent1', deckTheme()); }
  }
  const stuck = type === 'sticker' || type === 'tape';
  if (stuck) delete e.text;
  if (type === 'sticker') Object.assign(e, { shape: stamp.shape, fill: stamp.fill });
  if (type === 'tape') { Object.assign(e, { pattern: stamp.pattern || 'stripes', fill: stamp.fill }); if (!drawn) e.rot = -3; }
  // Placing a piece hands back the pointer, as in Figma. Holding Alt keeps the tool for placing several.
  board.els[e.id] = e; sel = new Set([e.id]); if (!keep) tool = 'select'; commit();
  if (type !== 'frame' && !stuck) startEdit(e.id, type === 'table' ? [0, 0] : null);
}

/* ---------- Eraser ---------- */
/** Remove any drawing under the pointer, checking a small ring around it so quick strokes still catch. */
/**
 * The eraser cuts through drawings where it passes, leaving the rest of each stroke. Alt (or a turned
 * drawing) removes whole strokes instead.
 */
function eraseAt(ev) {
  const p = pt(ev), r = 9 / cam.z; let hit = false;
  for (const e of all()) {
    if (e.type !== 'pen' || e.locked || !e.pts) continue;
    const b = bbox(e), rr = r + (e.sw || 4) / 2;
    if (p.x < b.x - rr || p.x > b.x + b.w + rr || p.y < b.y - rr || p.y > b.y + b.h + rr) continue;
    let lx = p.x, ly = p.y;
    if (e.rot) { const cx = e.x + e.w / 2, cy = e.y + e.h / 2, a = -e.rot * Math.PI / 180; lx = cx + (p.x - cx) * Math.cos(a) - (p.y - cy) * Math.sin(a); ly = cy + (p.x - cx) * Math.sin(a) + (p.y - cy) * Math.cos(a); }
    lx -= e.x; ly -= e.y;
    if (ev.altKey || e.rot) { if (touches(e.pts, lx, ly, rr)) { delete board.els[e.id]; sel.delete(e.id); hit = true; } continue; }
    const runs = eraseStroke(e.pts, lx, ly, rr);
    if (runs.reduce((a, run) => a + run.length, 0) === e.pts.length) continue;
    hit = true; delete board.els[e.id]; sel.delete(e.id);
    runs.forEach((run, i) => {
      const xs = run.map(q => q[0]), ys = run.map(q => q[1]), mx = Math.min(...xs), my = Math.min(...ys);
      const n = { ...e, id: i === 0 ? e.id : uid('e'), x: Math.round((e.x + mx) * 10) / 10, y: Math.round((e.y + my) * 10) / 10, w: Math.round(Math.max(...xs) - mx), h: Math.round(Math.max(...ys) - my), pts: run.map(q => [Math.round((q[0] - mx) * 10) / 10, Math.round((q[1] - my) * 10) / 10, ...q.slice(2)]) };
      board.els[n.id] = n;
    });
  }
  if (hit) draw();
  // Vectors are cut when the stroke ends; until then the swept band shows where the eraser went.
  const trail = mode && mode.k === 'erase' ? (mode.trail ||= []) : null;
  if (trail) trail.push([p.x, p.y]);
  drawOverlay(s('g', { 'pointer-events': 'none' },
    trail && trail.length > 1 ? s('polyline', { points: trail.map(q => q.join(',')).join(' '), fill: 'none', stroke: C.accent, 'stroke-opacity': 0.18, 'stroke-width': r * 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }) : null,
    s('circle', { cx: p.x, cy: p.y, r, fill: C.accent, 'fill-opacity': 0.08, stroke: C.accent, 'stroke-width': 1 / cam.z })));
}
/**
 * The eraser on vectors (see vecerase.ts): filled shapes lose the swept band, open strokes are cut
 * where it passed. With Alt, every vector it touched is removed whole, as with drawings. Booleans
 * and the shapes inside them are left alone.
 */
function eraseVectors(trail, whole) {
  if (!trail.length) return;
  const r = 9 / cam.z, xs = trail.map(q => q[0]), ys = trail.map(q => q[1]);
  const tb = { x: Math.min(...xs) - r, y: Math.min(...ys) - r, w: Math.max(...xs) - Math.min(...xs) + 2 * r, h: Math.max(...ys) - Math.min(...ys) + 2 * r };
  for (const e of all()) {
    if (e.type !== 'path' || e.locked || e.live || e.boolIn || e.masking) continue;
    const b = bbox(e), pad = (e.sw || 0) / 2;
    if (b.x - pad > tb.x + tb.w || b.x + b.w + pad < tb.x || b.y - pad > tb.y + tb.h || b.y + b.h + pad < tb.y) continue;
    const local = trail.map(q => { const [fx, fy] = boxFrac(e, { x: q[0], y: q[1] }); return [e.x + fx * e.w, e.y + fy * e.h]; });
    const out = VE.eraseSubs(V.worldPaths(e), local, r, PT.strokeLayers(e).reduce((m, l) => Math.max(m, l.width), 0));
    if (!out) continue;
    if (whole || !out.length) { for (const c of all()) if (c.type === 'conn' && (c.a === e.id || c.b === e.id)) delete board.els[c.id]; delete board.els[e.id]; sel.delete(e.id); }
    else V.placeWorldPaths(e, out);
  }
  draw();
}

/* ---------- Connecting ---------- */
const targetAt = (p, exclude) => pickTarget(all(), p.x, p.y, 10 / cam.z, exclude);
const sideAt = (id, p) => id ? nearSide(E(id), p.x, p.y, 16 / cam.z) : null;
/** Outline and side dots on the piece a connector is about to attach to; the dot under the pointer is filled. */
function targetMarks(id, side) {
  const e = id && E(id); if (!e) return [];
  const k = 1 / cam.z, out = [s('rect', { x: e.x - 2 * k, y: e.y - 2 * k, width: e.w + 4 * k, height: e.h + 4 * k, rx: 3 * k, fill: C.accent, 'fill-opacity': 0.06, stroke: C.accent, 'stroke-width': 2 * k, transform: e.rot ? `rotate(${e.rot} ${e.x + e.w / 2} ${e.y + e.h / 2})` : null, 'pointer-events': 'none' })];
  for (const sd of SIDES) { const at = sidePoint(e, sd); out.push(s('circle', { cx: at.x, cy: at.y, r: (sd === side ? 6 : 4) * k, fill: sd === side ? C.accent : '#ffffff', stroke: C.accent, 'stroke-width': 1.5 * k, 'pointer-events': 'none' })); }
  return out;
}
/** A connector as it would be drawn, from what is being dragged right now. */
function connPreview(m, p) {
  const b = targetAt(p, m.a), bs = sideAt(b, p);
  const tmp = { id: '__preview', type: 'conn', z: 0, x: 0, y: 0, w: 0, h: 0, a: m.a, as: m.as || undefined, ax: m.p.x, ay: m.p.y, b, bs: bs || undefined, bx: p.x, by: p.y, style: connStyle === 'straight' ? undefined : connStyle, stroke: connColor || undefined };
  return { b, bs, g: s('g', { 'pointer-events': 'none' }, s('g', { opacity: 0.8 }, renderEl(tmp, rctx(false))), targetMarks(m.a, m.as), targetMarks(b, bs)) };
}
function addConn(m, p, b, bs) {
  const e = { id: uid('e'), type: 'conn', z: topZ() + 1, x: 0, y: 0, w: 0, h: 0, a: m.a, b, ax: Math.round(m.p.x), ay: Math.round(m.p.y), bx: Math.round(p.x), by: Math.round(p.y),
    ...(m.as ? { as: m.as } : {}), ...(bs ? { bs } : {}), ...(connStyle !== 'straight' ? { style: connStyle } : {}), ...(connColor ? { stroke: connColor } : {}) };
  board.els[e.id] = e; return e;
}
/** Click on a + handle: add a matching piece on that side, joined by a connector, and start typing in it. */
function quickAdd(src, side) {
  const same = ['sticky', 'rect', 'ellipse', 'diamond', 'card', 'text'].includes(src.type), type = same ? src.type : 'sticky';
  const w = same ? src.w : 180, ht = same ? src.h : 150, dir = sideDir(src, side), cx = src.x + src.w / 2, cy = src.y + src.h / 2;
  let reach = (Math.abs(dir.x) * src.w + Math.abs(dir.y) * src.h) / 2 + 80 + (Math.abs(dir.x) * w + Math.abs(dir.y) * ht) / 2;
  const n = { id: uid('e'), type, z: topZ() + 1, x: 0, y: 0, w, h: ht, text: type === 'card' ? 'New task' : '' };
  for (const key of ['fill', 'font', 'weight', 'size', 'italic', 'color', 'align']) if (same && src[key] != null) n[key] = src[key];
  if (type === 'sticky' && !n.fill) n.fill = FILLS[0];
  if (type === 'card') Object.assign(n, { status: 'todo', due: '', notes: '' });
  const place = () => { n.x = Math.round(cx + dir.x * reach - w / 2); n.y = Math.round(cy + dir.y * reach - ht / 2); };
  const hits = () => all().some(o => o.type !== 'conn' && o.type !== 'frame' && o.x < n.x + w && o.x + o.w > n.x && o.y < n.y + ht && o.y + o.h > n.y);
  place(); for (let i = 0; i < 12 && hits(); i++) { reach += 40; place(); }
  board.els[n.id] = n;
  addConn({ a: src.id, as: side, p: { x: cx, y: cy } }, { x: n.x, y: n.y }, n.id, src.rot ? null : OPPOSITE[side]);
  sel = new Set([n.id]); commit(); startEdit(n.id);
}

/* ---------- Table styles and pictures (panel) ---------- */
/** A small picture of a table style in an accent: three rows of three cells. */
function tableThumb(kind, acc) {
  const t = { id: 'tt', type: 'table', z: 0, x: 0, y: 0, w: 60, h: 36, cells: emptyCells(3, 3), header: true, band: true, tstyle: kind, tacc: acc };
  const cellsOut = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const lk = cellLook(t, r, c), x = c * 20, y = r * 12;
    cellsOut.push(s('rect', { x, y, width: 20, height: 12, fill: lk.fill || '#ffffff', stroke: lk.border ? lk.border[0] : 'none', 'stroke-width': lk.border ? 1 : 0 }));
  }
  return s('svg', { viewBox: '0 0 60 36', width: 60, height: 36, 'aria-hidden': 'true' }, s('rect', { width: 60, height: 36, fill: '#ffffff' }), ...cellsOut);
}
/** Table style choices: a plain board table or one of the deck styles, its accent, and which parts it marks. */
function tableStyleUI(tb) {
  const th = SL.slidesOf(board.els).length ? deckTheme() : null, acc = tb.tacc || (th ? th.colors.accent1 : '#2e6fd8');
  const setKind = k => { if (k === '') { ['tstyle', 'tacc', 'band', 'firstCol', 'lastRow'].forEach(x => delete tb[x]); if (tb.tc) delete tb.tc.tacc; } else { if (!tb.tstyle) { tb.band = true; if (th) DK.linkTheme(tb, 'tacc', 'accent1', th); else tb.tacc = acc; } tb.tstyle = k; } commit(); };
  const flag = (key, label) => h('button', { class: 'fbtn', 'aria-pressed': String(!!tb[key]), onclick: () => { if (tb[key]) delete tb[key]; else tb[key] = true; commit(); } }, label);
  const accents = th ? DK.SWATCH_SLOTS.filter(x => x.startsWith('accent') || x === 'dk1').map(slot => [th.colors[slot], DK.SLOT_NAMES[slot], slot]) : VIVID.map(c => [c, null, null]);
  return [
    h('div', { class: 'f-label' }, 'Style'),
    h('div', { class: 'tstyles', role: 'group', 'aria-label': 'Table style' },
      h('button', { class: 'tsty', 'aria-pressed': String(!tb.tstyle), title: 'Board table: a card with a soft header', onclick: () => setKind('') }, h('span', { class: 'tsty-card' }), h('span', null, 'Board')),
      TABLE_KINDS.map(([k, label]) => h('button', { class: 'tsty', 'aria-pressed': String(tb.tstyle === k), title: label, onclick: () => setKind(k) }, tableThumb(k, acc), h('span', null, label)))),
    tb.tstyle && !['none', 'grid'].includes(tb.tstyle) ? [h('div', { class: 'f-label' }, th ? 'Accent (theme)' : 'Accent'),
      h('div', { class: 'swatches' }, accents.map(([c, name, slot]) => h('button', { class: 'sw sm', style: 'background:' + c, title: name || c, 'aria-label': name || 'Color ' + c, 'aria-pressed': String((tb.tacc || '') === c),
        onclick: () => { if (slot) DK.linkTheme(tb, 'tacc', slot, th); else { tb.tacc = c; if (tb.tc) delete tb.tc.tacc; } commit(); } })))] : null,
    h('div', { class: 'row wrap' }, flag('header', 'Header row'), tb.tstyle ? [flag('band', 'Banded rows'), flag('firstCol', 'First column'), flag('lastRow', 'Total row')] : null),
  ];
}
/** The Picture section: crop, corners, border, and adjustments. */
function pictureSection(e, num, pick, swatch) {
  const pct = v => Math.round((v || 0) * 100);
  const slider = (key, label) => h('label', { class: 'slider' }, h('span', null, label),
    h('input', { type: 'range', min: -100, max: 100, step: 1, value: pct(e[key]), style: `--fill:${(pct(e[key]) + 100) / 2}%`, 'aria-label': label,
      oninput: ev => { const v = Number(ev.target.value) / 100; ev.target.style.setProperty('--fill', (Number(ev.target.value) + 100) / 2 + '%'); if (v) e[key] = v; else delete e[key]; ev.target.nextSibling.textContent = String(Math.round(v * 100)); draw(); },
      onchange: () => holdCommit(), ondblclick: () => { delete e[key]; commit(); } }),
    h('span', { class: 'slider-v' }, String(pct(e[key]))));
  const corner = e.oval ? 'oval' : String(e.rad || 0);
  const ratios = [['Original', 0], ['1:1', 1], ['4:3', 4 / 3], ['16:9', 16 / 9], ['3:4', 3 / 4]];
  return h('section', { class: 'psec' }, h('h3', null, 'Picture'),
    h('button', { class: 'fbtn', 'aria-pressed': String(cropId === e.id), title: 'Crop (double-click the picture)', disabled: !!e.locked, onclick: () => cropId === e.id ? endCrop() : startCrop(e.id) }, icon('M6 3v11h11M3 6h11v11', 14), cropId === e.id ? 'Done cropping' : 'Crop'),
    h('div', { class: 'row' },
      h('div', { class: 'seg grow', role: 'group', 'aria-label': 'Crop to shape' }, ratios.map(([l, r]) => h('button', { title: r ? 'Crop to ' + l : 'Show the whole picture', disabled: !!e.locked, onclick: () => { if (r) PIC.cropTo(e, r); else PIC.resetCrop(e); commit(); } }, r ? l : 'Full')))),
    h('div', { class: 'grid2' },
      pick('pic-corner', 'Corners', [['0', 'Square'], ['8', 'Rounded'], ['24', 'Round'], ['oval', 'Oval']], corner, v => { if (v === 'oval') { e.oval = true; delete e.rad; } else { delete e.oval; if (v === '0') delete e.rad; else e.rad = Number(v); } commit(); }),
      pick('pic-border', 'Border width', [['0', 'No border'], ['2', '2 px'], ['4', '4 px'], ['8', '8 px']], String(e.stroke && e.sw ? e.sw : 0), v => { if (v === '0') { delete e.sw; delete e.stroke; } else { e.sw = Number(v); if (!e.stroke) e.stroke = '#ffffff'; } commit(); })),
    e.sw ? h('div', { class: 'swatches' }, ['#ffffff', '#17202d', ...VIVID].map(c => swatch(c, e.stroke === c, () => { e.stroke = c; commit(); }, null, true))) : null,
    h('div', { class: 'f-label' }, 'Adjust'),
    slider('bright', 'Brightness'), slider('contrast', 'Contrast'), slider('sat', 'Saturation'),
    h('div', { class: 'row' },
      h('button', { class: 'fbtn', 'aria-pressed': String(!!e.gray), onclick: () => { if (e.gray) delete e.gray; else e.gray = true; commit(); } }, 'Black and white'),
      h('button', { class: 'fbtn', disabled: !PIC.adjustments(e), onclick: () => { ['bright', 'contrast', 'sat', 'gray'].forEach(k => delete e[k]); commit(); } }, 'Reset')));
}

/** The Chart and Chart data sections: type, title, legend, labels, gridlines, and the data table. */
function chartSections(e) {
  const c = e.chart, live = () => draw(), done = () => holdCommit();
  const replace = next => { e.chart = next; commit(); };
  // Pasting rows copied from a spreadsheet into any data cell replaces the table.
  const onPaste = ev => {
    const t = ev.clipboardData ? ev.clipboardData.getData('text/plain') : '';
    if (!/[\t\n]/.test(t.trim())) return;
    const next = CH.fromTable(t, c.kind); if (!next) return;
    ev.preventDefault(); replace({ ...next, title: c.title, legend: c.legend, labels: c.labels, grid: c.grid });
  };
  const cell = (value, label, onIn, cls = '') => h('input', { class: 'cd-in ' + cls, value, 'aria-label': label, oninput: ev => { onIn(ev.target.value); live(); }, onchange: done, onpaste: onPaste });
  const pie = c.kind === 'pie' || c.kind === 'doughnut';
  const typeSec = h('section', { class: 'psec' }, h('h3', null, 'Chart'),
    h('div', { class: 'ckinds', role: 'group', 'aria-label': 'Chart type' }, CH.CHART_KINDS.map(([k, label, d]) =>
      h('button', { class: 'ck', title: label, 'aria-label': label, 'aria-pressed': String(c.kind === k), onclick: () => { c.kind = k; commit(); } }, icon(d, 18)))),
    h('input', { class: 'inp', placeholder: 'Chart title', 'aria-label': 'Chart title', value: c.title || '', oninput: ev => { if (ev.target.value) c.title = ev.target.value; else delete c.title; live(); }, onchange: done }),
    h('div', { class: 'row' },
      h('div', { class: 'seg grow', role: 'group', 'aria-label': 'Legend' }, [['bottom', 'Legend below'], ['right', 'Legend right'], ['none', 'No legend']].map(([k, label]) =>
        h('button', { 'aria-pressed': String((c.legend || 'bottom') === k), title: label, onclick: () => { c.legend = k; commit(); } }, k === 'none' ? 'None' : k === 'right' ? 'Right' : 'Below')))),
    h('div', { class: 'row' },
      h('button', { class: 'fbtn', 'aria-pressed': String(pie ? c.labels !== false : !!c.labels), onclick: () => { c.labels = pie ? c.labels === false : !c.labels; commit(); } }, 'Data labels'),
      pie ? null : h('button', { class: 'fbtn', 'aria-pressed': String(c.grid !== false), onclick: () => { c.grid = c.grid === false; commit(); } }, 'Gridlines')));
  const x = (label, fn, dis) => h('button', { class: 'cd-x', title: label, 'aria-label': label, disabled: !!dis, onclick: fn }, icon('M6 6l8 8M14 6l-8 8', 10));
  const dataSec = h('section', { class: 'psec' }, h('h3', null, 'Chart data'),
    h('div', { class: 'cdata' }, h('table', null,
      h('thead', null, h('tr', null, h('th', null),
        c.series.map((sr, si) => h('th', null, h('div', { class: 'cd-head' },
          cell(sr.name, `Series ${si + 1} name`, v => { sr.name = v; }, 'cd-name'),
          x('Remove this series', () => replace(CH.dropSeries(c, si)), c.series.length < 2 || pie && si > 0)))))),
      h('tbody', null, c.cats.map((cat, i) => h('tr', null,
        h('th', null, h('div', { class: 'cd-head' }, x('Remove this row', () => replace(CH.dropCategory(c, i)), c.cats.length < 2), cell(cat, `Category ${i + 1}`, v => { c.cats[i] = v; }, 'cd-cat'))),
        c.series.map((sr, si) => h('td', null, cell(String(sr.vals[i] ?? 0), `${sr.name}, ${cat}`, v => { sr.vals[i] = CH.num(v); }, 'cd-num')))))))),
    h('div', { class: 'row' },
      h('button', { class: 'fbtn', onclick: () => replace(CH.addCategory(c)) }, 'Add row'),
      pie ? null : h('button', { class: 'fbtn', onclick: () => replace(CH.addSeries(c)) }, 'Add series')),
    h('p', { class: 'hint' }, pie ? 'A pie shows the first series. Paste rows from a spreadsheet into any cell to replace the data.' : 'Paste rows from a spreadsheet into any cell to replace the data: series across the top, categories down the side.'));
  return [typeSec, dataSec];
}

/* ---------- Text editing ---------- */
/** Text pieces edit in the paragraph editor; everything else in the plain one. */
const richEd = e => !!e && e.type === 'text';
function placeEditor() {
  const e = editing && E(editing); if (!e) return;
  const ed = richEd(e) ? $('#red') : $('#ed');
  const onCanvas = ['text', 'frame', 'conn'].includes(e.type), z = cam.z, st = G.textStyle(e), lab = e.type === 'conn' ? connGeom(e, E).label : null, centered = !!lab || ['rect', 'ellipse', 'diamond'].includes(e.type);
  const cb = e.type === 'table' && editCell ? cellBox(e, editCell[0], editCell[1]) : null, fk = e.type === 'frame' ? 1 / Math.min(1, Math.max(0.2, cam.z)) : 1, chipW = e.slide ? (G.measure(String(e.slide), 11, 600) + 18) * fk : 0;
  const box = cb ? [cb.x, cb.y, cb.w, cb.h] : lab ? [lab.x - 90, lab.y - 15, 180, 30] : e.type === 'card' ? [e.x + 12, e.y + 4, e.w - 20, 44] : e.type === 'frame' ? [e.x - 2 + chipW, e.y - 22 * fk, Math.max(e.w - chipW, 160), 20 * fk]
    : e.type === 'text' ? [e.x - 2, e.y - 2, e.w + 4, e.h + 4] : [e.x, e.y, e.w, e.h];
  if (richEd(e)) RE.styleRich(ed, e, z);
  Object.assign(ed.style, { display: 'block', left: cam.x + box[0] * z + 'px', top: cam.y + box[1] * z + 'px', width: box[2] * z + 'px', height: richEd(e) ? 'auto' : Math.max(box[3] * z, 24) + 'px', minHeight: Math.max(box[3] * z, 24) + 'px',
    fontSize: st.size * z * fk + 'px', fontFamily: st.family, fontWeight: st.weight, fontStyle: st.italic ? 'italic' : 'normal',
    padding: (e.type === 'sticky' ? 10 : e.type === 'frame' || e.type === 'text' || lab ? 2 : 8) * z + 'px', paddingTop: phPad(e, st) * z + 'px',
    textAlign: e.align || (centered ? 'center' : 'left'), ...editorPaint(e, onCanvas),
    transform: e.rot && !lab ? `rotate(${e.rot}deg)` : '', transformOrigin: lab ? '' : `${(e.x + e.w / 2 - box[0]) * z}px ${(e.y + e.h / 2 - box[1]) * z}px` });
}
/** Top padding that keeps a placeholder's text where it is drawn (anchored middle or bottom) while editing. */
function phPad(e, st) {
  if (e.type === 'sticky') return 10;
  if (!e.ph || e.type !== 'text' || !e.va || e.va === 'top') return ['frame', 'text', 'conn'].includes(e.type) ? 2 : 8;
  const block = Math.max(st.size * 1.3, G.textHeight(e, e.w - 4));
  return Math.max(2, e.va === 'bottom' ? e.h - block - 2 : (e.h - block) / 2 + 2);
}
/** Background and text color for the text editor, matching the piece as it is painted on screen. */
function editorPaint(e, onCanvas) {
  const th = C.theme === 'dark' && e.type !== 'frame' && slideAt(e) ? 'light' : C.theme;
  const under = e.type === 'text' ? (underFn(board.els, th) || (() => undefined))(e) : undefined;
  const bg = under || (onCanvas ? (th === 'light' ? LIGHT.frame : C.frame) : ['card', 'table'].includes(e.type) ? SURFACE[th].card : paintFill(e.fill, th) || C.frame);
  return { background: bg, color: inkOn(bg, e.color, th) };
}
function startEdit(id, cell) {
  const e = E(id); if (!e || e.locked || !TEXTY.includes(e.type)) return;
  if (e.type === 'table') { e.cells = normCells(e.cells); editCell = cell || [0, 0]; } else editCell = null;
  editing = id;
  if (richEd(e)) {
    const red = $('#red'); RE.fillRich(red, e.text); placeEditor(); refresh(); red.focus();
    const r = document.createRange(); r.selectNodeContents(red); const sl = getSelection(); sl.removeAllRanges(); sl.addRange(r);
    return;
  }
  const ed = $('#ed'); ed.value = e.type === 'table' ? e.cells[editCell[0]][editCell[1]] : e.text || ''; placeEditor(); refresh(); ed.focus(); ed.select();
}
/** After typing in the paragraph editor: tidy its structure, refit the piece, and redraw. */
function richInput() {
  const e = editing && E(editing), red = $('#red'); if (!e) return;
  RE.normalizeRich(red); e.text = RE.readRich(red); fitText(e); placeEditor(); draw();
}
function richKey(ev) {
  ev.stopPropagation();
  const e = editing && E(editing), red = ev.currentTarget, mod = ev.ctrlKey || ev.metaKey;
  if (ev.key === 'Tab') { ev.preventDefault(); if (RE.indentRich(red, ev.shiftKey ? -1 : 1)) richInput(); return; }
  if (mod && ev.shiftKey && (ev.key === '*' || ev.key === '8' || ev.key === '&' || ev.key === '7') && e) {
    ev.preventDefault(); const kind = ev.key === '8' || ev.key === '*' ? 'disc' : 'num';
    if (e.bullets === kind) delete e.bullets; else e.bullets = kind; richInput(); return;
  }
  if (ev.key === 'Escape' || (ev.key === 'Enter' && mod)) { ev.preventDefault(); red.blur(); }
}
function endEdit() {
  if (!editing) return; const e = E(editing), ed = $('#ed'), red = $('#red'), rich = richEd(e); editing = null; ed.style.display = 'none'; red.style.display = 'none';
  if (e && rich) { RE.normalizeRich(red); e.text = RE.readRich(red).replace(/\s+$/, ''); red.replaceChildren(); if (!e.text.trim() && !e.ph) delete board.els[e.id]; else { if (!e.text.trim()) e.text = ''; fitText(e); } }
  else if (e && e.type === 'table') { const [r, c] = editCell || [0, 0]; e.cells = normCells(e.cells); e.cells[r][c] = ed.value.replace(/\s+$/, ''); fitText(e); editCell = null; }
  else if (e) { e.text = ed.value.replace(/\s+$/, ''); if (e.type === 'text' && !e.text && !e.ph) delete board.els[e.id]; else { if (e.type === 'frame' && !e.text) e.text = 'Frame'; if (e.type === 'card' && !e.text) e.text = 'Untitled task'; fitText(e); } }
  edFor = null; commit();
}

/* ---------- Pointer input ---------- */
/**
 * The canvas's place on screen, measured once and kept until the canvas resizes. Measuring on every
 * pointer move made the browser lay out the whole board each time.
 */
let cvRect = null, cvObs = null;
function cvBox() {
  if (!cvRect || cvRect.el !== cv) {
    const r = cv.getBoundingClientRect(); cvRect = { el: cv, left: r.left, top: r.top, width: r.width, height: r.height };
    if (!cvObs && typeof ResizeObserver !== 'undefined') cvObs = new ResizeObserver(() => { cvRect = null; });
    if (cvObs) { cvObs.disconnect(); cvObs.observe(cv); }
  }
  return cvRect;
}
addEventListener('resize', () => { cvRect = null; });
function pt(ev) { const r = cvBox(), sx = ev.clientX - r.left, sy = ev.clientY - r.top; return { sx, sy, x: (sx - cam.x) / cam.z, y: (sy - cam.y) / cam.z }; }
function idAt(target, ev) {
  const g = target && target.closest && target.closest('[data-id]');
  if (g) return g.getAttribute('data-id');
  // In the far view there are no SVG nodes to hit: pick the topmost piece under the pointer from the index.
  if (lodOn && ev && lodIdx && !(target && target.closest && target.closest('[data-h],[data-ph-act]'))) {
    const p = pt(ev), e = LOD.pickAt(lodOrder, lodIdx, p.x, p.y, 3 / cam.z); return e ? e.id : null;
  }
  return null;
}
function onDown(ev) {
  closeMenu(); if (ev.button === 2) return;
  const act = document.activeElement; if (act && act !== document.body && act.blur) act.blur();
  if (editing) endEdit();
  const p = pt(ev), now = Date.now(); let id = idAt(ev.target, ev); hoverId = null;
  const dbl = now - lastDown.t < 350 && Math.hypot(ev.clientX - lastDown.x, ev.clientY - lastDown.y) < 6; lastDown = { t: dbl ? 0 : now, x: ev.clientX, y: ev.clientY };
  cv.setPointerCapture(ev.pointerId);
  if (ev.button === 1 || spaceDown) { mode = { k: 'pan', sx: ev.clientX, sy: ev.clientY, cx: cam.x, cy: cam.y }; return; }
  if (vedit && vEditDown(ev, p, id, dbl)) return;
  if (tool === 'vpen') { vPenDown(ev, p, dbl); return; }
  if (tool === 'select') {
    const act = ev.target.closest && ev.target.closest('[data-ph-act]');
    if (act && id) { phInsert(id, act.getAttribute('data-ph-act')); return; }
    if (cropId) {
      const ce = E(cropId), hd0 = ev.target.dataset && ev.target.dataset.h;
      if (ce && hd0 && hd0.length <= 2) { mode = { k: 'resize', hd: hd0, e: ce, o: clone(ce), p, others: [], crop: PIC.fullRect(ce) }; return; }
      if (ce && id === cropId) { mode = { k: 'cpan', e: ce, full: PIC.fullRect(ce), c0: ce.crop ? [...ce.crop] : null, p }; return; }
      endCrop();
    }
    if (ev.target.dataset && ev.target.dataset.h) { const e = selEls()[0], hd = ev.target.dataset.h; 
      if (hd.startsWith('gs-')) {
        // Scale the whole selection away from the corner opposite the one being dragged.
        const b = bounds(panelEls().filter(x => !x.locked)), c = hd.slice(3), ax = c.includes('w') ? b.x + b.w : b.x, ay = c.includes('n') ? b.y + b.h : b.y;
        mode = { k: 'gscale', start: [...moveSet()].map(i => clone(E(i))), ax, ay, vx: (c.includes('w') ? b.x : b.x + b.w) - ax, vy: (c.includes('n') ? b.y : b.y + b.h) - ay }; return;
      }
      if (hd === 'ca' || hd === 'cb') { mode = { k: 'connEnd', e, end: hd === 'ca' ? 'a' : 'b' }; return; }
      if (hd.startsWith('gr-')) { const gt = gradTarget(e); if (gt) { mode = { k: 'grad', e, which: hd.slice(3), lk: gt.k, li: gt.i }; return; } }
      if (hd.startsWith('adj-')) { mode = { k: 'adjh', e, i: Number(hd.slice(4)) }; return; }
      if (hd.startsWith('col-')) { mode = { k: 'colsz', e, i: Number(hd.slice(4)), fr: colFractions(e), p }; return; }
      if (hd.startsWith('qc-')) { const side = hd.slice(3); mode = { k: 'conn', quick: true, a: e.id, as: side, p: sidePoint(e, side), sx: ev.clientX, sy: ev.clientY, moved: false }; return; }
      if (hd === 'rot') {
        const one = sel.size === 1, b = one ? e : bounds(panelEls().filter(x => !x.locked)), c = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
        mode = { k: 'grotate', start: [...moveSet()].map(i => clone(E(i))), c, a0: Math.atan2(p.y - c.y, p.x - c.x), ang: 0, base: one ? e.rot || 0 : 0, box0: { x: b.x, y: b.y, w: b.w, h: b.h } }; return;
      }
      mode = { k: 'resize', hd, e, o: clone(e), p, others: otherBoxes(new Set([e.id])) }; return;
    }
    // Live booleans: double-click steps in to the operand under the pointer (and into its nodes on a
    // second double-click); a selected operand stays the drag target wherever the pointer is over it.
    const inner = selectedOperandAt(p);
    if (dbl && (inner || (id && E(id).live))) {
      if (inner && inner.type === 'path' && !inner.live) { enterVedit(inner.id); return; }
      if (inner && !inner.live && TEXTY.includes(inner.type)) { startEdit(inner.id); return; }
      const level = inner ? (inner.live ? inner : E(inner.boolIn)) : E(id);
      const hit = LB.operandAt(board.els, level.id, p.x, p.y);
      if (hit) { sel = new Set(withKids(hit.id)); refresh(); return; }
      if (inner) return;
    }
    if (inner) id = inner.id;
    if (dbl && id && E(id).type === 'path') { enterVedit(id); return; }
    if (dbl && id && E(id).type === 'image') { startCrop(id); return; }
    if (dbl) { if (id) { sel = new Set([id]); refresh(); startEdit(id, E(id).type === 'table' ? cellAt(E(id), p.x, p.y) : null); } else makeBox('sticky', p.x, p.y, 0, 0); return; }
    if (id) {
      const had = sel.has(id);
      if (ev.shiftKey) { group(id).forEach(i => had ? sel.delete(i) : sel.add(i)); refresh(); return; }
      if (!had) sel = new Set(E(id).boolIn ? withKids(id) : group(id));
      // Alt-drag pulls a copy off the selection and leaves the original in place.
      if (ev.altKey) pasteEls(snapSel(), 0, 0, true);
      const move = moveSet();
      mode = { k: 'drag', p, id, had, dup: ev.altKey, moved: false, start: [...move].map(i => clone(E(i))), box0: bounds([...move].map(E)), others: otherBoxes(move) }; refresh(); return;
    }
    if (!ev.shiftKey) sel.clear(); mode = { k: 'marquee', p, keep: new Set(sel) }; refresh(); return;
  }
  if (tool === 'pen' && penMode === 'erase') { mode = { k: 'erase' }; eraseAt(ev); return; }
  if (tool === 'pen') { mode = { k: 'pen', pts: [[p.x, p.y, ...pressure(ev)]] }; return; }
  if (tool === 'conn') { const a = targetAt(p); mode = { k: 'conn', a, as: sideAt(a, p), p, sx: ev.clientX, sy: ev.clientY, moved: false }; return; }
  mode = { k: 'create', p };
}
// Dragging near the edge of the canvas pans the board, so pieces and connectors can travel past the screen.
let edgeRaf = 0, edgeEv = null;
function edgeScroll(ev) {
  edgeEv = ev; if (edgeRaf || ev.synthetic) return;
  const step = () => {
    edgeRaf = 0;
    if (!mode || !edgeEv || !['drag', 'marquee', 'conn', 'connEnd', 'create', 'resize', 'gscale'].includes(mode.k)) return;
    const r = cvBox(), m = 32, x = edgeEv.clientX - r.left, y = edgeEv.clientY - r.top;
    const push = (v, size) => v < m ? Math.min(m - v, 48) : v > size - m ? -Math.min(v - (size - m), 48) : 0;
    const vx = push(x, r.width), vy = push(y, r.height); if (!vx && !vy) return;
    cam.x += vx * 0.4; cam.y += vy * 0.4;
    onMove({ clientX: edgeEv.clientX, clientY: edgeEv.clientY, shiftKey: edgeEv.shiftKey, ctrlKey: edgeEv.ctrlKey, metaKey: edgeEv.metaKey, altKey: edgeEv.altKey, synthetic: true });
    edgeRaf = requestAnimationFrame(step);
  };
  edgeRaf = requestAnimationFrame(step);
}
/**
 * Hover outlines, as in Figma: the piece under the pointer gets a thin outline, and inside a selected
 * boolean the shape a double-click would pick is outlined.
 */
let hoverId = null;
function hoverAt(ev) {
  let id = null;
  if (board && tool === 'select' && !vedit && !editing) {
    const p = pt(ev), roots = panelEls(), one = roots.length === 1 ? roots[0] : null;
    const level = one && one.live ? one : one && one.boolIn && sel.size ? E(one.boolIn) : null;
    if (level) { const o = LB.operandAt(board.els, level.id, p.x, p.y); if (o && !sel.has(o.id) || (o && o.live)) id = o.id; }
    if (!id) { const d = idAt(ev.target, ev); if (d && !sel.has(d)) id = d; }
  }
  if (id !== hoverId) { hoverId = id; drawOverlay(); }
}
function hoverMark(k) {
  const e = hoverId && E(hoverId); if (!e || mode || (sel.has(e.id) && !e.boolIn)) return null;
  const col = C.accent, w = 1.5 * k;
  if (e.type === 'conn') return s('path', { d: connGeom(e, E).d, fill: 'none', stroke: col, 'stroke-width': w, 'pointer-events': 'none' });
  if (B.BOOLEABLE.has(e.type) || e.type === 'pen') return s('path', { d: V.pathD(B.outlineOf(e)), fill: 'none', stroke: col, 'stroke-width': w, 'pointer-events': 'none' });
  return s('rect', { x: e.x, y: e.y, width: e.w, height: e.h, fill: 'none', stroke: col, 'stroke-width': w, 'pointer-events': 'none', transform: e.rot ? `rotate(${e.rot} ${e.x + e.w / 2} ${e.y + e.h / 2})` : null });
}
function onMove(ev) {
  if (!mode && vdraft && tool === 'vpen') { vdraft.hover = pt(ev); drawDraft(); return; }
  if (!mode && tool === 'pen' && penMode === 'erase' && board) { const p = pt(ev); drawOverlay(s('circle', { cx: p.x, cy: p.y, r: 9 / cam.z, fill: 'none', stroke: C.muted, 'stroke-width': 1 / cam.z, 'pointer-events': 'none' })); return; }
  if (!mode) { if (tool === 'conn' && board) { const p = pt(ev), t = targetAt(p); drawOverlay(t ? s('g', null, targetMarks(t, sideAt(t, p))) : null); } else hoverAt(ev); return; }
  edgeScroll(ev);
  const p = pt(ev), k = 1 / cam.z;
  if (mode.k === 'pan') { cam.x = mode.cx + ev.clientX - mode.sx; cam.y = mode.cy + ev.clientY - mode.sy; drawSoon(); }
  else if (mode.k === 'vhandle') {
    // Dragging while placing a node pulls out its handles; Alt pulls only the outgoing one.
    const n = mode.n; if (Math.hypot(ev.clientX - mode.sx, ev.clientY - mode.sy) < 3 && n.ox == null) return;
    n.ox = Math.round(p.x * 100) / 100; n.oy = Math.round(p.y * 100) / 100;
    if (ev.altKey) delete n.s; else { n.ix = Math.round((2 * n.x - p.x) * 100) / 100; n.iy = Math.round((2 * n.y - p.y) * 100) / 100; n.s = true; }
    drawDraft();
  } else if (mode.k === 'vnode') {
    let dx = p.x - mode.p.x, dy = p.y - mode.p.y; if (!mode.moved && Math.hypot(dx, dy) * cam.z < 2) return; mode.moved = true;
    if (ev.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
    const paths = clone(mode.start);
    for (const key of vedit.nodes) { const [si, i] = key.split(':').map(Number), n = paths[si] && paths[si].nodes[i]; if (n) V.moveNode(n, dx, dy); }
    mode.e.paths = paths; draw(); drawOverlay();
  } else if (mode.k === 'vhand') {
    const n = mode.e.paths[mode.si].nodes[mode.i]; V.dragHandle(n, mode.which, p.x - mode.e.x, p.y - mode.e.y, ev.altKey); draw(); drawOverlay();
  }
  else if (mode.k === 'drag') {
    let dx = p.x - mode.p.x, dy = p.y - mode.p.y, guides = [], gaps = []; if (!mode.moved && Math.hypot(dx, dy) * cam.z < 3) return; mode.moved = true;
    if (ev.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
    if (mode.box0 && !ev.ctrlKey && !ev.metaKey) { const r = snapMove({ x: mode.box0.x + dx, y: mode.box0.y + dy, w: mode.box0.w, h: mode.box0.h }, mode.others, 6 / cam.z); dx += r.dx; dy += r.dy; guides = r.guides; gaps = r.gaps; }
    for (const o of mode.start) { const e = E(o.id); if (e.type === 'conn') { e.ax = o.ax + dx; e.ay = o.ay + dy; e.bx = o.bx + dx; e.by = o.by + dy; } else { e.x = Math.round(o.x + dx); e.y = Math.round(o.y + dy); } }
    draw(); drawOverlay(s('g', null, guideMarks(guides), gapMarks(gaps)));
  } else if (mode.k === 'adjh') {
    // Adjust handle: the pointer in the shape's own unturned box sets its adjust values.
    const e = mode.e, def = PG.presetDef(e.preset); if (!def) return;
    let lx = p.x, ly = p.y;
    if (e.rot) { const a = -e.rot * Math.PI / 180, cx = e.x + e.w / 2, cy = e.y + e.h / 2, dx = p.x - cx, dy = p.y - cy; lx = cx + dx * Math.cos(a) - dy * Math.sin(a); ly = cy + dx * Math.sin(a) + dy * Math.cos(a); }
    const next = PG.dragHandle(def, e.w, e.h, e.adj || {}, mode.i, lx - e.x, ly - e.y), dflt = PG.defaultAdj(def);
    for (const k of Object.keys(next)) if (next[k] === dflt[k]) delete next[k];
    if (Object.keys(next).length) e.adj = next; else delete e.adj;
    draw(); drawOverlay();
  } else if (mode.k === 'resize' && mode.crop) {
    const { e, o, hd } = mode, r = G.resizeBox(o, hd, p.x - mode.p.x, p.y - mode.p.y, 10, ev.shiftKey ? o.w / o.h : undefined);
    PIC.setWindow(e, r, mode.crop); draw(); drawOverlay();
  } else if (mode.k === 'cpan') {
    if (mode.c0) mode.e.crop = [...mode.c0]; else delete mode.e.crop;
    PIC.panCrop(mode.e, p.x - mode.p.x, p.y - mode.p.y, mode.full); draw(); drawOverlay();
  } else if (mode.k === 'resize') {
    // Pictures and stickers keep their shape from the corners; Shift does the same for anything else.
    const { e, o, hd } = mode, ratio = o.type === 'image' || o.type === 'sticker' || ev.shiftKey ? o.w / o.h : undefined;
    const r = G.resizeBox(o, hd, p.x - mode.p.x, p.y - mode.p.y, 30, ratio), guides = [];
    if (!o.rot && !(ratio && hd.length === 2) && !ev.ctrlKey && !ev.metaKey) {
      const thr = 6 / cam.z, west = hd.includes('w'), north = hd.includes('n');
      if (west || hd.includes('e')) { const sx = snapPoint(west ? r.x : r.x + r.w, 'x', mode.others, thr, [r.y, r.y + r.h]), w = sx && (west ? r.x + r.w - sx.v : sx.v - r.x); if (sx && w >= 30) { if (west) r.x = sx.v; r.w = w; guides.push(sx.guide); } }
      if (north || hd.includes('s')) { const sy = snapPoint(north ? r.y : r.y + r.h, 'y', mode.others, thr, [r.x, r.x + r.w]), ht = sy && (north ? r.y + r.h - sy.v : sy.v - r.y); if (sy && ht >= 30) { if (north) r.y = sy.v; r.h = ht; guides.push(sy.guide); } }
    }
    Object.assign(e, { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) }); fitText(e); draw(); drawOverlay(guideMarks(guides));
  } else if (mode.k === 'gscale') {
    const len2 = mode.vx * mode.vx + mode.vy * mode.vy || 1, f = Math.min(20, Math.max(0.1, ((p.x - mode.ax) * mode.vx + (p.y - mode.ay) * mode.vy) / len2));
    for (const o of mode.start) Object.assign(E(o.id), G.scaleEl(o, mode.ax, mode.ay, f));
    draw();
  } else if (mode.k === 'grotate') {
    const raw = (Math.atan2(p.y - mode.c.y, p.x - mode.c.x) - mode.a0) * 180 / Math.PI;
    mode.ang = G.snapAngle(mode.base + raw, ev.shiftKey) - mode.base;
    for (const o of mode.start) { const e = E(o.id); delete e.rot; Object.assign(e, G.rotateEl(o, mode.c.x, mode.c.y, mode.ang)); }
    draw();
  } else if (mode.k === 'connEnd') {
    // The end attaches live as it passes over a piece, so the line shows where it will land.
    const e = mode.e, n = mode.end, other = n === 'a' ? e.b : e.a, tgt = targetAt(p, other), sd = sideAt(tgt, p);
    e[n] = tgt; e[n + 'x'] = Math.round(p.x); e[n + 'y'] = Math.round(p.y); if (sd) e[n + 's'] = sd; else delete e[n + 's'];
    draw(); drawOverlay(s('g', null, targetMarks(tgt, sd)));
  } else if (mode.k === 'marquee') {
    const x = Math.min(p.x, mode.p.x), y = Math.min(p.y, mode.p.y), w = Math.abs(p.x - mode.p.x), ht = Math.abs(p.y - mode.p.y);
    sel = new Set(mode.keep); for (const e of all()) { const b = bbox(e); if (b.x < x + w && b.x + b.w > x && b.y < y + ht && b.y + b.h > y) sel.add(e.id); }
    drawOverlay(s('rect', { x, y, width: w, height: ht, fill: C.accent, 'fill-opacity': 0.08, stroke: C.accent, 'stroke-width': k, 'pointer-events': 'none' }));
  } else if (mode.k === 'pen') {
    const l = mode.pts[mode.pts.length - 1]; if (Math.hypot(p.x - l[0], p.y - l[1]) * cam.z > 2) mode.pts.push([p.x, p.y, ...pressure(ev)]);
    const hl = penMode === 'hl', sw = penW();
    if (shaped(penMode)) { drawOverlay(s('path', { d: outlineD(brushOutline(mode.pts, sw, penMode, false)), fill: penColor || C.ink, opacity: penMode === 'pencil' ? 0.9 : null, 'pointer-events': 'none' })); return; }
    drawOverlay(s('path', { d: 'M' + mode.pts.map(q => q[0] + ' ' + q[1]).join('L'), fill: 'none', stroke: penColor || (hl ? HL_COLORS[0] : C.ink), 'stroke-opacity': hl ? 0.4 : null, 'stroke-width': sw, 'stroke-linecap': hl ? 'butt' : 'round', 'stroke-linejoin': 'round', 'pointer-events': 'none' }));
  } else if (mode.k === 'colsz') {
    const e = mode.e, r = (e.rot || 0) * Math.PI / 180, along = (p.x - mode.p.x) * Math.cos(r) + (p.y - mode.p.y) * Math.sin(r);
    e.colw = resizeCols(mode.fr, mode.i, along / e.w).map(v => Math.round(v * 1000) / 1000); fitText(e); draw();
  } else if (mode.k === 'grad') {
    const e = mode.e, [fx, fy] = boxFrac(e, p);
    if (mode.lk === 'fill') { const list = [...PT.fillLayers(e)]; list[mode.li] = PT.moveHandle(list[mode.li], mode.which, fx, fy); e.fills = list; }
    else { const list = PT.strokeLayers(e).map(l => ({ ...l })); list[mode.li].paint = PT.moveHandle(list[mode.li].paint, mode.which, fx, fy); e.strokes = list; }
    draw(); drawOverlay();
  } else if (mode.k === 'erase') {
    eraseAt(ev);
  } else if (mode.k === 'conn') {
    if (Math.hypot(ev.clientX - mode.sx, ev.clientY - mode.sy) > 4) mode.moved = true;
    if (mode.moved) drawOverlay(connPreview(mode, p).g);
  } else if (mode.k === 'create') {
    drawOverlay(s('rect', { x: Math.min(p.x, mode.p.x), y: Math.min(p.y, mode.p.y), width: Math.abs(p.x - mode.p.x), height: Math.abs(p.y - mode.p.y), fill: 'none', stroke: C.accent, 'stroke-width': 1.5 * k, 'pointer-events': 'none' }));
  }
}
function onUp(ev) {
  if (!mode) return; const m = mode, p = pt(ev); mode = null;
  if (m.k === 'vhandle') { drawDraft(); return; }
  if (m.k === 'vnode' || m.k === 'vhand') { if (m.k === 'vhand' || m.moved) { fitPath(m.e); commit(); } else drawOverlay(); return; }
  if (m.k === 'drag') { if (m.dup) commit(); else if (m.moved) commitIds(m.start.map(e => e.id)); else if (m.had && sel.size > 1) { sel = new Set(E(m.id) && E(m.id).boolIn ? withKids(m.id) : group(m.id)); refresh(); } else if (sel.size === 1 && emptyPh(E(m.id))) phClick(E(m.id)); else drawOverlay(); }
  else if (m.k === 'resize' || m.k === 'grotate' || m.k === 'gscale' || m.k === 'cpan' || m.k === 'adjh') commit();
  else if (m.k === 'connEnd') commit();
  else if (m.k === 'marquee') refresh();
  else if (m.k === 'grad') commit();
  else if (m.k === 'erase') { eraseVectors(m.trail || [], ev.altKey); commit(); }
  else if (m.k === 'colsz') commit();
  else if (m.k === 'pen') {
    if (m.pts.length > 1) {
      const x = Math.min(...m.pts.map(q => q[0])), y = Math.min(...m.pts.map(q => q[1]));
      const e = { id: uid('e'), type: 'pen', z: topZ() + 1, x: Math.round(x), y: Math.round(y), w: Math.round(Math.max(...m.pts.map(q => q[0])) - x), h: Math.round(Math.max(...m.pts.map(q => q[1])) - y), pts: m.pts.map(q => [Math.round((q[0] - x) * 10) / 10, Math.round((q[1] - y) * 10) / 10, ...q.slice(2)]) };
      if (penMode === 'hl') { e.hl = true; e.stroke = penColor || HL_COLORS[0]; if (penWidth) e.sw = penWidth; } else { if (penColor) e.stroke = penColor; if (penWidth) e.sw = penWidth; if (penMode !== 'pen') e.brush = penMode; }
      board.els[e.id] = e;
    }
    commit();
  } else if (m.k === 'conn') {
    if (m.quick && !m.moved) { quickAdd(E(m.a), m.as); return; }
    const { b, bs } = connPreview(m, p);
    if (m.moved && (b || Math.hypot(p.x - m.p.x, p.y - m.p.y) > 12) && b !== m.a) { const e = addConn(m, p, b, bs); sel = new Set([e.id]); }
    if (!m.quick) tool = 'select'; commit();
  } else if (m.k === 'create') {
    let w = Math.abs(p.x - m.p.x), ht = Math.abs(p.y - m.p.y); if (ev.shiftKey) w = ht = Math.max(w, ht);
    makeBox(tool === 'stamp' ? stamp.type : tool, Math.min(p.x, m.p.x), Math.min(p.y, m.p.y), w, ht, ev.altKey);
  }
}
function onKey(ev) {
  if (show) { showKey(ev); return; }
  if (menuKeys(ev)) return;
  if (ev.key === 'Escape' && $('#tpl')) { $('#tpl').remove(); return; }
  if (!board) return; const tgt = ev.target, typing = tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.tagName === 'SELECT' || tgt.isContentEditable);
  if (typing || (tgt && tgt.tagName === 'BUTTON' && (ev.key === 'Enter' || ev.key === ' ') && !(ev.ctrlKey || ev.metaKey))) return;
  const mod = ev.ctrlKey || ev.metaKey, k = ev.key.toLowerCase(); let done = true;
  if (vdraft) {
    if (k === 'escape' || k === 'enter') { finishDraft(false); ev.preventDefault(); return; }
    if (k === 'backspace' || k === 'delete') { vdraft.nodes.pop(); if (!vdraft.nodes.length) vdraft = null; drawDraft(); ev.preventDefault(); return; }
  }
  if (cropId && (k === 'escape' || k === 'enter')) { endCrop(); ev.preventDefault(); return; }
  if (vedit && !mod) {
    if (k === 'escape' || k === 'enter') { exitVedit(); ev.preventDefault(); return; }
    if (k === 'backspace' || k === 'delete') { removeVNodes(); ev.preventDefault(); return; }
  }
  if (adj && adj.kind !== 'offset' && (k === 'enter' || k === 'escape')) { ev.preventDefault(); adjFinish(k === 'enter'); return; }
  if (kanban && !mod && !['delete', 'backspace', 'escape', '?'].includes(k)) return;
  if (k === ' ') { spaceDown = true; cv.classList.add('pan'); }
  else if (mod && k === 'z') ev.shiftKey ? travel('redo') : travel('undo');
  else if (mod && k === 'y') travel('redo');
  else if (mod && k === 'e') flattenSel();
  else if (mod && ev.altKey && ['u', 's', 'i', 'x'].includes(k)) boolOp({ u: 'union', s: 'subtract', i: 'intersect', x: 'exclude' }[k]);
  else if (mod && ev.altKey && k === 'm') selEls().some(e => e.mask || e.masking) ? releaseMask() : useAsMask();
  else if (mod && ev.shiftKey && k === 'o') outlineStroke();
  else if (mod && k === 'enter') { const f = selEls().find(e => e.slide); present(f ? SL.slidesOf(board.els).indexOf(f) : 0); }
  else if (mod && k === 'd') { copySel(); const c = clip; pasteEls(c, 24); }
  else if (mod && k === 'c') copySel();
  else if (mod && k === 'v') done = false; // handled by the paste event, so pictures and text can come in too
  else if (mod && k === 'a') { sel = new Set(Object.keys(board.els)); refresh(); }
  else if (mod && k === 'g') arrange(ev.shiftKey ? 'ungroup' : 'group');
  else if (mod && ev.shiftKey && k === 'l') arrange(selEls().some(e => !e.locked) ? 'lock' : 'unlock');
  else if (mod) done = false;
  else if (k === 'delete' || k === 'backspace') removeSel();
  else if (k === 'escape') {
    closeMenu(); const hp = $('#help'), roots = panelEls(), up = roots.length === 1 && roots[0].boolIn ? E(roots[0].boolIn) : null;
    if (hp) hp.remove(); else if (kanban) kanban = false;
    // Esc on a piece inside a live boolean selects the boolean around it, as in Figma.
    else if (up) sel = new Set(up.boolIn ? withKids(up.id) : group(up.id));
    else { sel.clear(); tool = 'select'; }
    refresh();
  }
  else if (k.startsWith('arrow')) {
    const d = ev.shiftKey ? 10 : 1, dx = k === 'arrowleft' ? -d : k === 'arrowright' ? d : 0, dy = k === 'arrowup' ? -d : k === 'arrowdown' ? d : 0;
    for (const e of selEls()) if (!e.locked) { if (e.type === 'conn') { e.ax += dx; e.bx += dx; e.ay += dy; e.by += dy; } else { e.x += dx; e.y += dy; } } commit();
  }
  else if (k === '?') toggleHelp();
  else if (k === 'tab' && sel.size === 1 && E([...sel][0]).type === 'sticky') nextSticky([...sel][0]);
  else if (k === 'm') { miniOn = !miniOn; draw(); }
  else if (k === ']') arrange('front'); else if (k === '[') arrange('back');
  else if (k === '=' || k === '+') zoomAt(1.2); else if (k === '-') zoomAt(1 / 1.2); else if (k === '1' && ev.shiftKey || k === '!') fit();
  else if (k === 'enter' && liveOne()) { sel = new Set(LB.operandsOf(board.els, liveOne().id).flatMap(o => withKids(o.id))); refresh(); }
  else if (k === 'enter' && panelEls().length === 1 && panelEls()[0].type === 'path' && !panelEls()[0].live) enterVedit(panelEls()[0].id);
  else if (k === 'enter' && sel.size === 1) startEdit([...sel][0]);
  else { const t = { v: 'select', s: 'sticky', t: 'text', r: 'rect', o: 'ellipse', d: 'diamond', c: 'card', f: 'frame', l: 'conn', p: 'pen', k: 'stamp', u: 'shape', g: 'table', j: 'chart', h: 'pen', e: 'pen', b: 'vpen' }[k];
    if (t) endDraft();
    if (k === 'p') penMode = 'pen'; if (k === 'h') penMode = 'hl'; if (k === 'e') penMode = 'erase'; if (k === 'h' || k === 'e' || k === 'p') penWidth = 0;
    if (k === 'i') $('#img-file').click(); else if (t) { tool = t; refresh(); } else done = false; }
  if (done) ev.preventDefault();
}

/* ---------- Board chrome ---------- */
const ICON = { path: 'M10 2.5l5 5.5-2.7 7H7.7L5 8zM10 2.5v6.5M10 10.5a1.2 1.2 0 1 0 .01 0', vpen: 'M10 2.5l5 5.5-2.7 7H7.7L5 8zM10 2.5v6.5M10 10.5a1.2 1.2 0 1 0 .01 0', select: 'M5 3l10 6-4.5 1.2L13 15l-2 1-2.4-4.7L5 14z', sticky: 'M4 4h12v8l-4 4H4zM16 12h-4v4', text: 'M5 5h10M10 5v11', rect: 'M4 6h12v8H4z', ellipse: 'M3 10a7 5 0 1 0 14 0a7 5 0 1 0-14 0',
  diamond: 'M10 3l7 7-7 7-7-7z', card: 'M3 5h14v10H3zM6 8.5h7M6 11.5h3', frame: 'M6 3v14M14 3v14M3 6h14M3 14h14', conn: 'M4 15L15 5M10 5h5v5', pen: 'M4 16l1-4 8-8 3 3-8 8z', stamp: 'M10 2.5l2.3 4.8 5.2.7-3.8 3.6.9 5.2L10 14.3l-4.6 2.5.9-5.2L2.5 8l5.2-.7z', table: 'M3 4h14v12H3zM3 8h14M3 12h14M8 4v12M13 4v12', chart: 'M4.5 15.5V10M8.5 15.5V6M12.5 15.5V8.5M16.5 15.5V4.5M3 15.5h14', image: 'M3 4h14v12H3zM3 13.5l4-4 3 3 2.5-2 4.5 4M13.2 7.6a.6.6 0 1 0 .01 0' };
const TOOLS = [['select', 'Select (V)'], ['sticky', 'Sticky note (S)'], ['text', 'Text (T)'], ['rect', 'Rectangle (R)'], ['ellipse', 'Ellipse (O)'], ['diamond', 'Diamond (D)'], ['shape', 'Shapes (U)'], ['card', 'Task card (C)'], ['table', 'Table (G)'], ['chart', 'Chart (J)'], ['frame', 'Frame (F)'], ['conn', 'Connector (L)'], ['pen', 'Draw (P)'], ['vpen', 'Pen: curves and shapes (B)'], ['stamp', 'Stickers and tape (K)'], ['image', 'Picture (I)']];
const BAR = ['select', '|', 'sticky', 'text', 'rect', 'ellipse', 'diamond', 'shape', 'conn', 'pen', 'vpen', '|', 'card', 'table', 'chart', 'frame', 'stamp', 'image'];
async function openBoard(id) {
  const m = meta(id); if (!m) return;
  closeMenu(); $('#app').replaceChildren(h('div', { class: 'loading' }, 'Opening ' + m.name));
  const doc = migrateBoard(await Store.get('b_' + id), uid);
  board = { id, pages: doc.pages, page: doc.pages[0].id, els: doc.pages[0].els }; hists.clear(); pagesSig = ''; for (const pg of board.pages) for (const x of Object.values(pg.els)) if (x.type === 'sticky' && !x.size && !x.fit) fitText(x);
  hist = new History(); hist.reset(board.els); hists.set(board.page, hist); LB.trust(board.els, liveSeen); mids.clear(); sways.clear(); kanban = false; miniState = null; outlineSig = ''; outlineKey = '';
  sel = new Set(); tool = 'select'; editing = null; edFor = null; taskFilter = 'all'; rightTab = 'design';
  const proj = index.projects.find(p => p.id === m.projectId), [sc, st] = statParts(), label = Object.fromEntries(TOOLS);
  const tab = (k, text) => h('button', { role: 'tab', id: 'tab-' + k, 'aria-controls': 'p' + k, onclick: () => { rightTab = k; edFor = null; renderRight(); } }, text);
  $('#app').replaceChildren(h('div', { class: 'board' },
    h('aside', { class: 'outline', 'aria-label': 'Outline' },
      h('div', { class: 'o-head' },
        h('button', { class: 'back', onclick: () => { if (editing) endEdit(); saveNow(); renderHome(); } }, logo(), icon('M12.5 4.5L7 10l5.5 5.5', 10, { 'stroke-width': 2 }), 'All boards'),
        h('input', { class: 'b-name', id: 'board-name', type: 'text', value: m.name, 'aria-label': 'Board name', onkeydown: e => { if (e.key === 'Enter') e.target.blur(); }, onchange: e => { m.name = e.target.value.trim() || m.name; e.target.value = m.name; saveIndex(); } }),
        h('div', { class: 'b-meta' }, proj ? h('span', null, L.pathOf(index, m)) : null, h('span', { class: 'stat', id: 'stat' }, h('span', { class: 'dot ' + sc }), st))),
      h('div', { class: 'o-label o-split' }, 'Pages', h('button', { class: 'icon-btn sm', title: 'Add page', 'aria-label': 'Add page', onclick: addPage }, icon('M10 4v12M4 10h12', 12))),
      h('div', { class: 'pages', id: 'plist' }),
      h('div', { class: 'o-label' }, 'Outline'),
      h('div', { class: 'o-list', id: 'olist' }),
      h('button', { class: 'o-foot', onclick: toggleHelp }, 'Keyboard shortcuts', h('kbd', null, '?'))),
    h('div', { class: 'stage' },
      h('nav', { class: 'toolbar', 'aria-label': 'Tools' }, BAR.map(t => t === '|' ? h('span', { class: 'tsep', 'aria-hidden': 'true' })
        : h('button', { 'data-tool': t, title: label[t], 'aria-label': label[t], 'aria-pressed': 'false', onclick: () => { if (t === 'image') $('#img-file').click(); else { endDraft(); tool = t; refresh(); } } }, trayIcon(t)))),
      h('div', { class: 'fly', id: 'fly', hidden: true }),
      h('div', { class: 'mini', id: 'mini', title: 'Click or drag to move around the board (M hides this)' }),
      h('div', { class: 'kan', id: 'kan', hidden: true }),
      h('input', { type: 'file', id: 'img-file', accept: 'image/*', multiple: true, hidden: true, 'aria-label': 'Add pictures', onchange: async e => { const slot = imgSlot; imgSlot = null; e.target.multiple = true; for (const f of [...e.target.files]) await addImage(f, null, slot); e.target.value = ''; } }),
      h('div', { id: 'red', contenteditable: 'true', role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Edit text', spellcheck: 'true', onblur: endEdit, oninput: richInput, onkeydown: richKey,
        onpaste: ev => { ev.preventDefault(); ev.stopPropagation(); RE.pastePlain(document, ev.clipboardData ? ev.clipboardData.getData('text/plain') : ''); } }),
      h('textarea', { id: 'ed', 'aria-label': 'Edit text', onblur: endEdit,
        oninput: ev => { const e = editing && E(editing); if (e && (e.type === 'sticky' || e.ph)) { e.text = ev.target.value; const h0 = e.h; fitText(e); placeEditor(); if (e.h !== h0) draw(); } },
        onkeydown: e => { e.stopPropagation(); if (e.key === 'Tab' && editing && E(editing).type === 'table') { e.preventDefault(); const id = editing, at = editCell, next = stepCell(E(id), at[0], at[1], e.shiftKey); e.target.blur(); if (next) { sel = new Set([id]); startEdit(id, next); } return; }
          if (e.key === 'Enter' && !e.shiftKey && editing && E(editing).type === 'table') { e.preventDefault(); e.target.blur(); return; }
          if (e.key === 'Tab' && editing && E(editing).type === 'sticky') { e.preventDefault(); const id = editing; e.target.blur(); nextSticky(id); return; } const one = editing && ['card', 'frame', 'conn'].includes(E(editing).type); if (e.key === 'Escape' || (e.key === 'Enter' && (one || e.ctrlKey || e.metaKey))) { e.preventDefault(); e.target.blur(); } } })),
    h('aside', { class: 'props', 'aria-label': 'Properties' },
      h('div', { class: 'p-head' },
        h('button', { class: 'icon-btn', id: 'undo', title: 'Undo (Ctrl+Z)', 'aria-label': 'Undo', onclick: () => travel('undo') }, icon('M7.5 5L4 8.5 7.5 12M4 8.5h8.5a3.5 3.5 0 0 1 0 7H10', 16)),
        h('button', { class: 'icon-btn', id: 'redo', title: 'Redo (Ctrl+Shift+Z)', 'aria-label': 'Redo', onclick: () => travel('redo') }, icon('M12.5 5L16 8.5 12.5 12M16 8.5H7.5a3.5 3.5 0 0 0 0 7H10', 16)),
        h('button', { class: 'btn zoom', id: 'zoomv', title: 'Zoom', 'aria-label': 'View options', 'aria-haspopup': 'menu', onclick: e => popup(e.currentTarget, [
          ['Zoom in', () => zoomAt(1.2)], ['Zoom out', () => zoomAt(1 / 1.2)], ['Zoom to 100%', () => zoomAt(1 / cam.z)], ['Fit everything', () => fit()], '-',
          [miniOn ? 'Hide minimap' : 'Show minimap', () => { miniOn = !miniOn; draw(); }], '-',
          ...THEMES.map(([k, label]) => [(k === 'auto' ? 'Match system theme' : label + ' theme'), () => setTheme(k), themePref() === k ? 'cur' : ''])]) }, h('span', { id: 'zoomt' }, '100%'), icon('M6 8l4 4 4-4', 10, { 'stroke-width': 2 })),
        h('span', { class: 'grow' }),
        h('button', { class: 'icon-btn', id: 'present-btn', title: 'Present (Ctrl+Enter)', 'aria-label': 'Present', onclick: e => presentMenu(e.currentTarget) }, icon('M7 4.5l8.5 5.5L7 15.5z', 16)),
        h('button', { class: 'icon-btn', id: 'kanban-toggle', 'aria-pressed': 'false', 'aria-label': 'Kanban', title: 'Kanban: task cards as columns by status', onclick: () => { if (editing) endEdit(); kanban = !kanban; refresh(); } }, icon('M3.5 4h3.5v12H3.5zM8.25 4h3.5v8h-3.5zM13 4h3.5v10H13z', 16)),
        h('button', { class: 'btn primary', 'aria-haspopup': 'menu', onclick: e => popup(e.currentTarget, [{ head: 'Export' }, ['PNG image', () => exportAs('png'), '', MI.image], ['SVG vector', () => exportAs('svg'), '', MI.code], ['PDF, this page', () => exportPdf(false), '', MI.pdf], board.pages.length > 1 ? ['PDF, all pages', () => exportPdf(true), '', MI.pdf] : null, deckOf('all').length ? ['PDF, slides', () => exportSlides(), '', MI.pdf] : null, SL.slidesOf(board.els).length ? ['PowerPoint, this page\'s slides', () => exportPptx(), '', MI.pdf] : null, '-', ['Save board as template', () => { saveNow(); saveTemplate(meta(board.id).name, JSON.parse(JSON.stringify(board.pages))); }]]) }, 'Export')),
      h('div', { class: 'tabs', role: 'tablist' }, tab('design', 'Design'), tab('tasks', 'Tasks'), tab('slides', 'Slides')),
      h('div', { class: 'p-body', id: 'pdesign', role: 'tabpanel' }),
      h('div', { class: 'p-body', id: 'ptasks', role: 'tabpanel', hidden: true }, h('div', { id: 'thead' }), h('div', { id: 'ted' }), h('div', { class: 'tlist', id: 'tlist' })),
      h('div', { class: 'p-body', id: 'pslides', role: 'tabpanel', hidden: true }))));
  // Rebuild the properties once focus leaves them, so values typed into a field are not wiped mid-edit.
  $('#pdesign').addEventListener('focusout', () => setTimeout(() => { const p = $('#pdesign'); if (board && p && !p.contains(document.activeElement)) renderProps(); }, 0));
  cv = s('svg', { id: 'cv', role: 'application', 'aria-label': 'Board canvas' },
    s('defs', null, s('filter', { id: 'sh', x: '-20%', y: '-20%', width: '140%', height: '160%' },
      // A tight contact shadow and a soft ambient one, like paper lifted a little off the board.
      s('feDropShadow', { dx: 0, dy: 0.5, stdDeviation: 0.6, style: 'flood-color:var(--sh-c);flood-opacity:var(--sh-a1)' }),
      s('feDropShadow', { dx: 0, dy: 3, stdDeviation: 4, style: 'flood-color:var(--sh-c);flood-opacity:var(--sh-a2)' }))));
  vp = s('g'); ov = s('g'); cv.append(vp, ov); $('.stage').prepend(cv);
  // The far view draws under the SVG, and carries the dot grid.
  lodCv = document.createElement('canvas'); lodCv.id = 'lod'; lodCv.setAttribute('aria-hidden', 'true'); $('.stage').prepend(lodCv);
  mini = s('svg', { width: 144, height: 96, 'aria-hidden': 'true' }); $('#mini').append(mini);
  mini.addEventListener('pointerdown', ev => { miniDrag = true; mini.setPointerCapture(ev.pointerId); miniGo(ev); });
  mini.addEventListener('pointermove', ev => { if (miniDrag) miniGo(ev); });
  const miniEnd = () => { miniDrag = false; draw(); }; mini.addEventListener('pointerup', miniEnd); mini.addEventListener('pointercancel', miniEnd);
  cv.addEventListener('contextmenu', openMenu);
  cv.addEventListener('dragover', ev => ev.preventDefault());
  cv.addEventListener('drop', async ev => { ev.preventDefault(); const p = pt(ev); let i = 0; for (const f of [...ev.dataTransfer.files]) { if (/\.pptx$/i.test(f.name)) { await importPptx(f); continue; } await addImage(f, { x: p.x + i * 24, y: p.y + i++ * 24 }); } });
  cv.addEventListener('pointerdown', onDown); cv.addEventListener('mousedown', ev => ev.preventDefault()); cv.addEventListener('pointermove', onMove); cv.addEventListener('pointerleave', () => { if (hoverId) { hoverId = null; drawOverlay(); } }); cv.addEventListener('pointerup', onUp); cv.addEventListener('pointercancel', onUp);
  cv.addEventListener('wheel', ev => { ev.preventDefault(); const p = pt(ev); if (ev.ctrlKey || ev.metaKey) zoomAt(Math.exp(-ev.deltaY * 0.01), p.sx, p.sy, true); else { cam.x -= ev.deltaX; cam.y -= ev.deltaY; drawSoon(); } }, { passive: false });
  fit(); refresh(); loadImages();
}
/* ---------- Tasks across pages ---------- */
const pageOf = id => board.pages.find(p => p.els[id]);
/** Task cards in the chosen scope: this page, or every page of the board. */
function scopeCards() {
  const els = taskScope === 'all' && board.pages.length > 1 ? board.pages.flatMap(p => Object.values(p.els)) : all();
  return els.filter(e => e.type === 'card');
}
/** Go to a card, switching pages if it lives on another one. */
function gotoCard(c) {
  const pg = pageOf(c.id); if (pg && pg.id !== board.page) switchPage(pg.id);
  sel = new Set([c.id]); centerOn(c); refresh();
}
/** Save a change to a card that may sit on another page (outside this page's undo history). */
function cardChanged(c) { if (board.els[c.id]) commit(); else { saveNow(); refresh(); } }
function scopeSwitch() {
  if (board.pages.length < 2) return null;
  return h('div', { class: 'seg', role: 'group', 'aria-label': 'Which tasks' }, [['page', 'This page'], ['all', 'All pages']].map(([k, label]) => h('button', { 'aria-pressed': String(taskScope === k), onclick: () => { taskScope = k; refresh(); } }, label)));
}

/* ---------- Pages ---------- */
function switchPage(id) {
  if (!board || id === board.page) return; if (editing) endEdit();
  const pg = board.pages.find(p => p.id === id); if (!pg) return;
  board.page = id; board.els = pg.els; LB.trust(board.els, liveSeen);
  if (!hists.has(id)) { const h2 = new History(); h2.reset(pg.els); hists.set(id, h2); }
  hist = hists.get(id); sel = new Set(); edFor = null; outlineSig = ''; mids.clear(); sways.clear(); fit(); refresh(); loadImages();
}
function addPage() {
  const pg = { id: uid('pg'), name: nextPageName(board.pages), els: {} };
  board.pages.push(pg); saveNow(); switchPage(pg.id); renamePage(pg.id);
}
function renamePage(id) {
  const row = document.querySelector(`#plist [data-page="${id}"]`), pg = board.pages.find(p => p.id === id); if (!row || !pg) return;
  const done = save => { if (save) { pg.name = inp.value.trim() || pg.name; saveNow(); } renderPages(true); };
  const inp = h('input', { class: 'inp', type: 'text', value: pg.name, 'aria-label': 'Page name', onkeydown: e => { e.stopPropagation(); if (e.key === 'Enter') inp.blur(); if (e.key === 'Escape') { inp.dataset.cancel = '1'; inp.blur(); } }, onblur: () => done(!inp.dataset.cancel) });
  row.replaceWith(inp); inp.focus(); inp.select();
}
function pageMenu(id, x, y) {
  const pg = board.pages.find(p => p.id === id), i = board.pages.indexOf(pg);
  popupAt(x, y, [
    ['Rename', () => renamePage(id)],
    ['Duplicate page', () => { const c = clonePages([pg], uid)[0]; c.name = pg.name + ' copy'; board.pages.splice(i + 1, 0, c); saveNow(); switchPage(c.id); }],
    i > 0 ? ['Move up', () => { board.pages.splice(i, 1); board.pages.splice(i - 1, 0, pg); saveNow(); renderPages(true); }] : null,
    i < board.pages.length - 1 ? ['Move down', () => { board.pages.splice(i, 1); board.pages.splice(i + 1, 0, pg); saveNow(); renderPages(true); }] : null,
    board.pages.length > 1 ? '-' : null,
    board.pages.length > 1 ? ['Delete page', () => {
      const bid = board.id;
      undoToast(`Deleted page "${pg.name}".`, () => { if (!board || board.id !== bid) return; board.pages.splice(Math.min(i, board.pages.length), 0, pg); saveNow(); switchPage(pg.id); });
      board.pages.splice(i, 1); hists.delete(id); if (board.page === id) { board.page = ''; switchPage(board.pages[Math.max(0, i - 1)].id); } saveNow(); renderPages(true);
    }, 'danger'] : null]);
}
function undoToast(msg, fn) {
  const t = h('div', { class: 'toast', role: 'status' }, msg, h('button', { class: 'toast-act', onclick: () => { t.remove(); fn(); } }, 'Undo'));
  document.body.append(t); setTimeout(() => t.remove(), 7000);
}
let pagesSig = '';
function renderPages(force) {
  const el = $('#plist'); if (!el) return;
  const sig = board.pages.map(p => p.id + '~' + p.name).join('|') + '#' + board.page;
  if (!force && sig === pagesSig) return; pagesSig = sig;
  el.replaceChildren(...board.pages.map(p => h('button', { class: 'orow pg' + (p.id === board.page ? ' on' : ''), 'data-page': p.id, 'aria-current': p.id === board.page ? 'page' : null, title: 'Double-click to rename. Right-click for more.',
    onclick: () => switchPage(p.id), ondblclick: () => renamePage(p.id), oncontextmenu: e => { e.preventDefault(); pageMenu(p.id, e.clientX, e.clientY); } },
    h('span', { class: 'ol' }, p.name), Object.values(p.els).some(e => e.type === 'card') ? h('span', { class: 'num' }, String(Object.values(p.els).filter(e => e.type === 'card').length)) : null)));
}

/* ---------- Outline and properties ---------- */
function outlineIcon(e) {
  const chip = style => h('span', { class: 'oi', 'aria-hidden': 'true' }, h('span', { style }));
  const fill = paintFill(e.fill || '#ffffff', C.theme), edge = e.type === 'sticky' ? 'rgba(23,32,45,.2)' : outlineFor(e.fill, C.theme);
  if (e.type === 'sticky') return chip(`width:10px;height:10px;border-radius:2px;background:${fill};border:1px solid ${edge}`);
  if (e.type === 'rect') return chip(`width:10px;height:8px;border-radius:2px;background:${fill};border:1px solid ${edge}`);
  if (e.type === 'ellipse') return chip(`width:10px;height:8px;border-radius:50%;background:${fill};border:1px solid ${edge}`);
  if (e.type === 'diamond') return chip(`width:7px;height:7px;transform:rotate(45deg);background:${fill};border:1px solid ${edge}`);
  if (e.type === 'card') return chip(`width:4px;height:12px;border-radius:2px;background:${STATUS[e.status || 'todo'][1]}`);
  if (e.type === 'tape') return chip(`width:12px;height:5px;background:${e.fill || '#2f6fed'};opacity:.8`);
  if (e.type === 'sticker') return h('span', { class: 'oi', 'aria-hidden': 'true', style: 'color:' + (e.fill || '#f5c518') }, icon(STAR, 12, { fill: 'currentColor', stroke: 'none' }));
  // A vector shows a tiny copy of its own shape.
  if (e.type === 'path') { const vw = Math.max(1, e.vw || e.w), vh = Math.max(1, e.vh || e.h), pad = Math.max(vw, vh) * 0.08;
    return h('span', { class: 'oi', 'aria-hidden': 'true' }, s('svg', { width: 12, height: 12, viewBox: `${-pad} ${-pad} ${vw + pad * 2} ${vh + pad * 2}`, style: 'overflow:visible' },
      s('path', { d: V.pathD(e.paths || []), fill: e.fill && e.fill !== 'none' ? paintFill(e.fill, C.theme) : 'none', 'fill-rule': e.rule || null, stroke: e.stroke === 'none' ? 'none' : 'currentColor', 'stroke-width': 1.3, 'vector-effect': 'non-scaling-stroke' }))); }
  return h('span', { class: 'oi', 'aria-hidden': 'true' }, icon(ICON[{ conn: 'conn', pen: 'pen', image: 'image', frame: 'frame', table: 'table' }[e.type] || 'text'], 12, { 'stroke-width': 2 }));
}
let olRows = [], olVer = -1, olFor = null, olTheme = '', olWin = '';
/** One outline row button. */
function outlineRow(r) {
  const e = E(r.id);
  return h('button', { class: 'orow' + (r.depth ? ' sub' : '') + (r.kind === 'frame' ? ' fr' : '') + (r.kind === 'conn' ? ' dim' : '') + (e.boolIn ? ' op' : ''), 'data-id': r.id, title: r.label, style: r.depth > 1 ? `padding-left:${8 + r.depth * 20}px` : null,
    onclick: ev => { if (editing) endEdit(); if (ev.shiftKey) { const had = sel.has(r.id); group(r.id).forEach(i => had ? sel.delete(i) : sel.add(i)); } else sel = new Set(E(r.id).boolIn ? withKids(r.id) : group(r.id)); refresh(); },
    ondblclick: () => { const x = E(r.id); if (x) { if (x.type === 'frame') fit([x]); else centerOn(x); draw(); } } },
    outlineIcon(e), h('span', { class: 'ol' }, r.label), e.locked ? h('span', { class: 'olock', title: 'Locked' }, icon(LOCK, 12)) : null);
}
/** Past this many rows the outline only builds the rows in view (a 20,000-piece board would otherwise rebuild 20,000 buttons per edit). */
const OL_VIRTUAL = 400, OL_ROW = 30;
function renderOutline() {
  const el = $('#olist'); if (!el) return;
  if (olVer !== editVer || olFor !== board.els || olTheme !== C.theme) { olRows = outlineRows(all(), E); olVer = editVer; olFor = board.els; olTheme = C.theme; outlineSig = ''; }
  const rows = olRows, big = rows.length > OL_VIRTUAL;
  el.classList.toggle('virt', big);
  if (!big) {
    const sig = rows.map(r => { const e = E(r.id); return [r.id, r.depth, r.label, e.locked ? 1 : 0, e.fill || '', e.status || ''].join('~'); }).join('|') + C.theme;
    // Rebuild only when rows change, so a double-click on a row lands on the same element twice.
    if (sig !== outlineSig) { outlineSig = sig; olWin = ''; el.replaceChildren(...(rows.length ? rows.map(outlineRow) : [h('p', { class: 'o-empty' }, 'Nothing on this board yet.')])); }
  } else {
    if (!el.onscroll) el.onscroll = () => { if (el.classList.contains('virt')) renderOutline(); };
    const key = [...sel].join();
    if (key !== outlineKey) {
      // Bring the first selected row into view.
      const i = rows.findIndex(r => sel.has(r.id));
      if (i >= 0 && (i * OL_ROW < el.scrollTop || (i + 1) * OL_ROW > el.scrollTop + el.clientHeight)) el.scrollTop = Math.max(0, i * OL_ROW - el.clientHeight / 2);
    }
    const from = Math.max(0, Math.floor(el.scrollTop / OL_ROW) - 12), to = Math.min(rows.length, Math.ceil((el.scrollTop + el.clientHeight) / OL_ROW) + 12);
    const win = `${from}:${to}:${outlineSig === '' ? olVer : 'k'}`;
    if (win !== olWin || outlineSig === '') {
      olWin = win; outlineSig = 'virt';
      el.replaceChildren(h('div', { class: 'ol-pad', style: `height:${from * OL_ROW}px` }), ...rows.slice(from, to).map(outlineRow), h('div', { class: 'ol-pad', style: `height:${(rows.length - to) * OL_ROW}px` }));
    }
  }
  el.querySelectorAll('.orow').forEach(b => { const x = E(b.dataset.id), on = sel.has(b.dataset.id) && !(x && x.boolIn && sel.has(x.boolIn)); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
  const key = [...sel].join();
  if (key !== outlineKey) { outlineKey = key; if (!big) { const on = el.querySelector('.orow.on'); if (on) on.scrollIntoView({ block: 'nearest' }); } }
}
function renderRight() {
  const d = $('#pdesign'); if (!d) return;
  const n = all().filter(e => e.type === 'card').length;
  for (const k of ['design', 'tasks', 'slides']) $('#tab-' + k).setAttribute('aria-selected', String(rightTab === k));
  $('#tab-tasks').replaceChildren(...['Tasks', n ? h('span', { class: 'num' }, String(n)) : null].filter(Boolean));
  const ns = SL.slidesOf(board.els).length;
  $('#tab-slides').replaceChildren(...['Slides', ns ? h('span', { class: 'num' }, String(ns)) : null].filter(Boolean));
  d.hidden = rightTab !== 'design'; $('#ptasks').hidden = rightTab !== 'tasks'; $('#pslides').hidden = rightTab !== 'slides';
  if (rightTab === 'design') renderProps(); else if (rightTab === 'tasks') renderTasks(); else renderSlides();
}
/** Commit an edit made in a panel field without rebuilding the panel under the cursor. */
function holdCommit() { panelHold = true; try { commit(); } finally { panelHold = false; } }
function taskFields(cur, pre, save) {
  const id = n => pre + 'task-' + n;
  return [
    h('label', { class: 'f-label', for: id('title') }, 'Title'),
    h('input', { class: 'inp', type: 'text', id: id('title'), value: cur.text, oninput: e => { cur.text = e.target.value; draw(); }, onchange: save }),
    h('div', { class: 'grid2' },
      h('select', { class: 'sel', id: id('status'), 'aria-label': 'Status', value: cur.status, onchange: e => { cur.status = e.target.value; save(); } }, Object.entries(STATUS).map(([k, v]) => h('option', { value: k }, v[0]))),
      h('input', { class: 'inp', type: 'date', id: id('due'), 'aria-label': 'Due date', value: cur.due || '', onchange: e => { cur.due = e.target.value; save(); } })),
    h('label', { class: 'f-label', for: id('notes') }, 'Notes'),
    h('textarea', { class: 'inp', id: id('notes'), value: cur.notes || '', oninput: e => { cur.notes = e.target.value; }, onchange: save })];
}
const FILL_NAMES = ['Yellow', 'Peach', 'Green', 'Blue', 'Lilac', 'White', 'Gray'];
const HEADS = [['none', 'No end'], ['triangle', 'Triangle'], ['arrow', 'Arrow'], ['circle', 'Dot'], ['bar', 'Bar']];
const ALIGN = [['l', 'Align left edges', 'M3 3v14M6 6h10M6 13h6'], ['c', 'Align centers', 'M10 3v14M4 6h12M6.5 13h7'], ['r', 'Align right edges', 'M17 3v14M4 6h10M8 13h6'], ['dh', 'Space evenly across', 'M3 3v14M17 3v14M8 6v8M12 6v8'],
  ['t', 'Align top edges', 'M3 3h14M6 6v10M13 6v6'], ['m', 'Align middles', 'M3 10h14M6 4v12M13 6.5v7'], ['b', 'Align bottom edges', 'M3 17h14M6 4v10M13 8v6'], ['dv', 'Space evenly down', 'M3 3h14M3 17h14M6 8h8M6 12h8']];
function renderProps() {
  const el = $('#pdesign'); if (!el || rightTab !== 'design') return;
  if (panelHold) { fieldSync.forEach(f => { if (document.activeElement !== f.el) f.el.value = f.get(); }); return; }
  if (adj && adj.key !== selKey()) adjEnd(true);
  fieldSync = [];
  const list = panelEls(), free = list.filter(e => !e.locked), one = list.length === 1 ? list[0] : null;
  const of = types => free.filter(e => types.includes(e.type));
  const same = (els, key) => els.length && els.every(e => e[key] === els[0][key]) ? els[0][key] ?? '' : '';
  const sec = (title, ...kids) => h('section', { class: 'psec' }, title ? h('h3', null, title) : null, ...kids);
  const setAll = (els, key, val, field) => { els.forEach(e => { if (val === '' || val == null || val === false) delete e[key]; else e[key] = val; fitText(e); }); field ? holdCommit() : commit(); };
  const swatch = (c, on, fn, name, small) => h('button', { class: 'sw' + (small ? ' sm' : ''), style: 'background:' + (paintFill(c, C.theme) || c), title: name || c, 'aria-label': name || 'Color ' + c, 'aria-pressed': String(!!on), onclick: fn });
  // With slides on the page, color sections lead with the deck theme's colors; picking one links it to the theme.
  const deckTh = SL.slidesOf(board.els).length ? DK.pageTheme(board.els) : null;
  const themeSw = (els, key, before) => deckTh ? [h('div', { class: 'f-label' }, 'Theme colors'), h('div', { class: 'swatches tsw', role: 'group', 'aria-label': 'Theme colors, ' + deckTh.name },
    DK.SWATCH_SLOTS.map(slot => swatch(deckTh.colors[slot], els.every(e => e.tc && e.tc[key] === slot && DK.linked(e, key, deckTh)),
      () => { if (before) before(); els.forEach(e => { DK.linkTheme(e, key, slot, deckTh); fitText(e); }); commit(); }, DK.SLOT_NAMES[slot], true))),
    h('div', { class: 'f-label' }, 'Standard colors')] : null;
  const num = (id, short, label, get, put, disabled) => {
    const inp = h('input', { type: 'text', inputmode: 'decimal', id, value: get(), 'aria-label': label, disabled,
      onkeydown: e => { if (e.key === 'Enter') e.target.blur(); else if (e.key === 'Escape') { e.target.value = get(); e.target.blur(); } },
      onchange: e => { const v = parseFloat(String(e.target.value).replace(/[^0-9.\-]/g, '')); if (Number.isFinite(v)) { put(v); holdCommit(); } e.target.value = get(); } });
    fieldSync.push({ el: inp, get });
    return h('label', { class: 'field' + (disabled ? ' off' : ''), title: label }, h('span', null, short), inp);
  };
  const pick = (id, label, opts, cur, fn) => h('select', { class: 'sel', id, 'aria-label': label, title: label, value: String(cur), onchange: e => fn(e.target.value) }, opts.map(o => h('option', { value: String(o[0]) }, o[1])));
  const out = [];
  if (!list.length) {
    const count = type => all().filter(e => e.type === type).length;
    out.push(sec('Board', h('div', { class: 'kv' }, h('span', null, 'Pieces'), h('span', null, String(all().length)), h('span', null, 'Frames'), h('span', null, String(count('frame'))), h('span', null, 'Task cards'), h('span', null, String(count('card')))),
        h('button', { class: 'fbtn', onclick: () => fit() }, 'Fit everything on screen')),
      sec(null, h('p', { class: 'hint' }, 'Select a piece to change it here. Double-click empty space to add a sticky note, or pick a tool from the bar under the board.')));
  } else {
    out.push(h('div', { class: 'psec p-top' }, h('div', { class: 'p-title' }, one ? (one.live ? LIVE_NAMES[one.live] : one.preset ? PG.presetLabel(one.preset) : TYPE_NAMES[one.type]) : `${list.length} pieces selected`,
      list.some(e => e.locked) ? h('span', { class: 'lockchip' }, list.every(e => e.locked) ? 'Locked' : 'Some locked') : null)));
    if (one && one.type !== 'conn') {
      const e = one, lock = !!e.locked, keep = e.type === 'image' || e.type === 'sticker', pen = e.type === 'pen';
      out.push(sec('Position and size', h('div', { class: 'grid2' },
        num('prop-x', 'X', 'X position', () => String(Math.round(e.x)), v => { if (e.live) liveEdit(e, 'move', Math.round(v) - e.x, 0); else e.x = Math.round(v); }, lock),
        num('prop-y', 'Y', 'Y position', () => String(Math.round(e.y)), v => { if (e.live) liveEdit(e, 'move', 0, Math.round(v) - e.y); else e.y = Math.round(v); }, lock),
        num('prop-w', 'W', 'Width', () => String(Math.round(e.w)), v => { if (e.live) return liveEdit(e, 'scale', Math.max(10, v) / e.w); const r = e.w / e.h; e.w = Math.max(10, Math.round(v)); if (keep) e.h = Math.round(e.w / r); fitText(e); }, lock || pen),
        num('prop-h', 'H', 'Height', () => String(Math.round(e.h)), v => { if (e.live) return liveEdit(e, 'scale', Math.max(10, v) / e.h); const r = e.w / e.h; e.h = Math.max(10, Math.round(v)); if (keep) e.w = Math.round(e.h * r); fitText(e); }, lock || pen || e.type === 'text'),
        num('prop-rot', 'Turn', 'Rotation in degrees', () => Math.round(e.rot || 0) + '°', v => { if (e.live) return liveEdit(e, 'turn', G.normAngle(Math.round(v))); const a = G.normAngle(Math.round(v)); if (a) e.rot = a; else delete e.rot; }, lock))));
    }
    const fillable = of(['sticky', 'rect', 'ellipse', 'diamond']);
    if (fillable.length) out.push(sec('Fill', themeSw(fillable, 'fill'), h('div', { class: 'swatches' }, FILLS.map((c, i) => swatch(c, same(fillable, 'fill') === c, () => { if (fillable.every(e => e.type === 'sticky')) lastSticky = c; setAll(fillable, 'fill', c); }, FILL_NAMES[i])))));
    const notes = of(['sticky']);
    if (notes.length && notes.length === free.length) {
      const wide = notes.every(e => e.w > e.h * 1.5), square = notes.every(e => e.w <= e.h * 1.5), auto = notes.every(e => !e.size), authored = notes.some(e => e.author);
      const shape = w2 => { notes.forEach(e => { e.w = w2 ? Math.round(e.h * 2) : e.h; fitText(e); }); commit(); };
      out.push(sec('Sticky note',
        h('div', { class: 'grid2' },
          h('button', { class: 'fbtn', 'aria-pressed': String(square), title: 'Square note', onclick: () => shape(false) }, 'Square'),
          h('button', { class: 'fbtn', 'aria-pressed': String(wide), title: 'Twice as wide', onclick: () => shape(true) }, 'Wide'),
          h('button', { class: 'fbtn', 'aria-pressed': String(auto), title: 'Text gets smaller as you write more, so it always fits the note', onclick: () => { notes.forEach(e => { delete e.size; fitText(e); }); commit(); } }, 'Fit text'),
          authored ? h('button', { class: 'fbtn', 'aria-pressed': String(notes.every(e => !e.noAuthor)), title: 'Show who wrote the note', onclick: () => { const on = notes.every(e => !e.noAuthor); notes.forEach(e => { if (on) e.noAuthor = true; else delete e.noAuthor; fitText(e); }); commit(); } }, 'Show author') : null),
        h('p', { class: 'hint' }, 'Tab adds the next note beside this one.')));
    }
    const bordered = of(['rect', 'ellipse', 'diamond']);
    if (bordered.length) out.push(sec('Border', themeSw(bordered, 'stroke'), h('div', { class: 'swatches' }, swatch('#2b3545', bordered.every(e => !e.stroke), () => setAll(bordered, 'stroke', ''), 'Default'), VIVID.map(c => swatch(c, same(bordered, 'stroke') === c, () => setAll(bordered, 'stroke', c)))),
      h('div', { class: 'grid2' },
        pick('border-dash', 'Border pattern', [['solid', 'Solid'], ['dash', 'Dashed'], ['dot', 'Dotted']], same(bordered, 'dash') || 'solid', v => setAll(bordered, 'dash', v === 'solid' ? '' : v, true)),
        h('button', { class: 'fbtn', 'aria-pressed': String(bordered.every(e => e.sketch)), title: 'Rough, hand-drawn outline', onclick: () => setAll(bordered, 'sketch', !bordered.every(e => e.sketch)) }, 'Hand-drawn'))));
    const drawn = of(['pen']);
    if (drawn.length) {
      const hl = drawn.every(e => e.hl), cols = hl ? HL_COLORS : ['', ...VIVID];
      out.push(sec(hl ? 'Highlighter' : 'Stroke', h('div', { class: 'swatches' }, cols.map(c => swatch(c || C.ink, c ? same(drawn, 'stroke') === c : drawn.every(e => !e.stroke), () => setAll(drawn, 'stroke', c), c ? null : 'Default'))),
        h('div', { class: 'grid2' },
          pick('pen-width', 'Width', PEN_WIDTHS[hl ? 'hl' : same(drawn, 'brush') || 'pen'], same(drawn, 'sw') || PEN_DEFAULT[hl ? 'hl' : same(drawn, 'brush') || 'pen'], v => setAll(drawn, 'sw', Number(v), true)),
          hl ? null : pick('pen-dash', 'Stroke pattern', [['solid', 'Solid'], ['dash', 'Dashed'], ['dot', 'Dotted']], same(drawn, 'dash') || 'solid', v => setAll(drawn, 'dash', v === 'solid' ? '' : v, true)))));
    }
    const vecs = of(['path']);
    if (vecs.length) {
      const widths = [[0.5, '0.5 px'], [1, '1 px'], [1.5, '1.5 px'], [2, '2 px'], [3, '3 px'], [4, '4 px'], [6, '6 px'], [8, '8 px'], [12, '12 px']];
      const curW = same(vecs, 'sw');
      if (curW && !widths.some(w => w[0] === curW)) { widths.push([curW, r2(curW) + ' px']); widths.sort((a, b) => a[0] - b[0]); }
      const noFill = vecs.every(e => !e.fill || e.fill === 'none'), noStroke = vecs.every(e => e.stroke === 'none');
      // Picking a swatch sets one plain color and drops any stacked layers.
      const plain = (key, val, field) => { vecs.forEach(e => { delete e[key === 'sw' ? 'strokes' : key + 's']; }); setAll(vecs, key, val, field); };
      const solo = one && one.type === 'path' ? one : null;
      out.push(sec('Fill', themeSw(vecs, 'fill', () => vecs.forEach(e => { delete e.fills; })), h('div', { class: 'swatches' }, h('button', { class: 'sw none', title: 'No fill', 'aria-label': 'No fill', 'aria-pressed': String(noFill && vecs.every(e => !e.fills)), onclick: () => plain('fill', '') }),
          FILLS.map((c, i) => swatch(c, same(vecs, 'fill') === c && vecs.every(e => !e.fills), () => plain('fill', c), FILL_NAMES[i])), VIVID.map(c => swatch(c, same(vecs, 'fill') === c && vecs.every(e => !e.fills), () => plain('fill', c), null, true))),
        solo ? layerEditor(solo, 'fill', num) : null));
      out.push(sec('Stroke', themeSw(vecs, 'stroke', () => vecs.forEach(e => { delete e.strokes; })), h('div', { class: 'swatches' }, h('button', { class: 'sw none', title: 'No stroke', 'aria-label': 'No stroke', 'aria-pressed': String(noStroke && vecs.every(e => !e.strokes)), onclick: () => plain('stroke', 'none') }),
          swatch(C.ink, vecs.every(e => !e.stroke && !e.strokes), () => plain('stroke', ''), 'Default'), VIVID.map(c => swatch(c, same(vecs, 'stroke') === c && vecs.every(e => !e.strokes), () => plain('stroke', c)))),
        h('div', { class: 'grid2' },
          pick('vec-width', 'Stroke width', widths, same(vecs, 'sw') || 2, v => plain('sw', Number(v), true)),
          pick('vec-dash', 'Stroke pattern', [['solid', 'Solid'], ['dash', 'Dashed'], ['dot', 'Dotted']], same(vecs, 'dash') || 'solid', v => setAll(vecs, 'dash', v === 'solid' ? '' : v, true)),
          pick('vec-cap', 'Stroke ends (cap)', [['round', 'Round cap'], ['butt', 'Flat cap'], ['square', 'Square cap']], same(vecs, 'cap') || 'round', v => setAll(vecs, 'cap', v === 'round' ? '' : v, true)),
          pick('vec-join', 'Stroke corners (join)', CORNERS, same(vecs, 'join') || 'round', v => setAll(vecs, 'join', v === 'round' ? '' : v, true)),
          pick('vec-profile', 'Stroke width profile', PROFILES, same(vecs, 'profile') || '', v => setAll(vecs, 'profile', v, true))),
        solo ? layerEditor(solo, 'stroke', num) : null));
    }
    const combinable = free.filter(e => B.BOOLEABLE.has(e.type) || (e.type === 'pen' && !e.hl)), lv = liveOne();
    if (combinable.length >= 2 || lv) out.push(sec(lv ? 'Boolean' : 'Combine',
      h('div', { class: 'irow four' }, Object.entries(B.BOOL_LABELS).map(([op, label]) => h('button', { class: 'ibtn', title: label + (op === 'subtract' ? ': cut the upper shapes out of the bottom one' : '') + ` (Ctrl+Alt+${{ union: 'U', subtract: 'S', intersect: 'I', exclude: 'X' }[op]})`, 'aria-label': label, 'aria-pressed': lv ? String(lv.live === op) : null, onclick: () => boolOp(op) }, boolIcon(op)))),
      h('div', { class: 'row' }, h('button', { class: 'fbtn', title: lv ? 'Bake into one plain vector (Ctrl+E)' : 'Join into one vector without merging the shapes (Ctrl+E)', onclick: flattenSel }, 'Flatten'),
        lv ? h('button', { class: 'fbtn', title: 'Put the shapes back on the board on their own (Ctrl+Shift+G)', onclick: () => arrange('ungroup') }, 'Release')
          : h('button', { class: 'fbtn', title: 'The bottom piece clips the others to its outline (Ctrl+Alt+M)', onclick: useAsMask }, 'Use as mask')),
      lv ? h('p', { class: 'hint' }, 'The shapes stay editable. Double-click one to select it, or press Enter to select them all.') : null));
    if (free.some(e => e.mask || e.masking)) out.push(sec('Mask', h('p', { class: 'hint' }, free.some(e => e.masking) ? 'This piece is a mask: its outline clips the pieces grouped with it.' : 'Clipped by a mask.'), h('button', { class: 'fbtn', onclick: releaseMask }, 'Release mask')));
    const vsec = vectorSection(free, one, num);
    if (vsec) out.push(vsec);
    if (one && one.type === 'table') {
      const tb = one;
      const resize = (cells, dr, dc) => { const r0 = rowsOf(tb), c0 = colsOf(tb); if (dc && tb.colw) tb.colw = dc > 0 ? sharesWithCol(colFractions(tb), c0) : sharesWithoutCol(colFractions(tb), c0 - 1); tb.cells = cells; if (dr) tb.h = Math.round(tb.h / r0 * (r0 + dr)); if (dc) tb.w = Math.round(tb.w / c0 * (c0 + dc)); fitText(tb); commit(); };
      const r = rowsOf(tb), c = colsOf(tb);
      out.push(sec('Table',
        h('div', { class: 'stepper' }, h('span', null, 'Rows'), h('button', { class: 'ibtn', 'aria-label': 'Remove last row', disabled: r <= 1, onclick: () => resize(removeRow(tb.cells, r - 1), -1, 0) }, icon('M5 10h10', 14)), h('span', { class: 'num' }, String(r)), h('button', { class: 'ibtn', 'aria-label': 'Add a row', onclick: () => resize(insertRow(tb.cells, r), 1, 0) }, icon('M10 5v10M5 10h10', 14))),
        h('div', { class: 'stepper' }, h('span', null, 'Columns'), h('button', { class: 'ibtn', 'aria-label': 'Remove last column', disabled: c <= 1, onclick: () => resize(removeCol(tb.cells, c - 1), 0, -1) }, icon('M5 10h10', 14)), h('span', { class: 'num' }, String(c)), h('button', { class: 'ibtn', 'aria-label': 'Add a column', onclick: () => resize(insertCol(tb.cells, c), 0, 1) }, icon('M10 5v10M5 10h10', 14))),
        tableStyleUI(tb),
        h('p', { class: 'hint' }, 'Double-click a cell to type. Tab moves to the next cell.')));
    }
    if (one && one.type === 'image') out.push(pictureSection(one, num, pick, swatch));
    if (one && one.type === 'chart' && one.chart) out.push(...chartSections(one));
    if (one && one.type === 'rect' && one.preset) {
      const sh = one, def = PG.presetDef(sh.preset);
      out.push(sec('Shape',
        h('select', { class: 'sel', id: 'shape-kind', 'aria-label': 'Shape', value: sh.preset, onchange: ev => { sh.preset = ev.target.value; delete sh.adj; commit(); } },
          PG.SHAPE_GROUPS.map(([group, names]) => h('optgroup', { label: group }, names.map(n => h('option', { value: n }, PG.presetLabel(n)))))),
        def && def.ah && def.ah.length ? h('div', { class: 'row' }, h('span', { class: 'hint grow' }, 'Drag the diamond handles on the shape to adjust it.'), h('button', { class: 'fbtn', disabled: !sh.adj, onclick: () => { delete sh.adj; commit(); } }, 'Reset')) : null));
    }
    const vivid = of(['sticker', 'tape']), tapes = of(['tape']);
    if (vivid.length) out.push(sec('Color', h('div', { class: 'swatches' }, VIVID.map(c => swatch(c, same(vivid, 'fill') === c, () => setAll(vivid, 'fill', c)))),
      tapes.length ? pick('tape-pattern', 'Tape pattern', Object.entries(TAPES), same(tapes, 'pattern') || 'stripes', v => setAll(tapes, 'pattern', v, true)) : null));
    const conns = of(['conn']);
    if (conns.length) out.push(sec('Line',
      pick('conn-style', 'Line style', [['straight', 'Straight'], ['curve', 'Curved'], ['elbow', 'Right angle'], ['cable', 'Cable']], same(conns, 'style') || 'straight', v => { connStyle = v; setAll(conns, 'style', v === 'straight' ? '' : v, true); }),
      h('div', { class: 'swatches' }, swatch(C.ink, conns.every(e => !e.stroke), () => setAll(conns, 'stroke', ''), 'Default'), VIVID.map(c => swatch(c, same(conns, 'stroke') === c, () => setAll(conns, 'stroke', c)))),
      conns.some(e => e.style !== 'cable') ? h('div', { class: 'grid3' },
        pick('conn-dash', 'Line pattern', [['solid', 'Solid'], ['dash', 'Dashed'], ['dot', 'Dotted']], same(conns, 'dash') || 'solid', v => setAll(conns, 'dash', v === 'solid' ? '' : v, true)),
        pick('conn-tail', 'Start', HEADS, same(conns, 'tail') || 'none', v => setAll(conns, 'tail', v === 'none' ? '' : v, true)),
        pick('conn-head', 'End', HEADS, same(conns, 'head') || 'triangle', v => setAll(conns, 'head', v === 'triangle' ? '' : v, true))) : null,
      h('div', { class: 'row' },
        h('button', { class: 'fbtn', 'aria-pressed': String(conns.every(e => e.flow)), title: 'Show dots moving from start to end', onclick: () => setAll(conns, 'flow', !conns.every(e => e.flow)) }, 'Animate flow'),
        conns.some(e => e.style !== 'cable') ? h('button', { class: 'fbtn', 'aria-pressed': String(conns.every(e => e.sketch)), title: 'Rough, hand-drawn line', onclick: () => setAll(conns, 'sketch', !conns.every(e => e.sketch)) }, 'Hand-drawn') : null,
        conns.some(e => e.as || e.bs) ? h('button', { class: 'fbtn', title: 'Let both ends pick the best side again', onclick: () => { conns.forEach(e => { delete e.as; delete e.bs; }); commit(); } }, 'Unpin ends') : null)));
    if (one && one.type === 'frame') out.push(slideSection(one, sec, swatch, themeSw));
    const texty = free.filter(e => TEXTY.includes(e.type));
    if (texty.length) {
      const st0 = G.textStyle(texty[0]), al = same(texty, 'align'), col = same(texty, 'color'), ital = texty.every(e => e.italic);
      out.push(sec('Text',
        pick('font', 'Font', Object.entries(FONTS).map(([k, v]) => [k, v.label]), same(texty, 'font') || 'sans', v => setAll(texty, 'font', v === 'sans' ? '' : v, true)),
        h('div', { class: 'grid2' },
          pick('weight', 'Weight', WEIGHTS, same(texty, 'weight') || st0.weight, v => setAll(texty, 'weight', Number(v), true)),
          num('size', 'Size', 'Text size', () => String(Math.round(G.textStyle(texty[0]).size)), v => texty.forEach(e => { e.size = Math.min(400, Math.max(4, Math.round(v))); fitText(e); }))),
        h('div', { class: 'row' },
          h('div', { class: 'seg', role: 'group', 'aria-label': 'Text alignment' }, [['left', 'Align left', 'M3 5h14M3 10h9M3 15h11'], ['center', 'Align center', 'M3 5h14M5.5 10h9M4.5 15h11'], ['right', 'Align right', 'M3 5h14M8 10h9M6 15h11']]
            .map(([k, label, d]) => h('button', { title: label, 'aria-label': label, 'aria-pressed': String(al === k), onclick: () => setAll(texty, 'align', al === k ? '' : k) }, icon(d, 14)))),
          h('button', { class: 'fbtn', style: 'font-style:italic', 'aria-pressed': String(ital), onclick: () => setAll(texty, 'italic', !ital) }, 'Italic')),
        themeSw(texty, 'color'),
        h('div', { class: 'swatches', role: 'group', 'aria-label': 'Text color' }, TEXT_COLORS.map(([c, name]) => swatch(c, col === c || (c === '#1d2530' && texty.every(e => !e.color)), () => setAll(texty, 'color', c === '#1d2530' ? '' : c), name, true)))));
      const paraEls = texty.filter(e => e.type === 'text');
      if (paraEls.length) {
        const bl = same(paraEls, 'bullets') || (paraEls.every(e => !e.bullets) ? 'none' : '');
        const shift = by => { paraEls.forEach(e => { e.text = RT.indentParas(e.text, 0, Infinity, by); fitText(e); }); commit(); };
        out.push(sec('Paragraph',
          h('div', { class: 'row' },
            h('div', { class: 'seg', role: 'group', 'aria-label': 'List style' }, [['none', 'No bullets', 'M4 6h12M4 10h12M4 14h12'], ['disc', 'Bullets (Ctrl+Shift+8)', 'M4 6h.01M4 10h.01M4 14h.01M7.5 6h8.5M7.5 10h8.5M7.5 14h8.5'], ['num', 'Numbers (Ctrl+Shift+7)', 'M3.5 5h1v3M3.5 12h2l-2 2.5h2M7.5 6h8.5M7.5 10h8.5M7.5 14h8.5']]
              .map(([k, label, d]) => h('button', { title: label, 'aria-label': label, 'aria-pressed': String(bl === k), onclick: () => setAll(paraEls, 'bullets', k === 'none' ? '' : k) }, icon(d, 14, k === 'none' ? {} : { 'stroke-linecap': 'round' })))),
            h('div', { class: 'seg', role: 'group', 'aria-label': 'Indent' },
              h('button', { title: 'Decrease indent (Shift+Tab while typing)', 'aria-label': 'Decrease indent', disabled: paraEls.every(e => !/(^|\n)\t/.test(e.text || '')), onclick: () => shift(-1) }, icon('M9 6h7M9 10h7M9 14h7M6 8l-2.5 2L6 12', 14)),
              h('button', { title: 'Increase indent (Tab while typing)', 'aria-label': 'Increase indent', onclick: () => shift(1) }, icon('M9 6h7M9 10h7M9 14h7M3.5 8L6 10l-2.5 2', 14)))),
          h('div', { class: 'grid2' },
            pick('line-sp', 'Line spacing', [[1, 'Single'], [1.15, '1.15'], [1.5, '1.5'], [2, 'Double']], same(paraEls, 'lsp') || 1, v => setAll(paraEls, 'lsp', Number(v) === 1 ? '' : Number(v))),
            pick('para-sp', 'Space between paragraphs', [['', 'Auto'], [0, 'None'], [6, '6 px'], [12, '12 px'], [18, '18 px'], [24, '24 px']], same(paraEls, 'psp') ?? '', v => { paraEls.forEach(e => { if (v === '') delete e.psp; else e.psp = Number(v); fitText(e); }); commit(); }))));
      }
    }
    if (one && one.type === 'card') out.push(sec('Task', ...taskFields(one, 'd-', holdCommit)));
    if (free.filter(e => e.type !== 'conn').length > 1) out.push(sec('Align', h('div', { class: 'grid4' }, ALIGN.map(([k, label, d]) => h('button', { class: 'ibtn', title: label, 'aria-label': label, onclick: () => align(k) }, icon(d, 16))))));
    const locked = list.every(e => e.locked);
    const act = (label, d, fn, cls = '', disabled = false) => h('button', { class: 'ibtn' + cls, title: label, 'aria-label': label, disabled, onclick: fn }, icon(d, 16));
    out.push(sec('Arrange', h('div', { class: 'irow' },
      act('Bring to front', MI.front, () => arrange('front')),
      act('Send to back', MI.back, () => arrange('back')),
      act(locked ? 'Unlock' : 'Lock', MI.lock, () => arrange(locked ? 'unlock' : 'lock'), locked ? ' on' : ''),
      act('Duplicate (Ctrl+D)', MI.copy, () => { copySel(); pasteEls(clip, 24); }),
      act(list.length > 1 ? 'Delete selection' : 'Delete', MI.trash, removeSel, ' danger', !free.length)),
      list.length > 1 || list.some(e => e.g && !e.boolIn) ? h('div', { class: 'row' },
        list.length > 1 ? h('button', { class: 'fbtn', onclick: () => arrange('group') }, 'Group') : null,
        list.some(e => e.g && !e.boolIn) ? h('button', { class: 'fbtn', onclick: () => arrange('ungroup') }, liveOne() ? 'Release' : 'Ungroup') : null) : null));
  }
  el.replaceChildren(...out);
}
/** A small line drawing of a preset shape, for menus. */
function shapeIcon(name, size = 22) {
  const def = PG.presetDef(name); if (!def) return null;
  const sq = SQUARE_SHAPES.test(name), w = sq ? 20 : 22, ht = sq ? 20 : 14, ps = PG.presetPaths(def, w, ht);
  return s('svg', { viewBox: `${-(24 - w) / 2} ${-(24 - ht) / 2} 24 24`, width: size, height: size, 'aria-hidden': 'true' },
    ps.map(p => s('path', { d: p.d, fill: p.fill === 'none' ? 'none' : 'var(--shape-fill)', stroke: p.stroke ? 'currentColor' : 'none', 'stroke-width': 1.1, 'stroke-linejoin': 'round' })));
}
function renderFly() {
  const el = $('#fly'); if (!el) return; el.hidden = tool !== 'stamp' && tool !== 'conn' && tool !== 'pen' && tool !== 'shape'; if (el.hidden) return;
  if (tool === 'shape') {
    if (!PG.presetsReady()) { el.replaceChildren(h('p', { class: 'fly-n' }, 'Loading shapes...')); return; }
    el.replaceChildren(...PG.SHAPE_GROUPS.flatMap(([group, names]) => [
      h('div', { class: 'fly-h' }, group),
      h('div', { class: 'fly-s' }, names.map(n => h('button', { class: shapePick === n ? 'on' : '', title: PG.presetLabel(n), 'aria-label': PG.presetLabel(n), onclick: () => { shapePick = n; renderFly(); } }, shapeIcon(n))))]),
      h('p', { class: 'fly-n' }, 'Click the board to place the shape, or drag to set its size. Drag a shape\'s diamond handles to adjust its arrowheads, corners, and tails.'));
    return;
  }
  if (tool === 'pen') {
    const modes = [['pen', 'Pen', ICON.pen], ['brush', 'Brush', 'M15 3l2 2-6.2 6.2-2-2zM8.3 9.7l2 2c0 3-2.6 4.8-5.8 4.8 1-1 1.1-2.3 1.1-3.4 0-1.9 1.2-3.4 2.7-3.4z'], ['pencil', 'Pencil', 'M4 16l1-4 8.5-8.5 3 3L8 15zM12 5l3 3M5 12l3 3'], ['marker', 'Marker', 'M7.5 12.5l5.5-8.5 3 2-5.5 8.5zM7.5 12.5L6 16.5l3.5-1.5M4 18h12'], ['hl', 'Highlighter', 'M5 15l7-7 3 3-7 7H5zM12 8l2-2 3 3-2 2M4 18h12'], ['erase', 'Eraser', 'M8 16l-4-4 7-7 6 6-5 5zM8 16h9M7.5 9.5l5 5']];
    const colors = penMode === 'hl' ? HL_COLORS.map(c => [c, c, 'Color ' + c]) : [['', C.ink, 'Default'], ...VIVID.map(c => [c, c, 'Color ' + c])];
    el.replaceChildren(...[
      h('div', { class: 'fly-h' }, 'Drawing'),
      h('div', { class: 'seg wide three', role: 'group', 'aria-label': 'Drawing tool' }, modes.map(([k, label, d]) => h('button', { 'aria-pressed': String(penMode === k), title: label, 'aria-label': label, onclick: () => { penMode = k; penWidth = 0; if (k === 'hl' && !HL_COLORS.includes(penColor)) penColor = ''; if (k === 'pen' && HL_COLORS.includes(penColor)) penColor = ''; refresh(); } }, icon(d, 18), h('span', null, label)))),
      penMode === 'erase' ? h('p', { class: 'fly-n' }, 'Drag across drawings and vectors to erase. It cuts through strokes and bites into filled vectors, keeping the rest; hold Alt to remove whole pieces. Notes and plain shapes are not affected.') : [
        h('div', { class: 'fly-h' }, 'Color'),
        h('div', { class: 'fly-c' }, colors.map(([v, c, label]) => h('button', { class: 'sw', style: 'background:' + c + (penMode === 'hl' ? ';opacity:.7' : ''), title: label, 'aria-label': label, 'aria-pressed': String(penColor === v || (penMode === 'hl' && !penColor && v === HL_COLORS[0])), onclick: () => { penColor = v; renderFly(); } }))),
        h('div', { class: 'fly-h' }, 'Width'),
        h('div', { class: 'seg', role: 'group', 'aria-label': 'Width' }, PEN_WIDTHS[penMode].map(([w, label]) => h('button', { 'aria-pressed': String(penWidth ? penWidth === w : w === PEN_DEFAULT[penMode]), onclick: () => { penWidth = w; renderFly(); } }, label)))]].flat());
    return;
  }
  if (tool === 'conn') {
    const styles = [['straight', 'Straight', 'M4 16L16 4'], ['curve', 'Curved', 'M3 15C9 15 11 5 17 5'], ['elbow', 'Right angle', 'M3 15H10V5H17'], ['cable', 'Cable', 'M3 6C3 16 17 16 17 6M1.5 6H4.5M15.5 6H18.5']];
    const pick = (k, label) => () => { connStyle = k; renderFly(); };
    el.replaceChildren(
      h('div', { class: 'fly-h' }, 'New connectors'),
      h('div', { class: 'seg wide', role: 'group', 'aria-label': 'Line style' }, styles.map(([k, label, d]) => h('button', { 'aria-pressed': String(connStyle === k), title: label, 'aria-label': label, onclick: pick(k, label) }, icon(d, 18), h('span', null, label)))),
      h('div', { class: 'fly-h' }, 'Color'),
      h('div', { class: 'fly-c' }, [['', C.ink, 'Default'], ...VIVID.map(c => [c, c, 'Color ' + c])].map(([v, c, label]) => h('button', { class: 'sw', style: 'background:' + c, title: label, 'aria-label': label, 'aria-pressed': String(connColor === v), onclick: () => { connColor = v; renderFly(); } }))),
      h('p', { class: 'fly-n' }, 'Drag from one piece to another. Drop on a dot to pin that end to a side. Selected pieces also have + handles for connecting.'));
    return;
  }
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
  if (!$('#ptasks') || rightTab !== 'tasks') return;
  const cards = scopeCards().sort((a, b) => (a.due || '9') < (b.due || '9') ? -1 : 1), cur = selEls().length === 1 && selEls()[0].type === 'card' ? selEls()[0] : null;
  const n = k => cards.filter(c => k === 'all' || c.status === k).length;
  $('#thead').replaceChildren(h('div', { class: 'tpad' },
    scopeSwitch(),
    h('div', { class: 'seg', role: 'group', 'aria-label': 'Task view' }, [['list', 'List'], ['cal', 'Calendar']].map(([k, label]) => h('button', { 'aria-pressed': String(taskView === k), onclick: () => { taskView = k; renderTasks(); } }, label))),
    taskView === 'cal' ? calendarEl(cards) : h('div', { class: 'chips' }, [['all', 'All'], ...Object.entries(STATUS).map(([k, v]) => [k, v[0], v[1]])].map(([k, label, col]) =>
      h('button', { class: 'chip' + (taskFilter === k ? ' on' : ''), 'aria-pressed': String(taskFilter === k), onclick: () => { taskFilter = k; renderTasks(); } }, col ? h('b', { style: 'background:' + col }) : null, `${label} ${n(k)}`)))));
  if ((cur ? cur.id : '') !== edFor) {
    edFor = cur ? cur.id : '';
    $('#ted').replaceChildren(...(cur ? [h('section', { class: 'psec tsel' }, h('h3', null, 'Selected task'), ...taskFields(cur, 't-', () => commit()))] : []));
  }
  const show = taskView === 'cal' ? cards.filter(c => calDay ? c.due === calDay : (c.due || '').startsWith(monthPrefix(cal.year, cal.month))) : cards.filter(c => taskFilter === 'all' || c.status === taskFilter);
  const none = taskView === 'cal' ? (calDay ? 'Nothing is due on this day.' : 'Nothing is due this month.') : cards.length ? 'No tasks with this status.' : 'No tasks yet. Press C and click the board to add a task card.';
  $('#tlist').replaceChildren(...(show.length ? show.map(c => {
    const late = c.due && c.due < today() && c.status !== 'done';
    const where = taskScope === 'all' && board.pages.length > 1 ? ' \u00b7 ' + (pageOf(c.id) || {}).name : '';
    return h('button', { class: 'trow' + (cur === c ? ' on' : ''), onclick: () => gotoCard(c) },
      h('i', { style: 'background:' + STATUS[c.status][1] }), h('div', null, h('strong', null, c.text), h('small', { class: late ? 'late' : '' }, STATUS[c.status][0] + (c.due ? (late ? ' · overdue ' : ' · due ') + c.due : '') + where)));
  }) : [h('p', { class: 'note' }, none)]));
}
function renderKanban() {
  const el = $('#kan'), btn = $('#kanban-toggle'); if (!el) return; el.hidden = !kanban; btn.classList.toggle('on', kanban); btn.setAttribute('aria-pressed', String(kanban)); if (!kanban) return;
  const groups = groupTasks(scopeCards()), multi = taskScope === 'all' && board.pages.length > 1;
  el.replaceChildren(...Object.entries(STATUS).map(([k, [label, col]]) => h('section', { class: 'kcol', 'aria-label': label,
    ondragover: e => { e.preventDefault(); e.currentTarget.classList.add('over'); }, ondragleave: e => e.currentTarget.classList.remove('over'),
    ondrop: e => { e.preventDefault(); e.currentTarget.classList.remove('over'); const c = E(e.dataTransfer.getData('text/plain')); const c2 = c || board.pages.map(p => p.els[e.dataTransfer.getData('text/plain')]).find(Boolean); if (c2 && c2.type === 'card' && c2.status !== k) { c2.status = k; edFor = null; cardChanged(c2); } } },
    h('header', null, h('b', { style: 'background:' + col }), label, h('span', { class: 'kcount' }, String(groups[k].length))),
    h('div', { class: 'klist' }, groups[k].map(c => {
      const late = c.due && c.due < today() && c.status !== 'done';
      return h('article', { class: 'kcard' + (sel.has(c.id) ? ' on' : ''), draggable: 'true', tabindex: '0',
        ondragstart: e => e.dataTransfer.setData('text/plain', c.id), onclick: () => { sel = new Set([c.id]); rightTab = 'design'; refresh(); },
        onkeydown: e => { if (e.key === 'Enter') { sel = new Set([c.id]); rightTab = 'design'; refresh(); } },
        ondblclick: () => { kanban = false; gotoCard(c); } },
        h('strong', null, c.text), multi ? h('small', null, (pageOf(c.id) || {}).name) : null, c.due ? h('small', { class: late ? 'late' : '' }, (late ? 'Overdue ' : 'Due ') + c.due) : null, c.notes ? h('p', null, c.notes) : null);
    })),
    h('button', { class: 'kadd', onclick: () => { kanban = false; addTask(k); } }, icon('M10 4.5v11M4.5 10h11', 14), 'Add task'))));
}
function openMenu(ev) {
  ev.preventDefault(); if (editing) endEdit();
  const p = pt(ev), inner = selectedOperandAt(p), id = inner ? inner.id : idAt(ev.target, ev);
  if (id && !sel.has(id)) { sel = new Set(group(id)); refresh(); } else if (!id && sel.size) { sel.clear(); refresh(); }
  const list = panelEls(), lv = liveOne();
  popupAt(ev.clientX, ev.clientY, id ? [
    list.length === 1 && TEXTY.includes(list[0].type) ? ['Edit text', () => startEdit(list[0].id)] : null,
    list.length === 1 && list[0].type === 'path' && !list[0].locked && !list[0].live ? ['Edit nodes', () => enterVedit(list[0].id)] : null,
    lv ? ['Select shapes inside', () => { sel = new Set(LB.operandsOf(board.els, lv.id).flatMap(o => withKids(o.id))); refresh(); }] : null,
    list.some(vectorable) ? ['Convert to vector', () => toVector(list)] : null,
    ...(boolPieces().length >= 2 || lv ? Object.entries(B.BOOL_LABELS).filter(([op]) => !lv || lv.live !== op).map(([op, label]) => [lv ? 'Change to ' + label.toLowerCase() : label, () => boolOp(op)]) : []),
    boolPieces().length >= 2 || lv ? ['Flatten', flattenSel] : null,
    selEls().length >= 2 ? ['Use as mask', useAsMask] : null, selEls().some(e => e.mask || e.masking) ? ['Release mask', releaseMask] : null,
    list.some(strokable) ? ['Outline stroke', outlineStroke] : null,
    PO.ready() && list.some(e => e.type === 'path') ? ['Simplify', () => adjOpen('simplify')] : null,
    PO.ready() && list.some(e => e.type === 'path') ? ['Smooth', () => adjOpen('smooth')] : null,
    list.length === 1 && list[0].type === 'frame' ? [list[0].slide ? 'Remove from slides' : 'Use as slide', () => { SL.setSlide(board.els, list[0], !list[0].slide); commit(); }] : null,
    list.length === 1 && list[0].slide ? ['Present from here', () => present(SL.slidesOf(board.els).indexOf(list[0]))] : null,
    ['Duplicate', () => { copySel(); pasteEls(clip, 24); }], ['Copy', copySel], '-',
    ['Bring to front', () => arrange('front')], ['Send to back', () => arrange('back')],
    list.length > 1 ? ['Group', () => arrange('group')] : null, list.some(e => e.g) ? [lv ? 'Release shapes' : 'Ungroup', () => arrange('ungroup')] : null,
    list.every(e => e.locked) ? ['Unlock', () => arrange('unlock')] : ['Lock', () => arrange('lock')], '-',
    ['Delete', removeSel, 'danger']]
  : [clip.length ? ['Paste here', () => pasteAt(p)] : null,
    ['Add sticky note', () => makeBox('sticky', p.x, p.y, 0, 0)], ['Add task card', () => makeBox('card', p.x, p.y, 0, 0)], ['Add text', () => makeBox('text', p.x, p.y, 0, 0)], ['Add picture', () => $('#img-file').click()], '-',
    ['Select all', () => { sel = new Set(Object.keys(board.els)); refresh(); }], ['Fit everything', () => fit()], ['Keyboard shortcuts', toggleHelp]]);
}
const KEYS = [
  ['Tools', [['V', 'Select'], ['S', 'Sticky note'], ['T', 'Text'], ['R / O / D', 'Rectangle, ellipse, diamond'], ['U', 'Shapes: arrows, stars, callouts, flowchart'], ['C', 'Task card'], ['F', 'Frame'], ['L', 'Connector'], ['P', 'Draw'], ['H', 'Highlighter'], ['E', 'Eraser (drawings and vectors; Alt removes whole pieces)'], ['G', 'Table'], ['K', 'Stickers and tape'], ['I', 'Picture']]],
  ['Connecting', [['L', 'Connector tool: drag from piece to piece'], ['Drop on a dot', 'Pin the end to that side'], ['+ handle, drag', 'Connect the selected piece'], ['+ handle, click', 'Add a connected piece on that side']]],
  ['Editing', [['Double-click', 'Edit text, or add a note on empty space'], ['Enter', 'Edit the selected piece'], ['Tab', 'Next sticky note beside this one, or next table cell'], ['Ctrl+D', 'Duplicate'], ['Alt+drag', 'Drag a copy'], ['Ctrl+C / Ctrl+V', 'Copy and paste (also pastes pictures and text)'], ['Ctrl+Z / Ctrl+Shift+Z', 'Undo and redo'], ['Ctrl+G / Ctrl+Shift+G', 'Group and ungroup'], ['Ctrl+Shift+L', 'Lock or unlock'], ['[ and ]', 'Send to back, bring to front'], ['Delete', 'Delete the selection']]],
  ['Moving and sizing', [['Arrow keys', 'Nudge by 1 (Shift for 10)'], ['Shift while dragging', 'Keep to a straight line'], ['Shift while drawing', 'Keep it square'], ['Alt while placing', 'Keep the tool to place several'], ['Shift while resizing', 'Keep its shape'], ['Ctrl while dragging', 'Turn off snapping'], ['Shift while rotating', 'Turn in 15 degree steps']]],
  ['Vectors', [['B', 'Pen: click for corners, drag for curves'], ['Click the first node', 'Close the shape'], ['Enter or Esc', 'Finish the path'], ['Double-click a vector', 'Edit its nodes'], ['Click the outline', 'Add a node there'], ['Double-click a node', 'Switch between corner and smooth'], ['Alt+drag a handle', 'Bend one side only'], ['Delete', 'Remove the selected nodes'], ['Ctrl+Alt+U / S / I / X', 'Union, subtract, intersect, exclude'], ['Double-click a boolean', 'Select the shape under the pointer'], ['Enter on a boolean', 'Select the shapes inside it'], ['Esc on a shape inside', 'Back to the boolean'], ['Ctrl+E', 'Flatten the selection, or bake a boolean'], ['Ctrl+Shift+O', 'Outline stroke'], ['Ctrl+Alt+M', 'Use the bottom piece as a mask, or release it']]],
  ['Typing in a text box', [['Tab / Shift+Tab', 'Indent or outdent the paragraph'], ['Ctrl+Shift+8', 'Bullets on or off'], ['Ctrl+Shift+7', 'Numbers on or off'], ['Esc or Ctrl+Enter', 'Finish typing']]],
  ['Presenting', [['Ctrl+Enter', 'Present (from the selected slide)'], ['Right, Space, Enter', 'Next slide'], ['Left, Backspace', 'Previous slide'], ['Home / End', 'First or last slide'], ['P', 'Presenter view with notes'], ['F', 'Full screen'], ['Esc', 'Stop presenting']]],
  ['View', [['Space+drag', 'Pan'], ['Ctrl+scroll', 'Zoom'], ['+ and -', 'Zoom in and out'], ['Shift+1', 'Fit everything'], ['M', 'Show or hide the minimap'], ['Right-click', 'Open the menu'], ['?', 'Show this list'], ['Esc', 'Deselect or close']]]];
function toggleHelp() {
  const open = $('#help'); if (open) { open.remove(); return; }
  document.body.append(h('div', { class: 'help', id: 'help', onclick: e => { if (e.target.id === 'help') e.target.remove(); } },
    h('div', { class: 'help-b', role: 'dialog', 'aria-label': 'Keyboard shortcuts' },
      h('div', { class: 'help-t' }, h('h2', null, 'Keyboard shortcuts'), h('button', { class: 'btn', onclick: toggleHelp }, 'Close')),
      h('div', { class: 'help-g' }, KEYS.map(([title, rows]) => h('section', null, h('h3', null, title), rows.map(([key, what]) => h('div', { class: 'help-r' }, h('kbd', null, key), h('span', null, what)))))),
      h('p', { class: 'note' }, 'On a Mac, use Cmd in place of Ctrl.'),
      h('p', { class: 'note credit' }, 'Preset shapes are the 187 shapes of the Office Open XML standard (ECMA-376), drawn from its shape definitions.'),
      h('p', { class: 'note credit' }, 'Deck themes and slide layouts come from DeckCraft (MIT or Apache-2.0), by the ArtCraft Team and the DeckCraft contributors.'),
      h('p', { class: 'note credit' }, 'Vector booleans, outline stroke, offset, simplify, and smooth use the path engine from VectorCraft (MIT or Apache-2.0), by the ArtCraft Team and the VectorCraft contributors.'))));
}

/* ---------- Vector pen and node editing ---------- */
let vdraft = null, vedit = null;
const r2 = v => Math.round(v * 100) / 100;
/** Points within a few screen pixels of each other. */
const nearPt = (a, b, px = 9) => Math.hypot(a.x - b.x, a.y - b.y) * cam.z < px;
function vPenDown(ev, p, dbl) {
  if (!vdraft) { vdraft = { nodes: [] }; sel.clear(); }
  const ns = vdraft.nodes;
  if (ns.length >= 2 && nearPt(ns[0], p)) { finishDraft(true); return; }
  if (ns.length && (dbl || nearPt(ns[ns.length - 1], p))) { finishDraft(false); return; }
  let q = p;
  if (ev.shiftKey && ns.length) { const l = ns[ns.length - 1], a = Math.round(Math.atan2(p.y - l.y, p.x - l.x) / (Math.PI / 4)) * Math.PI / 4, d = Math.hypot(p.x - l.x, p.y - l.y); q = { x: l.x + Math.cos(a) * d, y: l.y + Math.sin(a) * d }; }
  const n = { x: r2(q.x), y: r2(q.y) }; ns.push(n);
  mode = { k: 'vhandle', n, sx: ev.clientX, sy: ev.clientY };
  drawDraft();
}
/** The path being drawn: its curve so far, a preview of the next segment, its nodes, and the last node's handles. */
function drawDraft() {
  if (!vdraft) return drawOverlay();
  const k = 1 / cam.z, ns = vdraft.nodes, hv = vdraft.hover, out = [];
  if (ns.length) {
    const l = ns[ns.length - 1];
    out.push(s('path', { d: V.pathD([{ nodes: ns }]), fill: 'none', stroke: penColor || C.ink, 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    const closing = hv && ns.length >= 2 && nearPt(ns[0], hv);
    if (hv && !mode) { const end = closing ? ns[0] : hv; out.push(s('path', { d: `M${l.x} ${l.y}C${l.ox ?? l.x} ${l.oy ?? l.y} ${closing ? (ns[0].ix ?? end.x) : end.x} ${closing ? (ns[0].iy ?? end.y) : end.y} ${end.x} ${end.y}`, fill: 'none', stroke: C.accent, 'stroke-width': 1.25 * k, 'stroke-dasharray': `${4 * k} ${3 * k}` })); }
    for (const w of ['i', 'o']) if (l[w + 'x'] != null) out.push(s('line', { x1: l.x, y1: l.y, x2: l[w + 'x'], y2: l[w + 'y'], stroke: C.accent, 'stroke-width': k }), s('circle', { cx: l[w + 'x'], cy: l[w + 'y'], r: 3.5 * k, fill: '#ffffff', stroke: C.accent, 'stroke-width': 1.25 * k }));
    ns.forEach((n, i) => out.push(s('rect', { x: n.x - 3.5 * k, y: n.y - 3.5 * k, width: 7 * k, height: 7 * k, rx: k, fill: i === 0 && closing ? C.accent : '#ffffff', stroke: C.accent, 'stroke-width': 1.25 * k })));
    if (closing) out.push(s('circle', { cx: ns[0].x, cy: ns[0].y, r: 8 * k, fill: 'none', stroke: C.accent, 'stroke-width': k }));
  }
  drawOverlay(s('g', { 'pointer-events': 'none' }, out));
}
/** Turns the path being drawn into a vector piece. */
function finishDraft(closed, keepTool = false) {
  const d = vdraft; vdraft = null; if (!d) return;
  if (d.nodes.length >= 2) {
    const e = { id: uid('e'), type: 'path', z: topZ() + 1, x: 0, y: 0, w: 0, h: 0, sw: 2 };
    if (penColor) e.stroke = penColor;
    V.setWorldPaths(e, [{ nodes: d.nodes, closed: closed || undefined }]);
    board.els[e.id] = e; sel = new Set([e.id]);
  }
  if (!keepTool) tool = 'select';
  commit();
}
const endDraft = () => { if (vdraft) finishDraft(false, true); };
/** Refits a path's box to its curves after its nodes change. */
const fitPath = e => V.setWorldPaths(e, V.worldPaths(e));
function enterVedit(id) {
  const e = E(id); if (!e || e.type !== 'path' || e.locked) return;
  if (editing) endEdit();
  sel = new Set([id]);
  if (e.rot || (e.vw && Math.abs(e.vw - e.w) > 0.01) || (e.vh && Math.abs(e.vh - e.h) > 0.01)) { V.normalize(e); commit(); }
  vedit = { id, nodes: new Set() }; refresh();
}
function exitVedit() { if (!vedit) return; vedit = null; refresh(); }
function removeVNodes() {
  const e = E(vedit.id); if (!e || !vedit.nodes.size) return;
  e.paths = V.removeNodes(e.paths, [...vedit.nodes].map(key => key.split(':').map(Number))); vedit.nodes.clear();
  if (!e.paths.length) { delete board.els[e.id]; sel.delete(e.id); vedit = null; } else fitPath(e);
  commit();
}
/** Handles a press while editing nodes. Returns false when it should fall through to normal selection. */
function vEditDown(ev, p, id, dbl) {
  const e = E(vedit.id); if (!e) { vedit = null; return false; }
  const t = (ev.target && ev.target.dataset) || {};
  if (t.vh) { const [si, i, which] = t.vh.split(':'); mode = { k: 'vhand', e, si: Number(si), i: Number(i), which }; return true; }
  if (t.vn) {
    const key = t.vn, [si, i] = key.split(':').map(Number), sp = e.paths[si], n = sp.nodes[i];
    if (dbl) { V.setSmooth(sp, i, !(n.ix != null || n.ox != null)); vedit.nodes = new Set([key]); fitPath(e); commit(); return true; }
    if (ev.shiftKey) { if (vedit.nodes.has(key)) vedit.nodes.delete(key); else vedit.nodes.add(key); drawOverlay(); return true; }
    if (!vedit.nodes.has(key)) vedit.nodes = new Set([key]);
    mode = { k: 'vnode', e, p, start: clone(e.paths), moved: false }; drawOverlay(); return true;
  }
  if (id === e.id) {
    const hit = V.nearest(e.paths, p.x - e.x, p.y - e.y);
    if (hit && hit.d * cam.z < 10) {
      const ni = V.splitSegment(e.paths, hit.si, hit.i, hit.t); vedit.nodes = new Set([hit.si + ':' + ni]);
      mode = { k: 'vnode', e, p, start: clone(e.paths), moved: true }; draw(); drawOverlay(); return true;
    }
    vedit.nodes.clear(); drawOverlay(); return true;
  }
  exitVedit(); return false;
}
/** Node editing marks: the outline, every node, and handles on the selected nodes and their neighbors. */
function nodeMarks(e) {
  const k = 1 / cam.z, out = [s('path', { d: V.pathD(e.paths || [], e.x, e.y), fill: 'none', stroke: C.accent, 'stroke-width': 1.25 * k, 'pointer-events': 'none' })];
  const chosen = vedit.nodes, near = (si, i, len, closed) => [i - 1, i + 1].some(j => chosen.has(si + ':' + (closed ? (j + len) % len : j)));
  const hand = [], dots = [];
  (e.paths || []).forEach((sp, si) => sp.nodes.forEach((n, i) => {
    const key = si + ':' + i, on = chosen.has(key), x = e.x + n.x, y = e.y + n.y;
    if (on || near(si, i, sp.nodes.length, sp.closed)) for (const w of ['i', 'o']) if (n[w + 'x'] != null) {
      const hx = e.x + n[w + 'x'], hy = e.y + n[w + 'y'];
      hand.push(s('line', { x1: x, y1: y, x2: hx, y2: hy, stroke: C.accent, 'stroke-width': k, 'pointer-events': 'none' }),
        s('circle', { 'data-vh': key + ':' + w, cx: hx, cy: hy, r: 3.5 * k, fill: '#ffffff', stroke: C.accent, 'stroke-width': 1.25 * k, style: 'cursor:pointer' }));
    }
    dots.push(s('rect', { 'data-vn': key, x: x - 3.5 * k, y: y - 3.5 * k, width: 7 * k, height: 7 * k, rx: n.ix != null || n.ox != null ? 3.5 * k : k, fill: on ? C.accent : '#ffffff', stroke: C.accent, 'stroke-width': 1.25 * k, style: 'cursor:move' }));
  }));
  return s('g', null, out, hand, dots);
}
const vectorable = e => !e.locked && (['rect', 'ellipse', 'diamond'].includes(e.type) || (e.type === 'pen' && !e.hl && (e.pts || []).length > 1));
/** Text inside a shape that is being turned into a vector stays on the board as its own text piece. */
function liftText(e) {
  if (e.type === 'pen' || e.type === 'path' || !e.text || !e.text.trim() || !TEXTY.includes(e.type)) return;
  const tx = { id: uid('e'), type: 'text', z: topZ() + 1, x: e.x + 8, y: e.y, w: Math.max(40, e.w - 16), h: 30, text: e.text, align: 'center' };
  for (const key of ['font', 'weight', 'size', 'italic', 'color', 'rot']) if (e[key] != null) tx[key] = e[key];
  tx.size = tx.size || G.textStyle(e).size; fitText(tx); tx.y = Math.round(e.y + e.h / 2 - tx.h / 2);
  board.els[tx.id] = tx;
}
/** The look a combined vector takes from the bottom piece it was made from. */
function styleFrom(base) {
  if (base.type === 'path') { const o = {}; for (const k of ['fill', 'stroke', 'sw', 'dash']) if (base[k] != null) o[k] = base[k]; return o; }
  if (base.type === 'pen') return { stroke: base.stroke, sw: base.sw || 2.5 };
  if (base.type === 'sticky') return { fill: base.fill || FILLS[0], stroke: 'none' };
  if (['rect', 'ellipse', 'diamond'].includes(base.type)) return { fill: base.fill || '#ffffff', stroke: base.stroke || outlineFor(base.fill, 'light'), sw: 1.5 };
  return { fill: '#ffffff', stroke: outlineFor('#ffffff', 'light'), sw: 1.5 };
}
const boolPieces = () => panelEls().filter(e => !e.locked && (B.BOOLEABLE.has(e.type) || (e.type === 'pen' && !e.hl))).sort((a, b) => a.z - b.z);
/** Replaces pieces with one vector, moving connectors that were attached to them onto it. */
function replaceWith(list, e) {
  const ids = new Set(list.map(x => x.id));
  for (const x of list) if (x.live) for (const d of LB.descendantsOf(board.els, x.id)) delete board.els[d.id];
  list.forEach(liftText);
  for (const x of list) delete board.els[x.id];
  if (e) { board.els[e.id] = e; for (const c of all()) if (c.type === 'conn') { if (ids.has(c.a)) c.a = e.id; if (ids.has(c.b)) c.b = e.id; } }
  else for (const c of all()) if (c.type === 'conn' && (ids.has(c.a) || ids.has(c.b))) delete board.els[c.id];
  sel = new Set(e ? [e.id] : []);
}
/**
 * Union, subtract, intersect, or exclude the selected shapes. The result is live: the shapes stay
 * inside it as operands and it updates as they change. Subtract cuts the upper pieces out of the
 * bottom one. With one live result selected, this switches its operation instead.
 */
function boolOp(op) {
  if (editing) endEdit(); vedit = null;
  const one = liveOne();
  if (one) { if (one.live !== op) { one.live = op; commit(); } return; }
  const list = boolPieces(); if (list.length < 2) return toast('Select two or more shapes to combine.');
  const subs = LB.liveGeometry(op, list);
  if (!subs.length) return toast(op === 'intersect' ? 'Those shapes do not overlap, so nothing would be left.' : 'Nothing would be left after ' + B.BOOL_LABELS[op].toLowerCase() + '.');
  const base = list[0], g = uid('g'), ids = new Set(list.map(x => x.id));
  const r = { id: uid('e'), type: 'path', z: base.z, x: 0, y: 0, w: 0, h: 0, live: op, rule: 'evenodd', g, ...styleFrom(base) };
  if (!r.fill || r.fill === 'none') r.fill = '#ffffff';
  V.setWorldPaths(r, subs);
  for (const e of list) { e.boolIn = r.id; for (const d of withKids(e.id)) E(d).g = g; }
  board.els[r.id] = r;
  for (const c of all()) if (c.type === 'conn') { if (ids.has(c.a)) c.a = r.id; if (ids.has(c.b)) c.b = r.id; }
  sel = new Set(group(r.id)); commit();
}
/**
 * Position fields on a boolean move, scale (keeping proportions), or turn the shapes inside it; the
 * result follows on the next draw.
 */
function liveEdit(r, how, a, b) {
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  for (const k of LB.descendantsOf(board.els, r.id)) {
    const o = clone(k);
    if (how === 'move') { k.x += a; k.y += b; }
    else if (how === 'scale') Object.assign(k, G.scaleEl(o, r.x, r.y, a));
    else if (a) { delete k.rot; Object.assign(k, G.rotateEl(o, cx, cy, a)); }
  }
  liveSeen.delete(r.id);
  LB.syncLive(board.els, liveSeen);
}
/** Bakes a live result into a plain vector (Flatten on a boolean). */
function bakeLive(r) {
  LB.bake(board.els, r.id);
  if (r.g && !all().some(x => x !== r && x.g === r.g)) delete r.g;
}
/** Joins the selected pieces into one vector without merging their shapes. */
function flattenSel() {
  if (editing) endEdit(); vedit = null;
  const one = liveOne();
  if (one) { bakeLive(one); sel = new Set([one.id]); commit(); return; }
  const list = boolPieces(); if (!list.length) return;
  const subs = list.flatMap(e => B.outlineOf(e)); if (!subs.length) return;
  const base = list[0], e = { id: list.length === 1 ? base.id : uid('e'), type: 'path', z: base.z, x: 0, y: 0, w: 0, h: 0, ...styleFrom(base) };
  if (base.g) e.g = base.g;
  V.setWorldPaths(e, subs); replaceWith(list, e); commit();
}
/** Turns strokes into filled shapes. A filled vector keeps its fill and gets its outline as a separate piece. */
function outlineStroke() {
  if (editing) endEdit(); vedit = null;
  const list = panelEls().filter(e => !e.locked && strokable(e)); if (!list.length) return;
  list.forEach(e => { if (e.live) bakeLive(e); });
  const made = [];
  for (const e of list) {
    const width = e.type === 'pen' ? e.sw || 2.5 : e.sw ?? 2, color = e.stroke && e.stroke !== 'none' ? e.stroke : '#1d2530';
    let subs, exact = null;
    try {
      if (e.type === 'pen' && shaped(e.brush)) { const sp = B.refitRing(brushOutline(e.pts, e.sw || BRUSHES[e.brush].width, e.brush).map(q => [e.x + q[0], e.y + q[1]])); subs = sp ? [sp] : []; }
      else {
        // A width profile outlines as its tapered shape; otherwise the engine outlines the even stroke.
        if (e.type === 'path' && e.profile) subs = V.worldPaths(e).map(sp => B.refitRing(profileOutline(V.flatten(sp, 0.75), width, e.profile))).filter(Boolean);
        else exact = X.outlineStroke(B.outlineOf(e), width, e.type === 'path' ? e.cap || 'round' : 'round', e.type === 'path' ? e.join || 'round' : 'round');
        subs = exact || B.subsOfRegion(B.strokeRegion(B.outlineOf(e), width, 0.75));
      }
    } catch (err) { continue; }
    if (!subs.length) continue;
    // The engine's outlines overlap where a stroke crosses itself, so they fill nonzero.
    const o = { id: uid('e'), type: 'path', z: e.z, x: 0, y: 0, w: 0, h: 0, fill: color, stroke: 'none' };
    if (!exact) o.rule = 'evenodd';
    V.setWorldPaths(o, subs);
    if (e.type === 'pen' && shaped(e.brush) && e.rot) o.rot = e.rot;
    if (e.type === 'path' && e.fill && e.fill !== 'none') { e.stroke = 'none'; o.z = topZ() + 1; const g = e.g || uid('g'); e.g = o.g = g; board.els[o.id] = o; made.push(e.id, o.id); }
    else { o.id = e.id; if (e.g) o.g = e.g; board.els[e.id] = o; made.push(o.id); }
  }
  sel = new Set(made); commit();
}
const strokable = e => (e.type === 'path' && e.stroke !== 'none') || (e.type === 'pen' && !e.hl);
const pathSel = () => panelEls().filter(e => !e.locked && e.type === 'path');
const allClosed = e => (e.paths || []).length > 0 && e.paths.every(sp => sp.closed);
/**
 * Simplify, Smooth, and Offset adjust live, as in Illustrator: every value is applied to the shapes as
 * they were when adjusting began, so the board previews each step. Apply (Enter) keeps the result as
 * one undo step; Cancel (Esc) puts the shapes back. A live boolean is flattened first, and that is
 * undone by Cancel too. Rotated vectors stay where they are.
 */
const ADJ = {
  simplify: { label: 'Simplify', start: 50, left: 'Fewer nodes', right: 'More detail', run: (subs, v) => X.simplify(subs, X.simplifyTolerance(v)) },
  smooth: { label: 'Smooth', start: 50, left: 'Gentle', right: 'Strong', run: (subs, v) => X.smooth(subs, v) },
  offset: { run: (subs, v) => (v ? X.offset(subs, v, offsetJoin) : null) },
};
const CORNERS = [['round', 'Round join'], ['miter', 'Miter join'], ['bevel', 'Bevel join']];
let adj = null, adjRaf = 0, adjNext = null, offsetJoin = 'round';
const nodeCount = list => list.reduce((a, e) => a + (e.paths || []).reduce((b, sp) => b + sp.nodes.length, 0), 0);
const selKey = () => [...sel].sort().join();
function adjBegin(kind) {
  if (adj && adj.kind === kind) return true;
  if (adj) adjEnd(true);
  if (editing) endEdit(); vedit = null;
  const list = pathSel().filter(e => kind !== 'offset' || e.live || allClosed(e)); if (!list.length) return false;
  const baked = [];
  for (const e of list) if (e.live) { baked.push({ id: e.id, live: e.live, g: e.g, kids: LB.descendantsOf(board.els, e.id).map(clone) }); bakeLive(e); }
  adj = { kind, key: selKey(), baked, ids: list.map(e => e.id), before: nodeCount(list), value: kind === 'offset' ? 0 : ADJ[kind].start,
    snap: new Map(list.map(e => [e.id, clone({ x: e.x, y: e.y, w: e.w, h: e.h, vw: e.vw, vh: e.vh, paths: e.paths })])) };
  return true;
}
function adjApply(v) {
  if (!adj) return;
  adj.value = v;
  for (const id of adj.ids) {
    const e = board.els[id]; if (!e) continue;
    Object.assign(e, clone(adj.snap.get(id)));
    const out = ADJ[adj.kind].run(V.worldPaths(e), v);
    if (out && out.length) V.placeWorldPaths(e, out);
  }
  draw();
  const n = $('#adj-n'); if (n) n.textContent = `${nodeCount(adj.ids.map(E).filter(Boolean))} of ${adj.before} nodes`;
}
/** Slider moves are applied once per frame, so dragging stays smooth on big paths. */
function adjQueue(v) {
  adjNext = v;
  if (!adjRaf) adjRaf = requestAnimationFrame(() => { adjRaf = 0; adjApply(adjNext); });
}
function adjEnd(keep) {
  if (!adj) return;
  if (adjRaf) { cancelAnimationFrame(adjRaf); adjRaf = 0; adjApply(adjNext); }
  const a = adj; adj = null;
  if (keep) { holdCommit(); return; }
  for (const [id, snap] of a.snap) if (board.els[id]) Object.assign(board.els[id], snap);
  for (const b of a.baked) { const e = board.els[b.id]; if (!e) continue; e.live = b.live; if (b.g) e.g = b.g; for (const k of b.kids) board.els[k.id] = k; }
  draw();
}
/** Opens the Simplify or Smooth slider and previews its starting value. */
function adjOpen(kind) {
  if (!adjBegin(kind)) return;
  adjApply(adj.value); renderProps();
  const r = $('#adj-range'); if (r) { r.focus({ preventScroll: true }); r.closest('.adj').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
}
function adjFinish(keep) { adjEnd(keep); renderProps(); }
function adjuster() {
  const d = ADJ[adj.kind];
  return h('div', { class: 'adj' },
    h('div', { class: 'adj-h' }, h('span', null, d.label), h('span', { class: 'adj-n', id: 'adj-n' }, `${nodeCount(adj.ids.map(E).filter(Boolean))} of ${adj.before} nodes`)),
    h('input', { type: 'range', id: 'adj-range', min: 0, max: 100, step: 1, value: adj.value, style: `--fill:${adj.value}%`, 'aria-label': d.label + ' amount', oninput: ev => { ev.target.style.setProperty('--fill', ev.target.value + '%'); adjQueue(Number(ev.target.value)); },
      onkeydown: ev => { if (ev.key === 'Enter' || ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); adjFinish(ev.key === 'Enter'); } } }),
    h('div', { class: 'adj-l' }, h('span', null, d.left), h('span', null, d.right)),
    h('div', { class: 'grid2' }, h('button', { class: 'fbtn', onclick: () => adjFinish(false) }, 'Cancel'), h('button', { class: 'fbtn primary', onclick: () => adjFinish(true) }, 'Apply')));
}
function offsetField() {
  const ok = pathSel().every(e => e.live || allClosed(e));
  const title = ok ? 'Grow the shape by a distance, or shrink it with a negative one. Arrow keys step by 1 (Shift for 10).' : 'Offset works on closed shapes';
  const val = el => { const v = parseFloat(String(el.value).replace(/[^0-9.\-]/g, '')); return Number.isFinite(v) ? v : 0; };
  const go = v => { if (adjBegin('offset')) adjApply(v); };
  const inp = h('input', { type: 'text', inputmode: 'decimal', id: 'vec-offset', value: adj && adj.kind === 'offset' ? String(adj.value) : '0', 'aria-label': 'Offset', disabled: !ok,
    oninput: ev => go(val(ev.target)),
    onkeydown: ev => {
      if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') { ev.preventDefault(); const v = r2(val(ev.target) + (ev.key === 'ArrowUp' ? 1 : -1) * (ev.shiftKey ? 10 : 1)); ev.target.value = String(v); go(v); }
      else if (ev.key === 'Enter') ev.target.blur();
      else if (ev.key === 'Escape') { ev.stopPropagation(); ev.target.value = '0'; adjEnd(false); ev.target.blur(); }
    },
    onblur: ev => { if (adj && adj.kind === 'offset') adjEnd(true); ev.target.value = '0'; } });
  return [h('label', { class: 'field' + (ok ? '' : ' off'), title }, h('span', null, 'Offset'), inp),
    h('select', { class: 'sel', id: 'vec-offset-join', 'aria-label': 'Offset corners', title: 'Corners made by offset', disabled: !ok, onchange: ev => { offsetJoin = ev.target.value; if (adj && adj.kind === 'offset') adjApply(adj.value); } },
      CORNERS.map(([v, l]) => h('option', { value: v, selected: v === offsetJoin }, l)))];
}
/** One Vector section for everything that reshapes paths: node editing, path tools, and conversion. */
function vectorSection(free, one, num) {
  const paths = free.filter(e => e.type === 'path'), solo = one && one.type === 'path' && !one.locked && !one.live ? one : null;
  const canStroke = free.some(strokable), canConvert = free.some(vectorable), exact = PO.ready() && paths.length > 0;
  if (!paths.length && !canStroke && !canConvert) return null;
  const btn = (label, title, fn, extra) => h('button', { class: 'fbtn', title, onclick: fn, ...extra }, label);
  const kids = [];
  if (solo) {
    const subs = solo.paths || [], n = subs.reduce((a, sp) => a + sp.nodes.length, 0);
    kids.push(h('div', { class: 'grid2' },
      btn(vedit ? 'Done editing' : 'Edit nodes', 'Reshape node by node (Enter)', () => vedit ? exitVedit() : enterVedit(solo.id), { 'aria-pressed': String(!!vedit) }),
      subs.length === 1 ? btn('Closed shape', 'Join the last node to the first', () => { if (subs[0].closed) delete subs[0].closed; else subs[0].closed = true; fitPath(solo); commit(); }, { 'aria-pressed': String(!!subs[0].closed) }) : h('span')));
    kids.push(h('p', { class: 'hint' }, `${n} nodes${subs.length > 1 ? ' in ' + subs.length + ' parts' : ''}. ` + (vedit ? 'Drag nodes and handles. Click the outline to add a node; double-click a node to switch corner and smooth.' : 'Double-click the vector or press Enter to reshape it.')));
  }
  if (exact) {
    const open = adj && adj.kind !== 'offset' ? adj.kind : null;
    kids.push(h('div', { class: 'grid2' },
      btn('Simplify', 'Fewer nodes, same outline', () => open === 'simplify' ? adjFinish(true) : adjOpen('simplify'), { 'aria-pressed': String(open === 'simplify') }),
      btn('Smooth', 'Even out bumps and jags', () => open === 'smooth' ? adjFinish(true) : adjOpen('smooth'), { 'aria-pressed': String(open === 'smooth') })));
    if (open) kids.push(adjuster());
    kids.push(h('div', { class: 'grid2' }, offsetField()));
  }
  const tools = [];
  if (canStroke) tools.push(btn('Outline stroke', 'Turn the stroke into a filled shape you can edit and combine (Ctrl+Shift+O)', outlineStroke));
  if (canConvert) tools.push(btn('Convert to vector', 'Turn shapes and drawings into paths you can reshape node by node', () => toVector(free)));
  if (tools.length) kids.push(h('div', { class: 'grid2' }, tools));
  return h('section', { class: 'psec' }, h('h3', null, 'Vector'), ...kids);
}
/**
 * The bottom selected piece becomes a mask: it is no longer drawn and the other selected pieces are
 * clipped to its outline. They are grouped so they move together.
 */
function useAsMask() {
  if (editing) endEdit(); vedit = null;
  const list = selEls().filter(e => !e.locked && e.type !== 'conn').sort((a, b) => a.z - b.z);
  if (list.length < 2) return toast('Select the mask shape and the pieces to clip. The bottom one becomes the mask.');
  const [m, ...rest] = list;
  if (!B.BOOLEABLE.has(m.type) && m.type !== 'pen') return toast('The bottom piece needs to be a shape or vector to act as a mask.');
  if (m.type !== 'path') toVector([m]);
  const mask = E(m.id); mask.masking = true; delete mask.mask;
  const g = uid('g'); mask.g = g;
  for (const e of rest) { e.mask = mask.id; e.g = g; }
  commit();
}
function releaseMask() {
  const list = selEls(), ids = new Set(list.filter(e => e.masking).map(e => e.id).concat(list.map(e => e.mask).filter(Boolean)));
  for (const e of all()) { if (ids.has(e.id)) delete e.masking; if (e.mask && ids.has(e.mask)) delete e.mask; }
  commit();
}
let paintSel = null;
/** Stores a path's fill layers, collapsing to a plain fill when one solid color is left. */
function setFills(e, list) {
  if (!list.length) { delete e.fills; e.fill = 'none'; }
  else if (list.length === 1 && !PT.isGrad(list[0])) { delete e.fills; e.fill = list[0] || '#ffffff'; }
  else { e.fills = list; e.fill = PT.colorOf(list[0]); }
}
/** Stores a path's stroke layers, collapsing to a plain stroke when one solid color is left. */
function setStrokes(e, list) {
  if (!list.length) { delete e.strokes; e.stroke = 'none'; }
  else if (list.length === 1 && !PT.isGrad(list[0].paint)) { delete e.strokes; if (list[0].paint) e.stroke = list[0].paint; else delete e.stroke; e.sw = list[0].width; }
  else { e.strokes = list; e.stroke = PT.colorOf(list[0].paint) || undefined; if (!e.stroke) delete e.stroke; e.sw = list[0].width; }
}
const hex6 = c => /^#[0-9a-f]{6}$/i.test(c || '') ? c : '#1d2530';
/** Stacked fills or strokes for one vector, with an editor for the chosen layer: solid or gradient, stops, angle, width. */
function layerEditor(e, kind, num) {
  const isFill = kind === 'fill', list = isFill ? PT.fillLayers(e).slice() : PT.strokeLayers(e).map(l => ({ ...l }));
  const paintOf = i => isFill ? list[i] : list[i] && list[i].paint, store = () => isFill ? setFills(e, list) : setStrokes(e, list);
  const put = (i, p) => { if (isFill) list[i] = p; else list[i].paint = p; store(); };
  const chosen = paintSel && paintSel.id === e.id && paintSel.k === kind && paintSel.i < list.length ? paintSel.i : -1;
  const label = p => PT.isGrad(p) ? (p.kind === 'radial' ? 'Radial gradient' : 'Linear gradient') : (p || 'Default').toUpperCase();
  const rows = list.length > 1 || PT.isGrad(paintOf(0) || '') || chosen >= 0 ? list.map((_, i) => h('div', { class: 'lrow' + (chosen === i ? ' on' : ''), role: 'button', tabindex: '0', onclick: () => { paintSel = chosen === i ? null : { id: e.id, k: kind, i }; renderProps(); } },
      h('span', { class: 'lchip', style: 'background:' + PT.cssOf(paintOf(i), C.ink) }), h('span', { class: 'lname' }, label(paintOf(i)) + (isFill ? '' : ` · ${list[i].width} px`)),
      h('button', { class: 'lx', title: 'Remove this layer', 'aria-label': 'Remove this layer', onclick: ev => { ev.stopPropagation(); list.splice(i, 1); store(); paintSel = null; commit(); } }, icon('M5 5l10 10M15 5L5 15', 12)))).reverse() : [];
  let editor = null;
  if (chosen >= 0) {
    const p = paintOf(chosen), g = PT.isGrad(p) ? p : null;
    const setKind = k => { const base = PT.colorOf(p) || C.ink; put(chosen, k === 'solid' ? base : g ? { ...g, kind: k } : PT.gradientFrom(hex6(base), k)); commit(); };
    const colorIn = (val, fn, label2) => h('input', { type: 'color', class: 'cin', value: hex6(val), 'aria-label': label2, oninput: ev => { fn(ev.target.value); draw(); }, onchange: () => holdCommit() });
    editor = h('div', { class: 'peditor' },
      h('div', { class: 'seg', role: 'group', 'aria-label': 'Paint type' }, [['solid', 'Solid'], ['linear', 'Linear'], ['radial', 'Radial']].map(([k, l]) => h('button', { 'aria-pressed': String(g ? g.kind === k : k === 'solid'), onclick: () => setKind(k) }, l))),
      !g ? h('div', { class: 'row' }, colorIn(p, v => put(chosen, v), 'Color'), h('span', { class: 'hint' }, 'Any color')) : [
        g.kind === 'linear' ? num('grad-angle', 'Angle', 'Gradient angle in degrees', () => Math.round(g.angle) + '°', v => put(chosen, PT.byAngle(g, ((Math.round(v) % 360) + 360) % 360))) : null,
        ...g.stops.map(([o, col], si) => h('div', { class: 'stop' },
          colorIn(col, v => { const st = g.stops.map(x => [...x]); st[si][1] = v; put(chosen, { ...g, stops: st }); }, `Stop ${si + 1} color`),
          num('grad-stop-' + si, 'At', `Stop ${si + 1} position in percent`, () => Math.round(o * 100) + '%', v => { const st = g.stops.map(x => [...x]); st[si][0] = Math.max(0, Math.min(1, v / 100)); put(chosen, { ...g, stops: st }); }),
          h('button', { class: 'lx', disabled: g.stops.length <= 2, title: 'Remove stop', 'aria-label': 'Remove stop', onclick: () => { put(chosen, PT.removeStop(g, si)); commit(); } }, icon('M5 5l10 10M15 5L5 15', 12)))),
        h('button', { class: 'fbtn', onclick: () => { put(chosen, PT.addStop(g)); commit(); } }, 'Add stop')],
      isFill ? null : num('stroke-w-' + chosen, 'Width', 'Stroke width', () => String(list[chosen].width), v => { list[chosen].width = Math.max(0.25, Math.min(200, v)); store(); }));
  }
  return [h('div', { class: 'layers' }, rows), editor,
    h('div', { class: 'row' },
      h('button', { class: 'fbtn', onclick: () => { const top = list.length ? paintOf(list.length - 1) : (isFill ? '#ffffff' : ''); const np = PT.gradientFrom(hex6(PT.colorOf(top) || '#2447d6')); if (isFill) list.push(np); else list.push({ paint: np, width: list.length ? list[list.length - 1].width + 4 : 2 }); store(); paintSel = { id: e.id, k: kind, i: list.length - 1 }; commit(); } }, isFill ? 'Add fill' : 'Add stroke'),
      list.length === 1 && chosen < 0 && !PT.isGrad(paintOf(0)) ? h('button', { class: 'fbtn', title: 'Gradient or custom color', onclick: () => { paintSel = { id: e.id, k: kind, i: 0 }; renderProps(); } }, 'Gradient or color') : null)];
}
/** Small two-square pictures for the combine buttons, filled where the result has area. */
function boolIcon(op) {
  const A = 'M3 3h10v10H3z', Bq = 'M7 7h10v10H7z', line = { fill: 'none', stroke: 'currentColor', 'stroke-width': 1.2 };
  const fill = { union: s('path', { d: 'M3 3h10v4h4v10H7v-4H3z', fill: 'currentColor' }), subtract: s('path', { d: 'M3 3h10v4H7v6H3z', fill: 'currentColor' }),
    intersect: s('path', { d: 'M7 7h6v6H7z', fill: 'currentColor' }), exclude: s('path', { d: 'M3 3h10v10H3zM7 7h10v10H7z', fill: 'currentColor', 'fill-rule': 'evenodd' }) }[op];
  return s('svg', { width: 18, height: 18, viewBox: '0 0 20 20', 'aria-hidden': 'true' }, s('g', { opacity: 0.32 }, fill), fill.cloneNode(true), s('path', { d: A, ...line }), s('path', { d: Bq, ...line, 'stroke-dasharray': op === 'subtract' ? '2 1.6' : null }));
}
/** Turns shapes and drawings into vector paths in place, keeping their id, layer, colors, and rotation. */
function toVector(list) {
  if (editing) endEdit();
  for (const o of list) {
    const e = E(o.id); if (!e || !vectorable(e)) continue;
    const subs = e.type === 'rect' ? V.rectPath(e.w, e.h, Math.min(10, e.w / 4, e.h / 4)) : e.type === 'ellipse' ? V.ellipsePath(e.w, e.h) : e.type === 'diamond' ? V.diamondPath(e.w, e.h) : [V.smoothThrough(V.simplify(e.pts, 1.2))];
    const nv = { id: e.id, type: 'path', z: e.z, x: e.x, y: e.y, w: e.w, h: e.h };
    for (const key of ['rot', 'g', 'dash']) if (e[key] != null) nv[key] = e[key];
    // Brush and pencil strokes are shaped by pressure, so they become filled outlines and keep that shape.
    if (e.type === 'pen' && shaped(e.brush)) { const ring = B.refitRing(brushOutline(e.pts, e.sw || BRUSHES[e.brush].width, e.brush)); if (ring) subs.splice(0, subs.length, ring); nv.fill = e.stroke || '#17202d'; nv.stroke = 'none'; }
    else if (e.type === 'pen') { if (e.stroke) nv.stroke = e.stroke; nv.sw = e.sw || 2.5; }
    else { nv.fill = e.fill || '#ffffff'; nv.stroke = e.stroke || outlineFor(e.fill, 'light'); nv.sw = 1.5; }
    const rot = nv.rot; delete nv.rot;
    V.setWorldPaths(nv, V.mapPaths(subs, (x, y) => [e.x + x, e.y + y]));
    if (rot) nv.rot = rot;
    liftText(e);
    board.els[e.id] = nv;
  }
  commit();
}

/* ---------- Slides and presenting ---------- */
/** The page's theme, for new slides and theme swatches. */
const deckTheme = () => DK.pageTheme(board.els);
/** The slides to present: this page's, or every page's in page order. */
function deckOf(scope) {
  if (!board) return [];
  const pages = scope === 'all' ? board.pages : board.pages.filter(p => p.id === board.page);
  return pages.flatMap(p => SL.slidesOf(p.els).map(f => ({ page: p, els: p.els, f })));
}
/** A slide as an SVG: its background and everything overlapping it, clipped to the frame, in the light look. */
function slideSvg(els, f, attrs = {}) {
  const get = id => els[id], rc = { ...rctx(true, els), get };
  return s('svg', { viewBox: `${f.x} ${f.y} ${f.w} ${f.h}`, preserveAspectRatio: 'xMidYMid meet', 'aria-hidden': 'true', ...attrs },
    s('rect', { x: f.x, y: f.y, width: f.w, height: f.h, fill: f.fill || '#ffffff' }),
    footFn(f).map(p => renderEl(p, rc)),
    SL.slideMembers(els, f, get).sort(byLayer).map(e => renderEl(e, rc)));
}
function addSlide(layout) {
  if (editing) endEdit();
  const last = SL.slidesOf(board.els).at(-1), size = (last && SL.sizeOf(last)) || 'wide';
  const made = SL.newSlide(board.els, E, layout, size, uid, topZ() + 1);
  for (const e of made) board.els[e.id] = e;
  sel = new Set([made[0].id]); commit(); fit([made[0]]);
}
function layoutMenu(anchor) {
  popup(anchor, [{ head: 'New slide' }, ...Object.entries(DK.LAYOUTS).map(([k, v]) => [v.label, () => addSlide(k), '', v.icon]), '-', ['Open a PowerPoint file', () => pickPptx(), '', 'M5 3h7l4 4v10H5zM12 3v4h4M8 11h2.5a1.5 1.5 0 0 1 0 3H8v-5v8']]);
}
/** Lays a slide out again from a layout: content moves into the new placeholders. */
function relayout(f, key) {
  if (editing) endEdit();
  DK.applyLayout(board.els, f, key, E, uid, topZ() + 1);
  // A slide still named after its layout takes the new layout's name.
  if (Object.values(DK.LAYOUTS).some(l => l.label === f.text)) f.text = DK.LAYOUTS[key].label;
  commit();
}
function changeLayoutMenu(anchor, f) {
  popup(anchor, [{ head: 'Layout' }, ...Object.entries(DK.LAYOUTS).map(([k, v]) => [v.label, () => relayout(f, k), f.layout === k ? 'cur' : '', v.icon])]);
}
/** Switches every slide on the page to a theme; theme-linked colors and fonts follow. */
function setDeckTheme(id) { if (editing) endEdit(); DK.applyTheme(board.els, id); commit(); }
let themesOpen = false;
/** The theme picker: a small slide in each theme's background, heading color, font, and accents. */
function themeGrid() {
  const cur = deckTheme().id;
  return h('div', { class: 'dthemes', role: 'group', 'aria-label': 'Deck themes' }, DK.THEMES.map(t => h('button', {
    class: 'dtheme', 'aria-pressed': String(t.id === cur), title: `${t.name}: ${t.major} and ${t.minor}`, onclick: () => setDeckTheme(t.id) },
    h('span', { class: 'dt-art', style: `background:${t.colors.lt1};color:${t.colors.dk2};font-family:${(FONTS[t.majorKey] || FONTS.sans).stack}` },
      h('span', { class: 'dt-aa' }, 'Aa'),
      h('span', { class: 'dt-acc' }, ['accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'].map(k => h('i', { style: 'background:' + t.colors[k] })))),
    h('span', { class: 'dt-name' }, t.name))));
}
function presentMenu(anchor) {
  const here = deckOf('page').length, every = deckOf('all').length;
  if (every > here && here) popup(anchor, [{ head: 'Present' }, ['This page', () => present(0, 'page'), '', MI.image], ['All pages', () => present(0, 'all'), '', MI.tpl]]);
  else present(0, here ? 'page' : 'all');
}
let slideDrag = null;
function renderSlides() {
  const el = $('#pslides'); if (!el || rightTab !== 'slides') return;
  const list = SL.slidesOf(board.els), frames = all().filter(e => e.type === 'frame' && !e.slide);
  const head = h('div', { class: 'shead' },
    h('div', { class: 'shead-t' }),
    h('button', { class: 'fbtn', 'aria-haspopup': 'menu', onclick: e => layoutMenu(e.currentTarget) }, icon('M10 4.5v11M4.5 10h11', 14), 'New slide'),
    h('button', { class: 'btn primary sm', disabled: !deckOf('all').length, onclick: e => presentMenu(e.currentTarget) }, icon('M7 4.5l8.5 5.5L7 15.5z', 12, { fill: 'currentColor', stroke: 'none' }), 'Present'));
  const th = deckTheme(), themeBar = list.length ? h('div', { class: 'stheme' },
    h('button', { class: 'fbtn stheme-btn', 'aria-expanded': String(themesOpen), onclick: () => { themesOpen = !themesOpen; renderSlides(); } },
      h('span', { class: 'stheme-dots', 'aria-hidden': 'true' }, ['lt1', 'dk2', 'accent1', 'accent2'].map(k => h('i', { style: 'background:' + th.colors[k] }))),
      h('span', null, 'Theme'), h('strong', null, th.name), icon(themesOpen ? 'M5 12.5l5-5 5 5' : 'M5 7.5l5 5 5-5', 12)),
    themesOpen ? themeGrid() : null) : null;
  if (!list.length) {
    el.replaceChildren(head, h('div', { class: 'sempty' },
      h('div', { class: 'sempty-art', 'aria-hidden': 'true' }, h('span'), h('span'), h('span')),
      h('p', null, 'Slides are frames on your board, so anything you sketch can become a deck. Add a slide from a layout, or select a frame and choose Use as slide.'),
      frames.length ? h('button', { class: 'fbtn', onclick: () => { frames.sort((a, b) => a.y - b.y || a.x - b.x).forEach(f => SL.setSlide(board.els, f, true)); commit(); } }, `Use all ${frames.length} frames as slides`) : null));
    return;
  }
  const dropAt = (ev, i) => { const r = ev.currentTarget.getBoundingClientRect(); return ev.clientY > r.top + r.height / 2 ? i + 1 : i; };
  el.replaceChildren(head, themeBar, h('div', { class: 'slist' }, list.map((f, i) => h('div', {
      class: 'sitem' + (sel.has(f.id) ? ' on' : ''), draggable: 'true', tabindex: '0', 'aria-label': `Slide ${i + 1}, ${f.text || 'Untitled'}`,
      ondragstart: ev => { slideDrag = f.id; ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', f.id); ev.currentTarget.classList.add('drag'); },
      ondragend: ev => { slideDrag = null; ev.currentTarget.classList.remove('drag'); },
      ondragover: ev => { if (!slideDrag) return; ev.preventDefault(); const after = dropAt(ev, i) > i; ev.currentTarget.classList.toggle('before', !after); ev.currentTarget.classList.toggle('after', after); },
      ondragleave: ev => ev.currentTarget.classList.remove('before', 'after'),
      ondrop: ev => { ev.preventDefault(); ev.currentTarget.classList.remove('before', 'after'); if (!slideDrag) return; const from = list.findIndex(x => x.id === slideDrag); let to = dropAt(ev, i); if (from < to) to--; if (from !== to) { SL.moveSlide(board.els, slideDrag, to); commit(); } slideDrag = null; },
      onclick: () => { sel = new Set([f.id]); fit([f]); refresh(); },
      ondblclick: () => present(i),
      onkeydown: ev => { if (ev.key === 'Enter') present(i); else if ((ev.key === 'ArrowUp' || ev.key === 'ArrowDown') && ev.altKey) { ev.preventDefault(); SL.moveSlide(board.els, f.id, i + (ev.key === 'ArrowUp' ? -1 : 1)); commit(); } },
      oncontextmenu: ev => { ev.preventDefault(); sel = new Set([f.id]); refresh(); popupAt(ev.clientX, ev.clientY, [['Present from here', () => present(i), '', 'M7 4.5l8.5 5.5L7 15.5z'], ['PNG of this slide', () => exportSlidePng(board.els, f, i + 1), '', MI.image], '-',
        ['Move up', () => { SL.moveSlide(board.els, f.id, i - 1); commit(); }, '', MI.front], ['Move down', () => { SL.moveSlide(board.els, f.id, i + 1); commit(); }, '', MI.back], '-',
        ['Remove from slides', () => { SL.setSlide(board.els, f, false); commit(); }, 'danger', MI.out]]); } },
    h('span', { class: 'snum' }, String(i + 1)),
    h('div', { class: 'sbody' }, h('div', { class: 'sthumb', style: `aspect-ratio:${f.w}/${f.h}` }, slideSvg(board.els, f)), h('div', { class: 'sname' }, f.text || 'Untitled', f.notes ? h('span', { class: 'snote', title: 'Has presenter notes' }, 'Notes') : null))))),
    h('p', { class: 'hint shint' }, 'Drag to reorder, or Alt+Up and Alt+Down. Double-click to present from a slide.'));
}
/** The Slide section in a frame's properties. */
function slideSection(f, sec, swatch, themeSw) {
  const on = !!f.slide, sz = SL.sizeOf(f), n = SL.slidesOf(board.els).length, lay = DK.LAYOUTS[f.layout];
  const ft = f.foot || {};
  // Footer choices apply to every slide on the page, like Apply to All in PowerPoint.
  const setFoot = (key, val) => { for (const s2 of SL.slidesOf(board.els)) { const next = { ...(s2.foot || {}), [key]: val }; if (!val) delete next[key]; if (Object.keys(next).length) s2.foot = next; else delete s2.foot; } };
  return sec('Slide',
    h('div', { class: 'row' },
      h('button', { class: 'fbtn', 'aria-pressed': String(on), onclick: () => { SL.setSlide(board.els, f, !on); if (!on) { f.theme = deckTheme().id; } commit(); } }, on ? 'In slides' : 'Use as slide'),
      on ? h('span', { class: 'hint' }, `Slide ${f.slide} of ${n}`) : null),
    on ? [h('div', { class: 'f-label' }, 'Layout'),
      h('div', { class: 'row' },
        h('button', { class: 'fbtn grow', 'aria-haspopup': 'menu', onclick: e => changeLayoutMenu(e.currentTarget, f) }, icon(lay ? lay.icon : DK.LAYOUTS.blank.icon, 14), lay ? lay.label : 'Choose a layout'),
        h('button', { class: 'fbtn', title: 'Put placeholders back where the layout has them', disabled: !lay, onclick: () => relayout(f, f.layout) }, 'Reset'))] : null,
    h('div', { class: 'seg', role: 'group', 'aria-label': 'Slide size' }, Object.entries(SL.SLIDE_SIZES).map(([k, v]) =>
      h('button', { 'aria-pressed': String(sz === k), title: v.label + ` (${v.w} by ${v.h})`, onclick: () => { const keep = f.layout ? DK.placeholders(board.els, f, E) : null; f.w = v.w; f.h = v.h; if (keep) DK.applyLayout(board.els, f, f.layout, E, uid, topZ() + 1, keep); commit(); } }, v.label.split(' ')[1]))),
    h('div', { class: 'f-label' }, 'Background'),
    themeSw([f], 'fill'),
    h('div', { class: 'swatches' }, SL.SLIDE_BGS.map(([c, name]) => swatch(c, (f.fill || '') === c && !DK.linked(f, 'fill', deckTheme()), () => { f.fill = c; commit(); }, name)),
      h('button', { class: 'sw none', title: 'No background', 'aria-label': 'No background', 'aria-pressed': String(!f.fill), onclick: () => { delete f.fill; commit(); } })),
    on ? [h('div', { class: 'f-label' }, 'Footer on every slide'),
      h('div', { class: 'row' },
        h('button', { class: 'fbtn', 'aria-pressed': String(!!ft.num), onclick: () => { setFoot('num', !ft.num); commit(); } }, 'Slide number'),
        h('button', { class: 'fbtn', 'aria-pressed': String(!!ft.date), onclick: () => { setFoot('date', !ft.date); commit(); } }, 'Date')),
      h('input', { class: 'inp', type: 'text', placeholder: 'Footer text', 'aria-label': 'Footer text', value: ft.text || '', oninput: e => { setFoot('text', e.target.value); draw(); }, onchange: () => holdCommit() }),
      h('label', { class: 'f-label', for: 'slide-notes' }, 'Presenter notes'),
      h('textarea', { class: 'inp', id: 'slide-notes', placeholder: 'What to say on this slide', value: f.notes || '', oninput: e => { f.notes = e.target.value; }, onchange: () => holdCommit() }),
      h('button', { class: 'fbtn', onclick: () => present(SL.slidesOf(board.els).indexOf(f)) }, 'Present from this slide')] : null);
}

let show = null;
async function present(i = 0, scope = 'page') {
  if (editing) endEdit(); closeMenu();
  let deck = deckOf(scope); if (!deck.length) { deck = deckOf('all'); i = 0; }
  if (!deck.length) return toast('Add a slide first: open the Slides tab, or select a frame and choose Use as slide.');
  await loadImages(board.pages.flatMap(p => Object.values(p.els)));
  show = { deck, i: Math.max(0, Math.min(deck.length - 1, i)), presenter: false, t0: Date.now(), full: false, idle: 0 };
  const root = h('div', { class: 'present', id: 'present', role: 'dialog', 'aria-label': 'Presentation', tabindex: '-1', onmousemove: wake });
  document.body.append(root); root.focus();
  const fs = document.documentElement.requestFullscreen;
  if (fs) document.documentElement.requestFullscreen().then(() => { if (show) show.full = true; }).catch(() => {});
  show.timer = setInterval(() => { const tm = $('#pz-time'); if (tm) tm.textContent = clock(); }, 1000);
  renderShow(); wake();
}
const clock = () => { const s2 = Math.floor((Date.now() - show.t0) / 1000); return `${Math.floor(s2 / 60)}:${String(s2 % 60).padStart(2, '0')}`; };
function wake() { const r = $('#present'); if (!r) return; r.classList.add('awake'); clearTimeout(show.idle); show.idle = setTimeout(() => r.classList.remove('awake'), 2200); }
function goShow(d, abs) { if (!show) return; const n = abs != null ? abs : show.i + d; show.i = Math.max(0, Math.min(show.deck.length - 1, n)); renderShow(); }
function endShow() {
  if (!show) return; clearInterval(show.timer); clearTimeout(show.idle);
  const cur = show.deck[show.i]; show = null; const r = $('#present'); if (r) r.remove();
  if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
  if (cur && cur.page.id === board.page) { sel = new Set([cur.f.id]); refresh(); }
}
function renderShow() {
  const r = $('#present'); if (!r || !show) return;
  const { deck, i, presenter } = show, cur = deck[i], next = deck[i + 1];
  const btn = (label, d, fn, extra = {}) => h('button', { class: 'pz-btn', title: label, 'aria-label': label, onclick: e => { e.stopPropagation(); fn(); }, ...extra }, icon(d, 16));
  r.classList.toggle('pv', presenter);
  r.replaceChildren(
    h('div', { class: 'pz-stage', onclick: () => goShow(1) }, slideSvg(cur.els, cur.f, { class: 'pz-slide' })),
    presenter ? h('aside', { class: 'pz-side' },
      h('div', { class: 'pz-top' }, h('span', { class: 'pz-lab' }, 'Elapsed'), h('span', { class: 'pz-time', id: 'pz-time' }, clock())),
      h('div', { class: 'pz-lab' }, next ? 'Next' : 'Last slide'),
      next ? h('div', { class: 'pz-next', style: `aspect-ratio:${next.f.w}/${next.f.h}` }, slideSvg(next.els, next.f)) : h('div', { class: 'pz-end' }, 'End of presentation'),
      h('div', { class: 'pz-lab' }, 'Notes'),
      h('div', { class: 'pz-notes' + (cur.f.notes ? '' : ' none') }, cur.f.notes || 'No notes for this slide.')) : null,
    h('div', { class: 'pz-bar', onclick: e => e.stopPropagation() },
      btn('Previous slide', 'M12.5 4.5L7 10l5.5 5.5', () => goShow(-1), { disabled: i === 0 }),
      h('span', { class: 'pz-count' }, `${i + 1} / ${deck.length}`),
      btn('Next slide', 'M7.5 4.5L13 10l-5.5 5.5', () => goShow(1), { disabled: i === deck.length - 1 }),
      h('span', { class: 'pz-sep' }),
      h('button', { class: 'pz-btn wide' + (presenter ? ' on' : ''), title: 'Presenter view (P)', onclick: e => { e.stopPropagation(); show.presenter = !show.presenter; renderShow(); } }, 'Presenter view'),
      btn('Full screen (F)', 'M4 8V4h4M12 4h4v4M16 12v4h-4M8 16H4v-4', toggleFull),
      btn('Stop presenting (Esc)', 'M5 5l10 10M15 5L5 15', endShow)));
}
function toggleFull() { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().then(() => { if (show) show.full = true; }).catch(() => toast('Full screen is not available here.')); }
function showKey(ev) {
  const k = ev.key; let used = true;
  if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter', 'n', 'N'].includes(k)) goShow(1);
  else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(k)) goShow(-1);
  else if (k === 'Home') goShow(0, 0); else if (k === 'End') goShow(0, show.deck.length - 1);
  else if (k === 'Escape') endShow();
  else if (k === 'p' || k === 'P') { show.presenter = !show.presenter; renderShow(); }
  else if (k === 'f' || k === 'F') toggleFull();
  else used = false;
  if (used) { ev.preventDefault(); wake(); }
}
// Leaving full screen with the browser's own Esc also ends the presentation.
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && show && show.full) endShow(); });

/* ---------- Export ---------- */
/* ---------- PowerPoint files ---------- */
/** Picture bytes PowerPoint can open: PNG, JPEG, and GIF as stored; anything else (WebP) redrawn as PNG. */
async function pptxPicture(url) {
  const m = /^data:(image\/[\w+.-]+);base64,(.*)$/.exec(url || ''); if (!m) return undefined;
  const kind = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/gif': 'gif' }[m[1]];
  if (kind) return { bytes: Uint8Array.from(atob(m[2]), c => c.charCodeAt(0)), ext: kind };
  try {
    const bmp = await createImageBitmap(await (await fetch(url)).blob()), c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
    c.getContext('2d').drawImage(bmp, 0, 0);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    return { bytes: new Uint8Array(await blob.arrayBuffer()), ext: 'png' };
  } catch (e) { return undefined; }
}
/** Export as PowerPoint: the slides on this page, in deck order. */
async function exportPptx() {
  if (editing) endEdit();
  const slides = SL.slidesOf(board.els); if (!slides.length) return toast('Make a slide first: Slides tab, New slide.');
  const pics = new Map();
  for (const f of slides) for (const e of SL.slideMembers(board.els, f, E)) if (e.type === 'image' && e.src && !pics.has(e.src)) pics.set(e.src, await pptxPicture(images.get(e.src)));
  try {
    const bytes = await writePptx(board.els, E, { image: src => pics.get(src), today: DK.footDate(), title: meta(board.id).name });
    saveFile(fileName() + '.pptx', new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }), 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
  } catch (e) { toast('The PowerPoint file could not be made: ' + (e && e.message || e)); }
}
function pickPptx() {
  const inp = h('input', { type: 'file', accept: '.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation', style: 'display:none', onchange: async ev => { const f = ev.target.files[0]; inp.remove(); if (f) await importPptx(f); } });
  document.body.append(inp); inp.click();
}
/** Stores an imported picture the way added pictures are stored (shrunk to fit one storage document). */
async function storePicture(bytes, mime) {
  let url = '';
  try {
    const bmp = await createImageBitmap(new Blob([bytes], { type: mime }));
    let scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    for (let i = 0; i < 9; i++) { url = encodeImage(bmp, scale, mime !== 'image/jpeg'); if (url.length < 220000) break; scale *= 0.8; }
    if (url.length >= 220000) return null;
  } catch (e) { return null; }
  const id = uid('i'); images.set(id, url); Store.put('img_' + id, { url }); return id;
}
/** Open a PowerPoint file: its slides become JAM slides, side by side on a new page named after the file. */
async function importPptx(file) {
  if (!board) return;
  if (editing) endEdit();
  toast('Opening ' + file.name + '...');
  let deck;
  try { deck = await readPptx(await file.arrayBuffer()); } catch (e) { return toast('That file could not be opened: ' + (e && e.message || e)); }
  if (!deck.slides.length) return toast('That file has no slides.');
  const srcMap = new Map();
  for (const [src, img] of deck.images) srcMap.set(src, await storePicture(img.bytes, img.mime));
  const els = {}, gap = 160, W = Math.round(deck.w), H = Math.round(deck.h);
  let z = 1, lost = 0;
  deck.slides.forEach((sl, i) => {
    const fx = i * (W + gap), f = { id: uid('e'), type: 'frame', z: z++, x: fx, y: 0, w: W, h: H, slide: i + 1, text: sl.name || `Slide ${i + 1}`, fill: sl.fill || '#ffffff', theme: 'standard' };
    if (sl.notes) f.notes = sl.notes;
    els[f.id] = f;
    const groups = new Map();
    for (const e0 of sl.els) {
      const e = { ...e0, id: uid('e'), z: z++ };
      if (e.type === 'conn') { e.ax += fx; e.bx += fx; } else { e.x += fx; }
      if (e.g) { if (!groups.has(e.g)) groups.set(e.g, uid('g')); e.g = groups.get(e.g); }
      if (e.type === 'image') { const id = srcMap.get(e.src); if (!id) { lost++; continue; } e.src = id; }
      if (e.type === 'text' || e.type === 'sticky') fitText(e);
      els[e.id] = e;
    }
  });
  const pg = { id: uid('pg'), name: file.name.replace(/\.pptx$/i, ''), els };
  board.pages.push(pg); saveNow(); switchPage(pg.id);
  hist.reset(board.els); fit(); refresh();
  rightTab = 'slides'; renderRight();
  toast(`Opened ${deck.slides.length} slide${deck.slides.length === 1 ? '' : 's'}${lost ? `; ${lost} picture${lost === 1 ? '' : 's'} could not be stored` : ''}.`);
}
async function saveFile(name, data, mime) {
  const dl = window.claude && window.claude.use ? await window.claude.use('downloads') : null;
  if (dl) { try { await dl.save({ filename: name, data }); } catch (e) { if (!e || e.code !== 'declined') toast('Export failed. ' + ((e && e.message) || '')); } return; }
  const a = h('a', { href: URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type: mime })), download: name }); document.body.append(a); a.click(); a.remove();
}
const byLayer = (a, b) => (a.type === 'frame') === (b.type === 'frame') ? a.z - b.z : a.type === 'frame' ? -1 : 1;
/** One page (or a selection on it) as a standalone light-theme SVG string. */
function pageSvg(els, list) {
  const get = id => els[id], b = G.bounds(list, get); if (!b) return null;
  const pad = 36, w = Math.ceil(b.w + pad * 2), ht = Math.ceil(b.h + pad * 2), x = Math.floor(b.x - pad), y = Math.floor(b.y - pad), rc = { ...rctx(true, els), get };
  const svg = s('svg', { viewBox: `${x} ${y} ${w} ${ht}`, width: w, height: ht }, s('rect', { x, y, width: w, height: ht, fill: '#ffffff' }), [...list].sort(byLayer).map(e => renderEl(e, rc)));
  return { str: new XMLSerializer().serializeToString(svg), w, ht, x, y, svg };
}
/**
 * Every line of text in an export SVG, placed for the PDF's invisible text layer. `k` is points per
 * board unit. Rotated pieces keep their angle; each line is stretched to the width it has on screen.
 */
function textLayer(sv, k) {
  const out = [], H = sv.ht * k;
  for (const t of sv.svg.querySelectorAll('text')) {
    const size = parseFloat(t.getAttribute('font-size')) || 12, anchor = t.getAttribute('text-anchor') || 'start', weight = Number(t.getAttribute('font-weight')) || 400;
    const family = t.getAttribute('font-family') || G.FONT, italic = t.getAttribute('font-style') === 'italic';
    const g = t.closest('[data-id]'), m = g && /rotate\(([-\d.e]+) ([-\d.e]+) ([-\d.e]+)\)/.exec(g.getAttribute('transform') || '');
    const deg = m ? Number(m[1]) : 0, cx = m ? Number(m[2]) : 0, cy = m ? Number(m[3]) : 0, r = deg * Math.PI / 180;
    const spans = [...t.querySelectorAll('tspan')], lines = spans.length ? spans : [t];
    let y = parseFloat(t.getAttribute('y')) || 0;
    lines.forEach((sp, i) => {
      if (spans.length && i) y += parseFloat(sp.getAttribute('dy')) || 0;
      const str = (sp.textContent || '').replace(/\u00a0/g, ' ').trimEnd(); if (!str.trim()) return;
      const w = G.measure(str, size, weight, family, italic), hw = G.measure(str, size, 400, 'Helvetica, Arial, sans-serif', false) || w;
      let x = parseFloat(sp.getAttribute('x') ?? t.getAttribute('x')) || 0;
      if (anchor === 'middle') x -= w / 2; else if (anchor === 'end') x -= w;
      const px = deg ? cx + (x - cx) * Math.cos(r) - (y - cy) * Math.sin(r) : x, py = deg ? cy + (x - cx) * Math.sin(r) + (y - cy) * Math.cos(r) : y;
      out.push({ str, x: (px - sv.x) * k, y: H - (py - sv.y) * k, size: size * k, angle: -r, scale: Math.max(20, Math.min(300, w / hw * 100)) });
    });
  }
  return out;
}
/** Draw an SVG string onto a canvas, at up to 2x and never more than `max` pixels on a side. */
function rasterize(sv, max) {
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(new Blob([sv.str], { type: 'image/svg+xml' }));
    img.onload = () => {
      const k = Math.min(2, max / Math.max(sv.w, sv.ht)), c = document.createElement('canvas'); c.width = Math.max(1, Math.round(sv.w * k)); c.height = Math.max(1, Math.round(sv.ht * k));
      const x = c.getContext('2d'); x.fillStyle = '#ffffff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); resolve(c);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('render')); }; img.src = url;
  });
}
const fileName = () => (meta(board.id).name || 'board').replace(/[^\w\- ]+/g, '').trim() || 'board';
async function exportAs(kind) {
  const sv = pageSvg(board.els, sel.size ? selEls() : all()); if (!sv) return toast('Nothing to export yet.');
  if (kind === 'svg') return saveFile(fileName() + '.svg', sv.str, 'image/svg+xml');
  try { const c = await rasterize(sv, 8000); c.toBlob(blob => blob ? saveFile(fileName() + '.png', blob, 'image/png') : toast('Export failed. Try SVG instead.'), 'image/png'); }
  catch (e) { toast('Export failed. Try SVG instead.'); }
}
/** A slide as a standalone SVG string, sized to its frame. */
function slidePack(els, f) {
  const svg = slideSvg(els, f, { width: f.w, height: f.h, xmlns: 'http://www.w3.org/2000/svg' });
  return { str: new XMLSerializer().serializeToString(svg), w: f.w, ht: f.h, x: f.x, y: f.y, svg };
}
async function exportSlidePng(els, f, n) {
  await loadImages(Object.values(els));
  try { const c = await rasterize(slidePack(els, f), 3840); c.toBlob(blob => blob ? saveFile(`${fileName()} slide ${n}.png`, blob, 'image/png') : toast('Export failed.'), 'image/png'); }
  catch (e) { toast('Export failed.'); }
}
/** Turns standalone SVGs into PDF pages: a picture of each with its text placed invisibly on top. */
async function pdfPages(svs) {
  const out = [];
  for (const sv of svs) {
    const c = await rasterize(sv, 4000), blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.92)); if (!blob) throw new Error('encode');
    const k = Math.min(0.75, 14000 / Math.max(sv.w, sv.ht));
    out.push({ jpeg: new Uint8Array(await blob.arrayBuffer()), px: c.width, py: c.height, w: sv.w * k, h: sv.ht * k, texts: textLayer(sv, k) });
  }
  return out;
}
/** A PDF of every slide on every page, one slide per page. */
async function exportSlides() {
  const deck = deckOf('all'); if (!deck.length) return toast('No slides yet.');
  await loadImages(board.pages.flatMap(p => Object.values(p.els)));
  let out; try { out = await pdfPages(deck.map(d => slidePack(d.els, d.f))); } catch (e) { return toast('The PDF could not be made. Try PNG instead.'); }
  saveFile(fileName() + ' slides.pdf', new Blob([buildPdf(out)], { type: 'application/pdf' }), 'application/pdf');
}
/** A PDF with one page per board page (or just this page, or the selection on it). */
async function exportPdf(allPages) {
  const pages = allPages ? board.pages : [board.pages.find(p => p.id === board.page)];
  await loadImages(pages.flatMap(p => Object.values(p.els)));
  const out = [];
  try {
    for (const pg of pages) {
      const sv = pageSvg(pg.els, !allPages && sel.size ? selEls() : Object.values(pg.els)); if (!sv) continue;
      const c = await rasterize(sv, 4000), blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.92)); if (!blob) throw new Error('encode');
      const k = Math.min(0.75, 14000 / Math.max(sv.w, sv.ht));
      out.push({ jpeg: new Uint8Array(await blob.arrayBuffer()), px: c.width, py: c.height, w: sv.w * k, h: sv.ht * k, texts: textLayer(sv, k) });
    }
  } catch (e) { return toast('The PDF could not be made. Try PNG instead.'); }
  if (!out.length) return toast('Nothing to export yet.');
  saveFile(fileName() + '.pdf', new Blob([buildPdf(out)], { type: 'application/pdf' }), 'application/pdf');
}

/* ---------- Boot ---------- */
window.addEventListener('keydown', onKey);
window.addEventListener('paste', onPaste);
window.addEventListener('pointerdown', ev => { if (!(ev.target.closest && ev.target.closest('#menu'))) closeMenu(); }, true);
window.addEventListener('keyup', ev => { if (ev.key === ' ') { spaceDown = false; if (cv) cv.classList.remove('pan'); } });
window.addEventListener('pagehide', () => { if (board) saveNow(); });
applyTheme(themePref());
// The vector engine loads alongside storage; panels that offer its tools refresh once it is ready.
PO.init().then(ok => { if (ok && board) renderProps(); });
// Preset shapes unpack in the background; shapes drawn before that show as plain boxes and redraw once they are ready.
PG.loadPresets().then(() => { if (board) { draw(); renderFly(); renderProps(); } }).catch(() => {});
if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (board) draw(); });
new MutationObserver(() => { if (board) draw(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
(async () => {
  await Store.init();
  let idx = await Store.get('index');
  // First sign-in with an empty account: boards, templates, and pictures kept in this browser move up to it.
  if (!idx && Store.mode === 'cloud' && Store.local('index')) {
    idx = Store.local('index');
    for (const b of idx.boards) { const d = Store.local('b_' + b.id); if (d) Store.put('b_' + b.id, d); }
    for (const k of Store.localKeys()) if (/^(tpl|img)_/.test(k)) { const d = Store.local(k); if (d) Store.put(k, d); }
    Store.put('index', idx);
  }
  if (!idx) { idx = seed(); Store.put('index', idx); }
  index = idx; renderHome();
})();
