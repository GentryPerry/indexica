import type { Box } from './types';


export function union(a: Box, b: Box): Box {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

/** How board coordinates map into the minimap: mapX = x * k + ox, mapY = y * k + oy. */
export interface MiniFit { k: number; ox: number; oy: number }

/** Scale and center a region of the board inside a w x h minimap. */
export function miniFit(world: Box, w: number, h: number, pad = 6): MiniFit {
  const k = Math.min((w - pad * 2) / Math.max(world.w, 1), (h - pad * 2) / Math.max(world.h, 1));
  return { k, ox: (w - world.w * k) / 2 - world.x * k, oy: (h - world.h * k) / 2 - world.y * k };
}

export const miniToWorld = (m: MiniFit, mx: number, my: number) => ({ x: (mx - m.ox) / m.k, y: (my - m.oy) / m.k });
