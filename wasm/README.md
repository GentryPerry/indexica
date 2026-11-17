# Vector engine

`ixops.wasm` is VectorCraft's path engine (exact curve booleans, outline stroke, offset, simplify,
smooth) behind a small C-ABI bridge, `pathops/ixops`. See NOTICE for credits and licenses.

The app works without it: `src/pathops.ts` loads it if it is built in, and every caller falls back
to the polygon operations in `src/boolean.ts`.

## Rebuilding

Needs Rust with the `wasm32-unknown-unknown` target.

```
cd wasm/pathops && rustup target add wasm32-unknown-unknown && cargo build --release --target wasm32-unknown-unknown -p ixops
```

```
npx -y -p binaryen wasm-opt -Oz --enable-bulk-memory --enable-sign-ext --enable-mutable-globals --enable-nontrapping-float-to-int wasm/pathops/target/wasm32-unknown-unknown/release/ixops.wasm -o wasm/ixops.wasm && node scripts/embed-wasm.mjs
```

## Protocol

`ix_run(ptr, len)` takes UTF-8 text: the operation on line 1 (union, subtract, intersect, exclude,
outline, offset, simplify, smooth, smoothlevel), its numbers on line 2, then one SVG path per line (prefix `E `
for even-odd). It returns 0 and leaves one SVG path at `ix_out_ptr()`/`ix_out_len()`, or 1 and an
`ERR` line.
