/**
 * The editor for text pieces: a contenteditable box with one `<p data-l>` per paragraph, styled like the
 * canvas layout (`layoutText`) so levels, bullets, numbers, and spacing show while typing. The piece's
 * text stays plain; `readRich` turns the paragraphs back into lines with leading tabs.
 */
import { textStyle } from './geometry';
import { CHECK, indentOf, levelRatio, markers, MAX_LEVEL, parasOf, spaceBefore, type Para } from './richtext';
import { normRuns, spansOf, type Run, type RunStyle } from './runs';
import { FONTS, type El } from './types';

const paras = (root: HTMLElement) => [...root.children] as HTMLElement[];
const levelOf = (p: HTMLElement) => Math.max(0, Math.min(MAX_LEVEL, Number(p.dataset.l) || 0));

/** A span showing a run's style. Sizes are kept in `data-z` (board px) and scaled to the zoom by `styleRich`. */
function runSpan(doc: Document, text: string, st: RunStyle): HTMLElement {
  const sp = doc.createElement('span');
  if (st.w) sp.style.fontWeight = String(st.w);
  if (st.i != null) sp.style.fontStyle = st.i ? 'italic' : 'normal';
  const deco = [st.u ? 'underline' : '', st.x ? 'line-through' : ''].filter(Boolean).join(' ');
  if (deco) sp.style.textDecorationLine = deco;
  if (st.c) sp.style.color = st.c;
  if (st.f) sp.style.fontFamily = (FONTS[st.f] || FONTS.sans).stack;
  if (st.z) sp.dataset.z = String(st.z);
  sp.textContent = text;
  return sp;
}

/** Fills the editor with a text's paragraphs, with its runs as styled spans and checked-off checklist items marked. */
export function fillRich(root: HTMLElement, text: string | undefined, runs?: Run[], checked?: number[]) {
  const doc = root.ownerDocument;
  let off = 0;
  root.replaceChildren(...parasOf(text).map((p, i) => {
    const el = doc.createElement('p'), start = off + p.level;
    off += p.level + p.text.length + 1;
    el.dataset.l = String(p.level);
    if (checked && checked.includes(i)) el.dataset.done = '1';
    if (!p.text) { el.append(doc.createElement('br')); return el; }
    for (const sp of spansOf(runs, start, start + p.text.length)) {
      const t = p.text.slice(sp.s - start, sp.e - start);
      el.append(Object.keys(sp.st).length ? runSpan(doc, t, sp.st) : doc.createTextNode(t));
    }
    return el;
  }));
}

const hex = (rgb: string) => {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgb);
  return m ? '#' + [m[1], m[2], m[3]].map(v => Number(v).toString(16).padStart(2, '0')).join('') : rgb;
};
const squash = (f: string) => f.replace(/["'\s]/g, '').toLowerCase();
const fontKey = (family: string) => Object.entries(FONTS).find(([, v]) => squash(v.stack) === squash(family))?.[0];
const decoOf = (n: HTMLElement, stop: HTMLElement, win: Window) => {
  let u = false, x = false;
  for (let a: HTMLElement | null = n; a && a !== stop; a = a.parentElement) {
    const d = win.getComputedStyle(a).textDecorationLine || '';
    if (d.includes('underline')) u = true;
    if (d.includes('line-through')) x = true;
  }
  return { u, x };
};

/**
 * The editor's text and runs. Styles are read from what the browser shows (its own bold, italic,
 * underline, and color commands write their own markup), compared with each paragraph's own style.
 */
export function readRichRuns(root: HTMLElement): { text: string; runs: Run[] } {
  const win = root.ownerDocument.defaultView!, runs: Run[] = [], lines: string[] = [];
  let off = 0;
  for (const p of paras(root)) {
    const level = levelOf(p), pcs = win.getComputedStyle(p);
    let line = '\t'.repeat(level), at = off + level;
    const walk = root.ownerDocument.createTreeWalker(p, 4);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const txt = (n.textContent || '').replace(/[\n\t]/g, ' ');
      if (!txt) continue;
      const el = n.parentElement!, cs = win.getComputedStyle(el), st: RunStyle = {};
      const w = parseInt(cs.fontWeight, 10); if (w !== parseInt(pcs.fontWeight, 10)) st.w = w;
      const it = cs.fontStyle === 'italic'; if (it !== (pcs.fontStyle === 'italic')) st.i = it;
      const d = decoOf(el, p, win); if (d.u) st.u = true; if (d.x) st.x = true;
      if (cs.color !== pcs.color) st.c = hex(cs.color);
      if (cs.fontFamily !== pcs.fontFamily) { const k = fontKey(cs.fontFamily); if (k) st.f = k; }
      const zs = el.closest('[data-z]') as HTMLElement | null;
      // Only sizes set from the format bar count: the browser copies sizes onto spans when it joins paragraphs.
      if (zs && p.contains(zs)) st.z = Number(zs.dataset.z);
      runs.push({ ...st, s: at, e: at + txt.length });
      line += txt; at += txt.length;
    }
    lines.push(line); off = at + 1;
  }
  return { text: lines.join('\n'), runs: normRuns(runs, off - 1) };
}

/** Selection start and end as offsets in the piece's text (tabs and line breaks counted), or null. */
export function selOffsets(root: HTMLElement): [number, number] | null {
  const sel = root.ownerDocument.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const r = sel.getRangeAt(0);
  if (!root.contains(r.startContainer) || !root.contains(r.endContainer)) return null;
  const at = (node: Node, k: number) => {
    let off = 0;
    // A range on the editor itself (select all) counts whole paragraphs: k is a child index.
    if (node === root) { for (const p of paras(root).slice(0, k)) off += levelOf(p) + (p.textContent || '').length + 1; return Math.max(0, k >= paras(root).length ? off - 1 : off); }
    for (const p of paras(root)) {
      if (p === node || p.contains(node)) {
        const pre = root.ownerDocument.createRange(); pre.selectNodeContents(p); pre.setEnd(node, k);
        return off + levelOf(p) + pre.toString().length;
      }
      off += levelOf(p) + (p.textContent || '').length + 1;
    }
    return off;
  };
  const a = at(r.startContainer, r.startOffset), b = at(r.endContainer, r.endOffset);
  return [Math.min(a, b), Math.max(a, b)];
}

/** Selects the text between two offsets in the piece's text. */
export function setSelOffsets(root: HTMLElement, a: number, b: number) {
  const doc = root.ownerDocument, find = (i: number): [Node, number] => {
    let off = 0;
    for (const p of paras(root)) {
      const len = (p.textContent || '').length, start = off + levelOf(p);
      if (i <= start + len) {
        let k = Math.max(0, i - start);
        const walk = doc.createTreeWalker(p, 4);
        for (let n = walk.nextNode(); n; n = walk.nextNode()) { const l = (n.textContent || '').length; if (k <= l) return [n, k]; k -= l; }
        return [p, 0];
      }
      off = start + len + 1;
    }
    const last = paras(root).pop()!; return [last, last.childNodes.length];
  };
  const r = doc.createRange(), [sn, so] = find(a), [en, eo] = find(b);
  r.setStart(sn, so); r.setEnd(en, eo);
  const sel = doc.getSelection()!; sel.removeAllRanges(); sel.addRange(r);
}

/** The editor's text: one line per paragraph, indented with tabs. */
export const readRich = (root: HTMLElement) =>
  paras(root).map(p => '\t'.repeat(levelOf(p)) + (p.textContent || '').replace(/[\n\t]/g, ' ')).join('\n');

/**
 * Keeps the editor as a flat list of paragraphs: stray text or other blocks (left by the browser after
 * deleting everything or splitting oddly) become paragraphs. Returns true when it had to change anything.
 */
export function normalizeRich(root: HTMLElement): boolean {
  let changed = false;
  for (const n of [...root.childNodes]) {
    if (n.nodeType === 1 && (n as HTMLElement).tagName === 'P') continue;
    changed = true;
    if (n.nodeType === 3 && !n.textContent) { n.remove(); continue; }
    const p = document.createElement('p');
    p.dataset.l = n.nodeType === 1 ? (n as HTMLElement).dataset.l || '0' : '0';
    root.insertBefore(p, n);
    if (n.nodeType === 1 && (n as HTMLElement).tagName === 'BR') { p.append(n); continue; }
    if (n.nodeType === 1) p.append(...[...n.childNodes]); else p.append(n);
    if (n.nodeType === 1) n.remove();
  }
  if (!root.children.length) {
    const p = document.createElement('p'); p.dataset.l = '0'; p.append(document.createElement('br')); root.append(p); changed = true;
  }
  for (const p of paras(root)) if (!p.dataset.l) p.dataset.l = '0';
  return changed;
}

/**
 * Sizes, indents, spacing, and markers for each paragraph at zoom `z`, matching the canvas. Empty
 * paragraphs show their bullet while typing, as in PowerPoint.
 */
export function styleRich(root: HTMLElement, e: El, z: number) {
  const st = textStyle(e), list = paras(root);
  const ps: Para[] = list.map(p => ({ level: levelOf(p), text: p.textContent || 'x' }));
  // A task card is a to-do list: every paragraph is a task with a box, in regular weight (see tasks.ts).
  const card = e.type === 'card', kind = card ? 'check' : e.bullets, marks = markers(ps, kind);
  list.forEach((p, i) => {
    const l = ps[i].level, size = st.size * levelRatio(e, l), ind = indentOf(l, st.size, kind);
    p.style.fontSize = size * z + 'px';
    p.style.paddingLeft = ind.text * z + 'px';
    p.style.marginTop = (i ? spaceBefore(e, l, st.size) : 0) * z + 'px';
    p.style.fontWeight = card ? '400' : '';
    p.style.lineHeight = String(1.3 * (e.lsp || 1));
    p.style.setProperty('--bx', ind.marker * z + 'px');
    // Checklist boxes are drawn by CSS from data-chk (and data-done when checked off), not as a character.
    if (marks[i] === CHECK) { p.dataset.chk = ''; delete p.dataset.b; } else { delete p.dataset.chk; if (marks[i]) p.dataset.b = marks[i]; else delete p.dataset.b; }
  });
  // Run sizes follow shrink-to-fit like the canvas does.
  const sc = st.size / textStyle({ ...e, fit: undefined }).size;
  for (const sp of root.querySelectorAll<HTMLElement>('[data-z]')) sp.style.fontSize = Number(sp.dataset.z) * sc * z + 'px';
}

/** Indexes of the paragraphs the selection touches, or null when it is outside the editor. */
export function selectedParas(root: HTMLElement): [number, number] | null {
  const sel = root.ownerDocument.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const r = sel.getRangeAt(0), list = paras(root);
  const at = (n: Node) => { let x: Node | null = n; while (x && x.parentNode !== root) x = x.parentNode; return x ? list.indexOf(x as HTMLElement) : -1; };
  const a = at(r.startContainer), b = at(r.endContainer);
  if (a < 0 || b < 0) return null;
  return [Math.min(a, b), Math.max(a, b)];
}

/** Moves the selected paragraphs in (1) or out (-1) a level. Returns true when it did. */
export function indentRich(root: HTMLElement, by: 1 | -1): boolean {
  const range = selectedParas(root);
  if (!range) return false;
  const list = paras(root);
  for (let i = range[0]; i <= range[1]; i++) list[i].dataset.l = String(Math.max(0, Math.min(MAX_LEVEL, levelOf(list[i]) + by)));
  return true;
}

/** Inserts plain text at the caret, one paragraph per line, keeping the current paragraph's level. */
export function pastePlain(doc: Document, text: string) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  lines.forEach((line, i) => {
    if (i) doc.execCommand('insertParagraph');
    if (line) doc.execCommand('insertText', false, line.replace(/\t/g, ' '));
  });
}

/** Indexes of the checked-off paragraphs. An empty paragraph never stays checked (a new item made by Enter starts open). */
export function readChecked(root: HTMLElement): number[] {
  const out: number[] = [];
  paras(root).forEach((p, i) => {
    if (p.dataset.done !== '1') return;
    if (!(p.textContent || '').trim()) { delete p.dataset.done; return; }
    out.push(i);
  });
  return out;
}

/** When a press lands on a paragraph's checkbox (the space left of its text), checks or unchecks it. True when it did. */
export function toggleAt(root: HTMLElement, target: EventTarget | null, offsetX: number): boolean {
  const p = target as HTMLElement | null;
  if (!p || p.parentElement !== root || p.tagName !== 'P' || p.dataset.chk == null) return false;
  const pad = parseFloat(p.ownerDocument.defaultView!.getComputedStyle(p).paddingLeft) || 0;
  if (offsetX > pad) return false;
  if (p.dataset.done === '1') delete p.dataset.done; else if ((p.textContent || '').trim()) p.dataset.done = '1';
  return true;
}
