# Indexica conventions

- No emojis anywhere in UI or code. Use color coding for state.
- Every board object has a stable `id`. All edits go through `History.commit()` so they are undoable and saved.
- Keep pure logic (geometry, history, model) out of `src/app.ts`, typed, and covered by tests in `tests/`.
- `src/app.ts` is the ported prototype UI and is excluded from type-checking. When touching a part of it substantially, move that part into its own typed module.
- The build must stay a single self-contained `dist/index.html` (it is also published as a Claude artifact). Do not add runtime network dependencies other than Google Fonts.
- Canvas content uses the system font stack in `geometry.ts` so exports match the screen.
- Before committing: `npm test` and `npm run build` must pass.
