/**
 * A small zip reader and writer for Office files, with no libraries: entries are stored or deflated,
 * using the browser's own CompressionStream and DecompressionStream for the deflate part.
 */

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function pipe(data: Uint8Array, stream: TransformStream<Uint8Array, Uint8Array>): Promise<Uint8Array> {
  const out = await new Response(new Blob([data as BlobPart]).stream().pipeThrough(stream)).arrayBuffer();
  return new Uint8Array(out);
}
const inflate = (d: Uint8Array) => pipe(d, new DecompressionStream('deflate-raw') as unknown as TransformStream<Uint8Array, Uint8Array>);
const deflate = (d: Uint8Array) => pipe(d, new CompressionStream('deflate-raw') as unknown as TransformStream<Uint8Array, Uint8Array>);

export const utf8 = (s: string) => new TextEncoder().encode(s);
export const text = (b: Uint8Array) => new TextDecoder().decode(b);

/** Reads every file in a zip into a map of path to bytes. Folders are skipped. */
export async function unzip(buf: ArrayBuffer | Uint8Array): Promise<Map<string, Uint8Array>> {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf), v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  // The end-of-central-directory record sits in the last 64 KB.
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('This is not a zip file.');
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const out = new Map<string, Uint8Array>();
  for (let n = 0; n < count; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('The zip directory is damaged.');
    const method = v.getUint16(p + 10, true), csize = v.getUint32(p + 20, true), nlen = v.getUint16(p + 28, true), xlen = v.getUint16(p + 30, true), clen = v.getUint16(p + 32, true), off = v.getUint32(p + 42, true);
    const name = text(b.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + xlen + clen;
    if (name.endsWith('/')) continue;
    const lnlen = v.getUint16(off + 26, true), lxlen = v.getUint16(off + 28, true), start = off + 30 + lnlen + lxlen;
    const raw = b.subarray(start, start + csize);
    if (method === 0) out.set(name, raw.slice());
    else if (method === 8) out.set(name, await inflate(raw));
    else throw new Error(`Unsupported zip compression in ${name}.`);
  }
  return out;
}

/** Writes files into a zip. Text-like parts are deflated; pictures, already compressed, are stored. */
export async function zip(files: [string, Uint8Array | string][]): Promise<Uint8Array> {
  const parts: Uint8Array[] = [], dir: Uint8Array[] = [];
  let offset = 0;
  for (const [name, content] of files) {
    const data = typeof content === 'string' ? utf8(content) : content, nm = utf8(name);
    const store = /\.(png|jpe?g|gif|webp|mp4|zip)$/i.test(name) || data.length < 64;
    const body = store ? data : await deflate(data), crc = crc32(data), method = store ? 0 : 8;
    const local = new Uint8Array(30 + nm.length), lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true); lv.setUint16(8, method, true);
    lv.setUint16(10, 0, true); lv.setUint16(12, 0x21, true); lv.setUint32(14, crc, true); lv.setUint32(18, body.length, true); lv.setUint32(22, data.length, true);
    lv.setUint16(26, nm.length, true); local.set(nm, 30);
    const cen = new Uint8Array(46 + nm.length), cv = new DataView(cen.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true); cv.setUint16(10, method, true);
    cv.setUint16(12, 0, true); cv.setUint16(14, 0x21, true); cv.setUint32(16, crc, true); cv.setUint32(20, body.length, true); cv.setUint32(24, data.length, true);
    cv.setUint16(28, nm.length, true); cv.setUint32(42, offset, true); cen.set(nm, 46);
    parts.push(local, body); dir.push(cen); offset += local.length + body.length;
  }
  const dirLen = dir.reduce((a, d) => a + d.length, 0), end = new Uint8Array(22), ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true); ev.setUint32(12, dirLen, true); ev.setUint32(16, offset, true);
  const all = [...parts, ...dir, end], out = new Uint8Array(all.reduce((a, d) => a + d.length, 0));
  let at = 0; for (const d of all) { out.set(d, at); at += d.length; }
  return out;
}
