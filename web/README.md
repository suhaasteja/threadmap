# threadmap web

Next.js UI for threadmap. Stage U1: fixture-driven preview (no backend, no API key).

## Local

```bash
cd web
npm install
npm run dev
# open http://localhost:3000
# click "Replay sample" — the trajectory streams in, the mind map renders
```

The fixture comes from `server/fixtures/sample-trajectory.sse`. The copy in
`web/public/` is what the browser fetches. Keep them in sync (a tiny script
will land in U3 when both are real).

## Build

```bash
npm run build
npm run start
```

## What's wired

- Three-pane layout — input (left), trajectory (middle), mind map (right).
- `lib/sse.ts` — fixture replay + a real SSE fetch helper (used in U3).
- `lib/types.ts` — the event protocol, mirroring `server/main.py`.
- Trajectory pane: live-streamed step cards, root vs sub-llm vs tool color coding,
  per-step token meters, auto-scroll, expand/collapse reasoning/code/output.
- Mind map pane: drag-pan, scroll-zoom, click-to-collapse, detail panel with cross-links.

## Not yet wired (next phases)

- U2: input modes, BYOK key field, editable instruction.
- U3: real `/api/extract` proxy → Render service.
- U4: deploy on Vercel.
