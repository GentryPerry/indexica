/**
 * A small XML reader and writer helpers for Office parts. Office XML has no DTDs or processing beyond
 * the declaration, so elements, attributes, text, and the five standard entities (plus numeric ones)
 * are all that is needed. Tags keep their namespace prefix (`p:sp`, `a:t`).
 */

export interface XNode { tag: string; at: Record<string, string>; kids: XNode[]; text: string }

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
export const unesc = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) =>
  e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e.toLowerCase()]);
export const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

/** Parses XML into a tree. The returned node is the document element. */
export function parseXml(src: string): XNode {
  const root: XNode = { tag: '#doc', at: {}, kids: [], text: '' }, stack = [root];
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) { top.text += m[1]; continue; }
    if (m[6] !== undefined) { top.text += unesc(m[6]); continue; }
    if (!m[3]) continue;
    if (m[2]) { if (stack.length > 1) stack.pop(); continue; }
    const at: Record<string, string> = {};
    for (const a of m[4].matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) at[a[1]] = unesc(a[2] ?? a[3] ?? '');
    const node: XNode = { tag: m[3], at, kids: [], text: '' };
    top.kids.push(node);
    if (!m[5]) stack.push(node);
  }
  return root.kids[0] || root;
}

/** The first child with a tag (or path of tags), or undefined. */
export function kid(n: XNode | undefined, ...path: string[]): XNode | undefined {
  let cur = n;
  for (const t of path) { cur = cur?.kids.find(k => k.tag === t); if (!cur) return undefined; }
  return cur;
}
export const kidsOf = (n: XNode | undefined, tag: string) => (n ? n.kids.filter(k => k.tag === tag) : []);
/** Every descendant with a tag, in document order. */
export function find(n: XNode | undefined, tag: string, out: XNode[] = []): XNode[] {
  if (!n) return out;
  for (const k of n.kids) { if (k.tag === tag) out.push(k); find(k, tag, out); }
  return out;
}
/** All text inside a node. */
export const textOf = (n: XNode): string => n.text + n.kids.map(textOf).join('');

/** An element as a string: `x('a:off', { x: 0, y: 0 })`, children as strings. Undefined attributes are left out. */
export function x(tag: string, at: Record<string, string | number | boolean | undefined> = {}, ...kids: (string | false | null | undefined)[]): string {
  const attrs = Object.entries(at).filter(([, v]) => v !== undefined && v !== false).map(([k, v]) => ` ${k}="${esc(String(v))}"`).join('');
  const body = kids.filter(Boolean).join('');
  return body ? `<${tag}${attrs}>${body}</${tag}>` : `<${tag}${attrs}/>`;
}
export const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
