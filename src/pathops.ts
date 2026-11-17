/**
 * VectorCraft's path engine, compiled to WebAssembly and built into the page. It gives exact curve
 * booleans, outline stroke with real caps and joins, offset path, simplify, and smooth. Loading is
 * optional: when the module is missing or the browser refuses it, `ready` stays false and callers
 * use Indexica's own polygon-based operations instead.
 *
 * The engine is VectorCraft's `vectorcraft-pathops` crate (MIT OR Apache-2.0, ArtCraft Team and the
 * VectorCraft contributors) behind a small bridge; see wasm/README.md.
 */
import { WASM_B64 } from './ixops-wasm';

export type Op = 'union' | 'subtract' | 'intersect' | 'exclude' | 'outline' | 'offset' | 'simplify' | 'smooth';
export interface Operand { d: string; evenodd?: boolean }

interface Exports {
  memory: WebAssembly.Memory;
  ix_alloc(len: number): number;
  ix_free(p: number, len: number): void;
  ix_run(p: number, len: number): number;
  ix_out_ptr(): number;
  ix_out_len(): number;
}

let ex: Exports | null = null;
export const ready = () => !!ex;

function decode(b64: string): Uint8Array {
  const bin = atob(b64), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** The built-in engine is stored gzipped; browsers unpack it with DecompressionStream. */
async function gunzip(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Loads the engine from the bytes built into the page (or given bytes, for tests). Resolves to whether it is ready. */
export async function init(bytes?: Uint8Array): Promise<boolean> {
  if (ex) return true;
  try {
    const src = bytes || (WASM_B64 ? await gunzip(decode(WASM_B64)) : null);
    if (!src || typeof WebAssembly === 'undefined') return false;
    const mod = await WebAssembly.compile(src as BufferSource);
    // The bridge needs nothing from the page; any import it names gets a harmless stub.
    const imports: WebAssembly.Imports = {};
    for (const im of WebAssembly.Module.imports(mod)) {
      imports[im.module] = imports[im.module] || {};
      if (im.kind === 'function') (imports[im.module] as Record<string, unknown>)[im.name] = () => 0;
    }
    const inst = await WebAssembly.instantiate(mod, imports);
    ex = inst.exports as unknown as Exports;
    return true;
  } catch {
    ex = null;
    return false;
  }
}

const enc = new TextEncoder(), dec = new TextDecoder();

/** Runs one operation. Returns the result as SVG path data, or null when the engine is not ready or refused the input. */
export function run(op: Op, nums: number[], paths: Operand[]): string | null {
  if (!ex) return null;
  const req = enc.encode([op, nums.join(' '), ...paths.map(p => (p.evenodd ? 'E ' : '') + p.d)].join('\n'));
  let ptr = 0;
  try {
    ptr = ex.ix_alloc(req.length);
    new Uint8Array(ex.memory.buffer, ptr, req.length).set(req);
    const code = ex.ix_run(ptr, req.length);
    const text = dec.decode(new Uint8Array(ex.memory.buffer, ex.ix_out_ptr(), ex.ix_out_len()));
    return code === 0 ? text : null;
  } catch {
    return null;
  } finally {
    if (ptr) try { ex.ix_free(ptr, req.length); } catch { /* ignore */ }
  }
}
