/**
 * The editor for text pieces: a contenteditable box with one `<p data-l>` per paragraph, styled like the
 * canvas layout (`layoutText`) so levels, bullets, numbers, and spacing show while typing. The piece's
 * text stays plain; `readRich` turns the paragraphs back into lines with leading tabs.
 */
import { textStyle } from './geometry';
import { indentOf, levelRatio, markers, MAX_LEVEL, parasOf, spaceBefore, type Para } from './richtext';
import type { El } from './types';

const paras = (root: HTMLElement) => [...root.children] as HTMLElement[];
const levelOf = (p: HTMLElement) => Math.max(0, Math.min(MAX_LEVEL, Number(p.dataset.l) || 0));

/** Fills the editor with a text's paragraphs. */
export function fillRich(root: HTMLElement, text: string | undefined) {
  root.replaceChildren(...parasOf(text).map(p => {
    const el = document.createElement('p');
    el.dataset.l = String(p.level);
    if (p.text) el.textContent = p.text; else el.append(document.createElement('br'));
    return el;
  }));
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
  const marks = markers(ps, e.bullets);
  list.forEach((p, i) => {
    const l = ps[i].level, size = st.size * levelRatio(e, l), ind = indentOf(l, st.size, e.bullets);
    p.style.fontSize = size * z + 'px';
    p.style.paddingLeft = ind.text * z + 'px';
    p.style.marginTop = (i ? spaceBefore(e, l, st.size) : 0) * z + 'px';
    p.style.lineHeight = String(1.3 * (e.lsp || 1));
    p.style.setProperty('--bx', ind.marker * z + 'px');
    if (marks[i]) p.dataset.b = marks[i]; else delete p.dataset.b;
  });
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
