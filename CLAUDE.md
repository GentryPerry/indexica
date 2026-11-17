# Indexica conventions

- No emojis anywhere in UI or code. Use color coding for state.
- Every board object has a stable `id`. All edits go through `History.commit()` so they are undoable and saved.
- Keep pure logic (geometry, history, model) out of `src/app.ts`, typed, and covered by tests in `tests/`.
- `src/app.ts` is the ported prototype UI and is excluded from type-checking. When touching a part of it substantially, move that part into its own typed module.
- The build must stay a single self-contained `dist/index.html` (it is also published as a Claude artifact). Do not add runtime network dependencies other than Google Fonts.
- Canvas content uses only the system font stacks in `FONTS` (`types.ts`) so exports match the screen. Do not add web fonts to canvas content.
- Before committing: `npm test` and `npm run build` must pass.
- UI follows the Indexica style reference (Claude design artifact "Indexica style"): flat light chrome, Inter for UI text (Bricolage Grotesque only for the wordmark), docked outline (240px) and properties (264px) panels divided by 1px #E3E6EB hairlines, tools in a floating tray at the bottom of the canvas. Floating pieces get `--float`; cards that lift on hover (home boards, kanban cards) get `--lift` only while lifted. Colors, radii (`--r1/2/3`), and easing live as tokens at the top of `src/styles.css`; use them rather than new values.
- Signature motif: index cards and tabbed folders. Projects have a tab color (`projectColor` in `library.ts`) shown as a tab above board cards, a dot in the sidebar, and on folder art. Group labels are small uppercase with 0.06em tracking. Menus may show icon tiles (`popupAt` item `[label, fn, cls, iconPath]`, `{ head }` for a group label).
- Board colors go through `src/palette.ts` (OKLCH): stored colors are painted per theme, outlines derive from fills, text picks readable ink. Exports always use the light look.
- Presentations: a slide is a frame with a `slide` number (deck order per page) plus optional `notes` and background `fill`. Deck logic and layouts live in `src/slides.ts`; slides always render in the light look, clipped to the frame.
- Chrome stays neutral. Color belongs to board content, task status, and the accent #2447D6.
