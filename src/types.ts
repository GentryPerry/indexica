export type ElType = 'sticky' | 'text' | 'rect' | 'ellipse' | 'diamond' | 'card' | 'frame' | 'pen' | 'conn' | 'sticker' | 'tape';
export type ConnStyle = 'straight' | 'curve' | 'elbow' | 'cable';
export type Status = 'todo' | 'doing' | 'blocked' | 'done';

/** One object on a board. Connectors use a/b (attached ids) and ax..by (free points) instead of x/y/w/h. */
export interface El {
  id: string;
  type: ElType;
  z: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Rotation in degrees around the element's center. */
  rot?: number;
  text?: string;
  fill?: string;
  stroke?: string;
  status?: Status;
  due?: string;
  notes?: string;
  pts?: number[][];
  a?: string | null;
  b?: string | null;
  ax?: number;
  ay?: number;
  bx?: number;
  by?: number;
  g?: string;
  /** Text styling: font key from FONTS, weight, size in px, italic. Unset means the type's default. */
  font?: string;
  weight?: number;
  size?: number;
  italic?: boolean;
  /** Connector line style. */
  style?: ConnStyle;
  /** Sticker shape key (STICKERS) or tape pattern key (TAPES). */
  shape?: string;
  pattern?: string;
  locked?: boolean;
}
export type Els = Record<string, El>;
export type Lookup = (id: string) => El | undefined;
export interface Box { x: number; y: number; w: number; h: number }

export interface BoardMeta {
  id: string;
  name: string;
  projectId: string;
  fav: boolean;
  trashed: boolean;
  created: number;
  updated: number;
  thumb: (number | string)[][];
}
export interface WorkspaceIndex {
  projects: { id: string; name: string }[];
  boards: BoardMeta[];
}

export const STATUS: Record<Status, [label: string, color: string]> = {
  todo: ['To do', '#7d8798'],
  doing: ['Doing', '#2f6fed'],
  blocked: ['Blocked', '#d64545'],
  done: ['Done', '#2a9460'],
};
export const FILLS = ['#ffe27a', '#ffc2a8', '#b9e6c9', '#b5d8ff', '#e3c8ff', '#ffffff', '#dfe5ee'];
export const TEXTY: ElType[] = ['sticky', 'text', 'rect', 'ellipse', 'diamond', 'card', 'frame', 'conn'];
export const BOXY: ElType[] = ['sticky', 'text', 'rect', 'ellipse', 'diamond', 'card', 'frame', 'sticker', 'tape'];

/** Stronger colors for stickers, tape, and connector lines. */
export const VIVID = ['#e5484d', '#f76b15', '#f5c518', '#2a9460', '#2f6fed', '#8e4ec6', '#e0409a', '#2b2f3a'];

/** Font choices. These are system font stacks, so exports render the same as the screen with nothing to download. */
export const FONTS: Record<string, { label: string; stack: string }> = {
  sans: { label: 'Sans', stack: 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif' },
  serif: { label: 'Serif', stack: 'Georgia,"Times New Roman",serif' },
  round: { label: 'Rounded', stack: 'ui-rounded,"SF Pro Rounded","Arial Rounded MT Bold","Varela Round",system-ui,sans-serif' },
  narrow: { label: 'Condensed', stack: '"Arial Narrow","Roboto Condensed","Helvetica Neue",Arial,sans-serif' },
  hand: { label: 'Handwritten', stack: '"Segoe Print","Bradley Hand","Chalkboard SE","Comic Sans MS",cursive' },
  mono: { label: 'Mono', stack: 'ui-monospace,"SF Mono",Menlo,Consolas,monospace' },
  type: { label: 'Typewriter', stack: '"Courier New",Courier,monospace' },
};
export const WEIGHTS: [number, string][] = [[300, 'Light'], [400, 'Regular'], [600, 'Semibold'], [700, 'Bold'], [900, 'Black']];
export const SIZES = [12, 14, 16, 18, 24, 32, 48, 64];
