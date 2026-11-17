/**
 * VectorCraft's path engine, compiled to WebAssembly and built into the page. It gives exact curve
 * booleans, outline stroke with real caps and joins, offset path, simplify, and smooth. Loading is
 * optional: when the module is missing or the browser refuses it, `ready()` stays false and callers
 * use Indexica's own polygon-based operations instead.
 *
 * The engine is VectorCraft's `vectorcraft-pathops` crate (MIT OR Apache-2.0, ArtCraft Team and the
 * VectorCraft contributors) behind a small bridge; see wasm/README.md and wasm/NOTICE.
 */
import { WASM_B64 } from './ixops-wasm';

export type Op = 'union' | 'subtract' | 'intersect' | 'exclude' | 'outline' | 'offset' | 'simplify' | 'smooth' | 'smoothlevel';
export interface Operand { d: string; evenodd?: boolean }

interface Exports {
  memory: WebAssembly.Memory;
  ix_alloc(len: number): number;
  ix_free(p: number, len: number): void;
  ix_run(p: number, len: number): number;
  ix_out_ptr(): number;
  ix_out_len(): number;
}

let mod: WebAssembly.Module | null = null;
let ex: Exports | null = null;
let loading: Promise<boolean> | null = null;
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

/** A fresh instance of the compiled engine (it needs nothing from the page). */
async function instantiate(): Promise<boolean> {
  if (!mod) return false;
  try {
    ex = (await WebAssembly.instantiate(mod, {})).exports as unknown as Exports;
    return true;
  } catch {
    ex = null;
    return false;
  }
}

/** Loads the engine from the bytes built into the page (or given bytes, for tests). Resolves to whether it is ready. */
export function init(bytes?: Uint8Array): Promise<boolean> {
  if (ex) return Promise.resolve(true);
  if (loading) return loading;
  loading = (async () => {
    try {
      if (typeof WebAssembly === 'undefined') return false;
      const src = bytes || (WASM_B64 ? await gunzip(decode(WASM_B64)) : null);
      if (!src) return false;
      mod = await WebAssembly.compile(src as BufferSource);
      return await instantiate();
    } catch {
      return false;
    } finally {
      loading = null;
    }
  })();
  return loading;
}

const enc = new TextEncoder(), dec = new TextDecoder();

/** Runs one operation. Returns the result as SVG path data, or null when the engine is not ready or refused the input. */
export function run(op: Op, nums: number[], paths: Operand[]): string | null {
  const e = ex;
  if (!e) return null;
  const req = enc.encode([op, nums.join(' '), ...paths.map(p => (p.evenodd ? 'E ' : '') + p.d)].join('\n'));
  try {
    const ptr = e.ix_alloc(req.length);
    new Uint8Array(e.memory.buffer, ptr, req.length).set(req);
    const code = e.ix_run(ptr, req.length);
    const text = dec.decode(new Uint8Array(e.memory.buffer, e.ix_out_ptr(), e.ix_out_len()));
    e.ix_free(ptr, req.length);
    return code === 0 ? text : null;
  } catch {
    // A trap can leave the engine's memory half-updated: drop this instance and start a clean one.
    // Until it is ready, callers use the fallback operations.
    ex = null;
    void instantiate();
    return null;
  }
}
