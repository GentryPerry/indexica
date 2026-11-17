import { s } from './dom';

/**
 * Tool icons for the bottom tray. Most are plain line icons; the tools that make board objects show a
 * tiny version of the object itself, in color, so the tray reads like a desk of real things.
 */
export const LINE: Record<string, string> = {
  select: 'M6 4l12 6.8-5.3 1.3L15.4 18l-2.4 1.1-2.7-5.9L6 16.8z',
  text: 'M6 6.5h12M12 6.5V18.5M9.5 18.5h5',
  rect: 'M5 7h14v10H5z',
  ellipse: 'M3.5 12a8.5 6 0 1 0 17 0a8.5 6 0 1 0-17 0',
  diamond: 'M12 3.5l8.5 8.5-8.5 8.5L3.5 12z',
  conn: 'M5 19C11 19 9 6 18.5 5.5M14.5 3.5l4 2-2 4',
  frame: 'M8 3.5v17M16 3.5v17M3.5 8h17M3.5 16h17',
  table: 'M4 5h16v14H4zM4 9.7h16M4 14.3h16M9.3 5v14M14.7 5v14',
  image: 'M4 5h16v14H4zM4 16l5-5 3.5 3.5 2.5-2.5 5 5M15.5 8.6a.8.8 0 1 0 .01 0',
};

const line = (d: string) => s('path', { d, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });

const OBJECT: Record<string, () => SVGElement[]> = {
  // A small stack of notes, the top one with a folded corner.
  sticky: () => [
    s('rect', { x: 7, y: 3, width: 14, height: 14, rx: 2, fill: '#b9e6c9' }),
    s('path', { d: 'M5 6h12a2 2 0 0 1 2 2v7l-5 5H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z', fill: '#ffe27a' }),
    s('path', { d: 'M14 20v-3a2 2 0 0 1 2-2h3z', fill: '#efc75a' })],
  // A task card with a title line and a green status chip.
  card: () => [
    s('rect', { x: 3, y: 5, width: 18, height: 14, rx: 3, style: 'fill:var(--frame);stroke:var(--faint)', 'stroke-width': 1.2 }),
    s('rect', { x: 6, y: 8.5, width: 10, height: 1.8, rx: 0.9, fill: 'currentColor', opacity: 0.7 }),
    s('rect', { x: 6, y: 13.5, width: 7, height: 3, rx: 1.5, fill: '#2a9460' })],
  // A die-cut star sticker.
  stamp: () => [s('path', { d: 'M12 3.2l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.6l-5.2 2.8 1-5.9L3.5 9.4l5.9-.8z', fill: '#e0409a', stroke: 'var(--panel)', 'stroke-width': 1.4, 'stroke-linejoin': 'round' })],
  // A pen with a blue nib.
  pen: () => [
    s('path', { d: 'M7.2 15.8L16.4 6.6a2.1 2.1 0 0 1 3 3L10.2 18.8', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
    s('path', { d: 'M4.5 20.5l1.1-4.6 3.5 3.5z', fill: '#2f6fed', stroke: '#2f6fed', 'stroke-width': 1, 'stroke-linejoin': 'round' })],
};

/** The icon for a tool in the tray. */
export function trayIcon(tool: string, size = 22): SVGElement {
  const kids = OBJECT[tool] ? OBJECT[tool]() : [line(LINE[tool] || LINE.rect)];
  return s('svg', { width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': 'true' }, ...kids);
}
