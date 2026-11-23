/**
 * Paragraph structure for text pieces: bullets, numbering, and indent levels, after DeckCraft's body
 * text styles. The text stays a plain string; each paragraph is a line, and its level is the number of
 * leading tabs (0 to 8). Pure helpers with no layout; `layoutText` in `geometry.ts` places the lines.
 */
import type { El } from './types';

export type Bullets = 'disc' | 'num' | 'check';
/** The marker a checklist paragraph gets: a box drawn as a shape, never a character (see render and the editor). */
export const CHECK = 'check';
export interface Para { level: number; text: string }
export const MAX_LEVEL = 8;

/** Paragraphs of a text, with their levels. */
export function parasOf(text?: string): Para[] {
  return String(text ?? '').split('\n').map(line => {
    const m = /^\t*/.exec(line)![0].length;
    return { level: Math.min(MAX_LEVEL, m), text: line.slice(m) };
  });
}

/** Text from paragraphs: one line each, indented by tabs. */
export const joinParas = (ps: Para[]) => ps.map(p => '\t'.repeat(Math.max(0, Math.min(MAX_LEVEL, p.level))) + p.text).join('\n');

/** Moves the given paragraphs (by index) in or out a level. */
export function indentParas(text: string | undefined, from: number, to: number, by: 1 | -1): string {
  const ps = parasOf(text);
  for (let i = Math.max(0, from); i <= Math.min(ps.length - 1, to); i++) ps[i].level = Math.max(0, Math.min(MAX_LEVEL, ps[i].level + by));
  return joinParas(ps);
}

/** True when a piece's text needs paragraph layout rather than plain wrapped lines. */
export const isRich = (e: El) => e.type === 'text' && (!!e.bullets || !!e.lsp || e.psp != null || !!(e.runs && e.runs.length) || /(^|\n)\t/.test(e.text || ''));

/** Body placeholders step their type down by level, as DeckCraft's master does (28, 24, 20, 18 pt). */
const LEVEL_RATIO = [1, 24 / 28, 20 / 28, 18 / 28];
export const levelRatio = (e: El, level: number) => e.ph === 'body' || e.ph === 'body2' ? LEVEL_RATIO[Math.min(level, 3)] : 1;

/** Space above a paragraph (not the first): set by hand, or DeckCraft's 10 pt and 5 pt in body placeholders. */
export function spaceBefore(e: El, level: number, base: number): number {
  if (e.psp != null) return e.psp;
  return e.ph === 'body' || e.ph === 'body2' ? (level === 0 ? 0.36 : 0.18) * base : 0;
}

const DISC = ['•', '–', '•', '–', '»'];
const roman = (n: number) => {
  let out = '';
  for (const [v, s] of [[10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']] as [number, string][]) while (n >= v) { out += s; n -= v; }
  return out;
};
const alpha = (n: number) => { let s = ''; while (n > 0) { n--; s = String.fromCharCode(97 + (n % 26)) + s; n = Math.floor(n / 26); } return s; };

/**
 * The marker before each paragraph: a bullet by level, or a number that counts within its level
 * (1. 2. at the top, a. b. below, then i. ii.) and restarts under each parent. Empty paragraphs get none.
 */
export function markers(ps: Para[], kind?: Bullets): string[] {
  if (!kind) return ps.map(() => '');
  const count: number[] = [];
  return ps.map(p => {
    if (!p.text.trim()) return '';
    if (kind === 'check') return CHECK;
    if (kind === 'disc') return DISC[p.level % DISC.length];
    count.length = p.level + 1;
    count[p.level] = (count[p.level] || 0) + 1;
    const n = count[p.level], kindAt = p.level % 3;
    return (kindAt === 0 ? String(n) : kindAt === 1 ? alpha(n) : roman(n)) + '.';
  });
}

/** Horizontal steps for a level, in px for a base size: where the marker sits and where text starts. */
export function indentOf(level: number, base: number, kind?: Bullets): { marker: number; text: number } {
  // Numbers need room for "10." where a bullet needs a dot.
  const step = base * 1.25, hang = base * (kind === 'num' ? 1.35 : kind === 'check' ? 1.3 : 0.75);
  return kind ? { marker: level * step, text: level * step + hang } : { marker: 0, text: level * step };
}

/** True when paragraph `i` of a checklist is checked off. */
export const isChecked = (e: El, i: number) => e.bullets === 'check' && !!e.checked && e.checked.includes(i);

/** Checks or unchecks paragraph `i`, keeping the list sorted and dropping it when empty. */
export function toggleChecked(e: El, i: number): El {
  const set = new Set(e.checked || []);
  if (set.has(i)) set.delete(i); else set.add(i);
  const list = [...set].sort((a, b) => a - b);
  if (list.length) e.checked = list; else delete e.checked;
  return e;
}

/** Drops checked indexes past the last paragraph (after text got shorter outside the editor). */
export function clampChecked(e: El): El {
  if (!e.checked) return e;
  const n = parasOf(e.text).length, list = e.checked.filter(i => i >= 0 && i < n);
  if (list.length) e.checked = list; else delete e.checked;
  return e;
}
