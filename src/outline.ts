import { bbox } from './geometry';
import { STICKERS } from './stickers';
import type { El, Lookup } from './types';

/** One line in the board outline. Pieces inside a frame sit one level in, under it. */
export interface OutlineRow { id: string; depth: 0 | 1; label: string; kind: El['type'] }

export const TYPE_NAMES: Record<El['type'], string> = {
  sticky: 'Sticky note', text: 'Text', rect: 'Rectangle', ellipse: 'Ellipse', diamond: 'Diamond', card: 'Task card',
  frame: 'Frame', pen: 'Drawing', conn: 'Connector', sticker: 'Sticker', tape: 'Washi tape', image: 'Picture',
};

/** A short name for a piece: the first line of its text, or what kind of piece it is. */
export function elLabel(e: El, get: Lookup, depth = 0): string {
  const first = (e.text || '').split('\n').map(l => l.trim()).find(Boolean) || '';
  if (first) return first.length > 60 ? first.slice(0, 59).trimEnd() + '…' : first;
  if (e.type === 'conn' && depth < 1) {
    const a = e.a ? get(e.a) : undefined, b = e.b ? get(e.b) : undefined;
    if (a && b) return `${elLabel(a, get, 1)} to ${elLabel(b, get, 1)}`;
  }
  if (e.type === 'sticker') return `${(STICKERS[e.shape || ''] || STICKERS.star).label} sticker`;
  return TYPE_NAMES[e.type];
}

/**
 * The outline: frames from top to bottom, each followed by the pieces whose center sits inside it
 * (the smallest frame wins when frames overlap), then the pieces that are in no frame.
 * Within a group, pieces read top to bottom, left to right, with connectors last.
 */
export function outlineRows(els: El[], get: Lookup): OutlineRow[] {
  const frames = els.filter(e => e.type === 'frame').sort((a, b) => a.y - b.y || a.x - b.x);
  const homeOf = (e: El): El | null => {
    const b = bbox(e, get), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    let best: El | null = null;
    for (const f of frames) if (cx >= f.x && cx <= f.x + f.w && cy >= f.y && cy <= f.y + f.h && (!best || f.w * f.h < best.w * best.h)) best = f;
    return best;
  };
  const kids = new Map<string, El[]>(), loose: El[] = [];
  for (const e of els) {
    if (e.type === 'frame') continue;
    const f = homeOf(e);
    if (!f) loose.push(e);
    else if (kids.has(f.id)) kids.get(f.id)!.push(e);
    else kids.set(f.id, [e]);
  }
  const order = (a: El, b: El) => {
    const ac = a.type === 'conn', bc = b.type === 'conn';
    if (ac !== bc) return ac ? 1 : -1;
    return ac ? a.z - b.z : a.y - b.y || a.x - b.x;
  };
  const row = (e: El, depth: 0 | 1): OutlineRow => ({ id: e.id, depth, label: elLabel(e, get), kind: e.type });
  return [
    ...frames.flatMap(f => [row(f, 0), ...(kids.get(f.id) || []).sort(order).map(e => row(e, 1))]),
    ...loose.sort(order).map(e => row(e, 0)),
  ];
}
