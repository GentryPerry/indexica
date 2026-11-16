export type ElType = 'sticky' | 'text' | 'rect' | 'ellipse' | 'diamond' | 'card' | 'frame' | 'pen' | 'conn';
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
export const TEXTY: ElType[] = ['sticky', 'text', 'rect', 'ellipse', 'diamond', 'card', 'frame'];
export const BOXY: ElType[] = ['sticky', 'text', 'rect', 'ellipse', 'diamond', 'card', 'frame'];
