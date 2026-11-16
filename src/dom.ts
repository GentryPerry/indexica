export const NS = 'http://www.w3.org/2000/svg';
const PROPS = ['checked', 'disabled', 'selected'];
type Kid = Node | string | null | undefined | false | Kid[];
type Attrs = Record<string, unknown> | null;

export const $ = <T extends Element = HTMLElement>(q: string, root: ParentNode = document) => root.querySelector<T>(q);

function put<T extends Element>(el: T, kids: Kid[]): T {
  for (const k of (kids as unknown[]).flat(Infinity) as (Node | string | null | undefined | false)[]) {
    if (k != null && k !== false) el.append(k);
  }
  return el;
}

/** Build an HTML element. `on*` attrs are listeners; `value` is applied after children so selects work. */
export function h(tag: string, attrs?: Attrs, ...kids: Kid[]): HTMLElement {
  const el = document.createElement(tag);
  let late: unknown = null;
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'value') late = v;
    else if (PROPS.includes(k)) (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  put(el, kids);
  if (late != null) (el as HTMLInputElement).value = String(late);
  return el;
}

/** Build an SVG element. */
export function s(tag: string, attrs?: Attrs, ...kids: Kid[]): SVGElement {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v != null && v !== false) el.setAttribute(k, String(v));
  return put(el, kids);
}

export const uid = (prefix: string) => prefix + Math.random().toString(36).slice(2, 10);
export const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));
export const today = () => new Date().toISOString().slice(0, 10);

export function toast(msg: string) {
  const t = h('div', { class: 'toast', role: 'status' }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 3200);
}
