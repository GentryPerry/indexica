# Indexica

A whiteboard-first workspace: capture, organize, diagram, and track ideas on boards.

## Run it

    npm install
    npm run dev

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the app locally with live reload |
| `npm test` | Run the automated tests |
| `npm run build` | Type-check, then build `dist/index.html` |

The build is a single self-contained `dist/index.html`, so it can be hosted on any static host.
For Cloudflare Pages: build command `npm run build`, output directory `dist`.

## Layout

| Path | Purpose |
|---|---|
| `src/types.ts` | Board data model |
| `src/geometry.ts` | Text wrapping, connector endpoints, bounds |
| `src/history.ts` | Undo and redo |
| `src/store.ts` | Saving (Claude artifact storage, or the browser) |
| `src/dom.ts` | Small helpers for building HTML and SVG |
| `src/app.ts` | Home screen and board UI (ported prototype, not yet type-checked) |
| `tests/` | Tests for geometry and history |

## Status

Stage 1, slice 1. See the Phase 1 pitch and build notes in the Indexica project for scope and what is next.
