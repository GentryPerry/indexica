export type ElType = 'sticky' | 'text' | 'rect' | 'ellipse' | 'diamond' | 'card' | 'frame' | 'pen' | 'conn' | 'sticker' | 'tape' | 'image' | 'table' | 'path';
/** Arrowhead shapes for connector ends. */
export type Head = 'none' | 'arrow' | 'triangle' | 'circle' | 'bar';
export type ConnStyle = 'straight' | 'curve' | 'elbow' | 'cable';
/** A side of a piece, for pinning a connector end: north, east, south, west. */
export type Side = 'n' | 'e' | 's' | 'w';
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
  /** Task notes, or presenter notes on a slide. */
  notes?: string;
  /** On a frame: its position in the page's slide deck, starting at 1. Unset means not a slide. */
  slide?: number;
  /** On a vector path: its subpaths, in its own box of vw by vh, drawn stretched to w by h. */
  paths?: import('./vector').SubPath[];
  vw?: number;
  vh?: number;
  /** On a vector path: stacked fills and strokes, bottom first. Unset means its plain fill and stroke. */
  fills?: import('./paint').Paint[];
  strokes?: import('./paint').StrokeLayer[];
  /** Clipped to the outline of this piece (a mask). */
  mask?: string;
  /** This piece is a mask: it is not drawn, its outline clips the pieces that name it. */
  masking?: boolean;
  /** On a drawing: the brush it was drawn with (pen when unset). */
  brush?: 'pen' | 'brush' | 'pencil' | 'marker';
  /** Fill rule for paths with holes. */
  rule?: 'nonzero' | 'evenodd';
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
  /** Text color and alignment. Unset means the type's default. */
  color?: string;
  align?: 'left' | 'center' | 'right';
  /** Image elements: id of the stored picture (kept in its own storage document). */
  src?: string;
  /** Connector line style. */
  style?: ConnStyle;
  /** Connector ends pinned to a side of the piece they attach to. Unset means the end picks the best side itself. */
  as?: Side;
  bs?: Side;
  /** Connector shows moving dots from its start to its end. */
  flow?: boolean;
  /** Line pattern for connectors, shape borders, and drawings. */
  dash?: 'dash' | 'dot';
  /** Connector end shapes: `head` at the end, `tail` at the start. Unset means a triangle head and no tail. */
  head?: Head;
  tail?: Head;
  /** Drawing stroke width, and whether it is a translucent highlighter stroke. */
  sw?: number;
  hl?: boolean;
  /** Table cell text, row by row, and whether the first row is a header. */
  cells?: string[][];
  header?: boolean;
  /** Table column widths as shares of the table width. Unset means equal columns. */
  colw?: number[];
  /** Draw this piece with a rough, hand-drawn outline. */
  sketch?: boolean;
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
  /** Ids of pictures this board uses, so they can be removed when the board is deleted for good. */
  imgs?: string[];
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
export const TEXTY: ElType[] = ['sticky', 'text', 'rect', 'ellipse', 'diamond', 'card', 'frame', 'conn', 'table'];
export const BOXY: ElType[] = ['sticky', 'text', 'rect', 'ellipse', 'diamond', 'card', 'frame', 'sticker', 'tape', 'image', 'table'];

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
export const WEIGHTS: [number, string][] = [[300, 'Light'], [400, 'Regular'], [500, 'Medium'], [600, 'Semibold'], [700, 'Bold'], [900, 'Black']];
export const SIZES = [12, 14, 16, 18, 24, 32, 48, 64];
export const TEXT_COLORS: [string, string][] = [['#1d2530', 'Default'], ['#5d697c', 'Gray'], ['#e5484d', 'Red'], ['#f76b15', 'Orange'], ['#2a9460', 'Green'], ['#2f6fed', 'Blue'], ['#8e4ec6', 'Purple'], ['#e0409a', 'Pink'], ['#ffffff', 'White']];
