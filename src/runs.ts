/**
 * Formatting on part of a text: runs are character ranges of the piece's plain text (tabs and line
 * breaks included) that carry style overrides on top of the piece's own style. Text outside every run
 * uses the piece's style. Runs never overlap, are kept sorted, and carry only keys that differ from
 * the piece; `normRuns` keeps them that way. Pure helpers with no layout.
 */

/** Style overrides: weight, italic, underline, strikethrough, color, size (px), font key. */
export interface RunStyle { w?: number; i?: boolean; u?: boolean; x?: boolean; c?: string; z?: number; f?: string }
export interface Run extends RunStyle { s: number; e: number }
export type RunKey = keyof RunStyle;
export const RUN_KEYS: RunKey[] = ['w', 'i', 'u', 'x', 'c', 'z', 'f'];

/** A style change: a value sets the key, null removes it (back to the piece's style). */
export type RunPatch = { [K in RunKey]?: RunStyle[K] | null };

// Italic can be turned off on part of an italic box, so false is kept for it; underline and strike are off by default.
const keeps = (k: RunKey, v: unknown) => v != null && v !== '' && !(v === false && k !== 'i');
const styleOf = (r: RunStyle): RunStyle => {
  const o: RunStyle = {};
  for (const k of RUN_KEYS) if (keeps(k, r[k])) (o as Record<string, unknown>)[k] = r[k];
  return o;
};
const same = (a: RunStyle, b: RunStyle) => { const x = styleOf(a), y = styleOf(b); return RUN_KEYS.every(k => x[k] === y[k]); };
const empty = (r: RunStyle) => RUN_KEYS.every(k => !keeps(k, r[k]));

/** Sorted, clipped to the text, without empty or unstyled runs, and with equal neighbours merged. */
export function normRuns(runs: Run[] | undefined, len: number): Run[] {
  const out: Run[] = [];
  const list = (runs || []).map(r => ({ ...styleOf(r), s: Math.max(0, Math.min(len, r.s)), e: Math.max(0, Math.min(len, r.e)) }))
    .filter(r => r.e > r.s && !empty(r)).sort((a, b) => a.s - b.s);
  for (const r of list) {
    const last = out[out.length - 1];
    if (last && r.s < last.e) r.s = last.e;
    if (r.e <= r.s) continue;
    if (last && last.e === r.s && same(last, r)) last.e = r.e; else out.push(r);
  }
  return out;
}

/** The overrides at one character. */
export function styleAt(runs: Run[] | undefined, i: number): RunStyle {
  const r = (runs || []).find(x => x.s <= i && i < x.e);
  return r ? styleOf(r) : {};
}

/** Pieces of [from, to) that share one style, in order, covering the whole range. */
export function spansOf(runs: Run[] | undefined, from: number, to: number): { s: number; e: number; st: RunStyle }[] {
  const out: { s: number; e: number; st: RunStyle }[] = [];
  let at = from;
  for (const r of runs || []) {
    if (r.e <= at || r.s >= to) continue;
    if (r.s > at) out.push({ s: at, e: r.s, st: {} });
    const e = Math.min(to, r.e);
    out.push({ s: Math.max(at, r.s), e, st: styleOf(r) });
    at = e;
  }
  if (at < to) out.push({ s: at, e: to, st: {} });
  return out;
}

/** Applies a style change to the characters in [s, e). */
export function applyStyle(runs: Run[] | undefined, len: number, s: number, e: number, patch: RunPatch): Run[] {
  if (e <= s) return normRuns(runs, len);
  const parts = spansOf(runs, 0, len).map(p => ({ ...p.st, s: p.s, e: p.e }));
  const out: Run[] = [];
  for (const p of parts) {
    const cuts = [p.s, Math.max(p.s, Math.min(p.e, s)), Math.max(p.s, Math.min(p.e, e)), p.e];
    for (let i = 0; i < 3; i++) {
      if (cuts[i + 1] <= cuts[i]) continue;
      const piece: Run = { ...styleOf(p), s: cuts[i], e: cuts[i + 1] };
      if (i === 1) for (const k of RUN_KEYS) {
        if (!(k in patch)) continue;
        const v = patch[k];
        if (!keeps(k, v)) delete piece[k]; else (piece as unknown as Record<string, unknown>)[k] = v;
      }
      out.push(piece);
    }
  }
  return normRuns(out, len);
}

/** True when every character in [s, e) has the key set (to `value`, when given). */
export function allHave(runs: Run[] | undefined, s: number, e: number, key: RunKey, value?: unknown): boolean {
  if (e <= s) return false;
  return spansOf(runs, s, e).every(p => value === undefined ? keeps(key, p.st[key]) && p.st[key] !== false : p.st[key] === value);
}

/** Removes keys from every run: the piece itself now sets them (a color picked for the whole box). */
export function dropKeys(runs: Run[] | undefined, len: number, keys: RunKey[]): Run[] {
  return normRuns((runs || []).map(r => { const o = { ...r }; for (const k of keys) delete o[k]; return o; }), len);
}

/**
 * Keeps runs on the same characters after the text changed from `before` to `after`. The changed
 * stretch is found from the common start and end; typed text takes the style of the character
 * before it (or after it, at the very start), and deleted text takes its runs with it.
 */
export function editRuns(runs: Run[] | undefined, before: string, after: string): Run[] {
  if (!runs || !runs.length || before === after) return normRuns(runs, after.length);
  let p = 0;
  const max = Math.min(before.length, after.length);
  while (p < max && before[p] === after[p]) p++;
  let q = 0;
  while (q < max - p && before[before.length - 1 - q] === after[after.length - 1 - q]) q++;
  const delEnd = before.length - q, ins = after.length - q - p, shift = ins - (delEnd - p);
  const map = (i: number, end: boolean) => {
    if (i < p) return i;
    if (i === p) return end || p > 0 ? p + ins : 0;
    if (i < delEnd) return p + ins;
    return i + shift;
  };
  return normRuns(runs.map(r => ({ ...r, s: map(r.s, false), e: map(r.e, true) })), after.length);
}

/**
 * Keeps runs on the same characters when only the leading tabs of paragraphs changed (indenting),
 * paragraph by paragraph.
 */
export function reindentRuns(runs: Run[] | undefined, before: string, after: string): Run[] {
  const a = before.split('\n'), b = after.split('\n');
  if (!runs || !runs.length) return [];
  if (a.length !== b.length) return editRuns(runs, before, after);
  const starts: [number, number, number, number][] = [];
  let oa = 0, ob = 0;
  for (let i = 0; i < a.length; i++) {
    const ta = /^\t*/.exec(a[i])![0].length, tb = /^\t*/.exec(b[i])![0].length;
    starts.push([oa, ta, ob, tb]);
    oa += a[i].length + 1; ob += b[i].length + 1;
  }
  const map = (i: number) => {
    let k = 0;
    while (k + 1 < starts.length && starts[k + 1][0] <= i) k++;
    const [sa, ta, sb, tb] = starts[k];
    return sb + tb + Math.max(0, i - sa - ta);
  };
  return normRuns(runs.map(r => ({ ...r, s: map(r.s), e: map(r.e) })), after.length);
}
