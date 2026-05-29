# threadmap UI — Plan

Read `context.md` and `plan.md` first. This file plans the web UI on top of the CLI core. The CLI keeps working unchanged; the UI is an additional surface, not a replacement.

---

## 1. Goals

A Next.js app that:

1. Lets a visitor paste/drop a Claude conversation and get a mind map back.
2. **Showcases what RLM is actually doing** — code it wrote, sub-LLM calls it dispatched, tools it called, tokens it spent — as the run unfolds. This is the only honest reason to use RLM on a single conversation in the first place, and it's what a generic "AI summary" demo can't show.
3. Bring-your-own-key (BYOK) — the visitor pastes a Gemini / Anthropic / OpenAI key in the UI, it lives in their browser, it travels with the request, it is never persisted server-side.
4. Hosts on Vercel.

Non-goals:

- Auth, accounts, persisted history (later).
- Editing the mind map in the UI (later).
- A multi-conversation atlas view (separate project — see `MVP.md`).

---

## 2. The hard architectural choice

The Python core (DSPy + RLM + Deno sandbox) can't run inside a Vercel function — runs take 1–3 minutes, sandbox needs Deno, and the runtime model is wrong for hobby/pro tiers. Three options:

| Option | Verdict |
|---|---|
| **A. Next.js on Vercel + Python service on Modal/Render/Fly** | **Chosen.** The Vercel API route is a thin streaming proxy that forwards the BYOK header. The Python service does the work and streams events back. Honest, scales, fits the existing code. |
| B. Port extraction to TypeScript | Rejected. Throws away DSPy, RLM, the trajectory we want to show. The whole point of the project is the Python pipeline. |
| C. Run Python on Vercel Fluid Compute / Edge | Rejected for MVP. Even at the max timeout the runs are tight, and Deno-in-Pyodide is not a Vercel runtime. Revisit only if Python service ops become a burden. |

```
┌──────────────┐  HTTPS + SSE   ┌────────────────────┐  in-process  ┌────────────┐
│ Next.js UI   │ ──────────────▶│ Next.js API route  │─────────────▶│ Python svc │
│ (Vercel)     │ ◀──────────────│ (proxy + BYOK hdr) │◀─────────────│ FastAPI    │
└──────────────┘   trajectory   └────────────────────┘   trajectory │ + dspy.RLM │
                   events                                            └────────────┘
```

The Python service exposes one endpoint:

```
POST /extract
  headers: X-LLM-Provider-Key: <user key>
  body:    { conversation_text, instruction, root_model, sub_model }
  response: text/event-stream with the events in §4
```

Why this shape:

- The Vercel route never sees the key longer than one request hop.
- The Python service is **stateless and BYOK** — it reads the header into a per-request env var (`GEMINI_API_KEY=...`), calls our existing `extract.build_mindmap()`, and zeroes it after.
- Streaming uses Server-Sent Events. SSE works through Vercel and is simpler than WebSockets here (one-way server→client suffices; the client sends nothing mid-run).

---

## 3. UI design — three panes, trajectory in the middle

```
┌────────────────────────┬──────────────────────────────┬─────────────────────┐
│ INPUT (40%)            │ TRAJECTORY (35%)             │ MIND MAP (25%)      │
│                        │                              │                     │
│ • Sample / Paste / Drop│ Step 1  ⏱ 2.1s  root         │ [empty during run]  │
│ • API key + provider   │   reasoning ▾                │                     │
│ • Model picker         │   ```python ... ```          │ [SVG mindmap once   │
│ • Instruction editor   │   output ▸                   │  final event lands] │
│   (prefilled, biggest  │                              │                     │
│   quality lever)       │ Step 2  ⏱ 0.4s  tool:validate│ Download:           │
│ • [Run] button         │   ✓ OK                       │   • mindmap.html    │
│                        │                              │   • mindmap.md      │
│ Live counters:         │ Step 3  ⏱ 14s   sub-llm      │   • mindmap.json    │
│   root tokens   1,204  │   model: gemini-2.5-flash    │   • trace.txt       │
│   sub  tokens  18,330  │   tokens: 4,120              │                     │
│   est. cost   $0.024   │   output ▸                   │                     │
│   wall time   1m 12s   │                              │                     │
└────────────────────────┴──────────────────────────────┴─────────────────────┘
```

Design intent per pane:

**Input (left).** Three input modes share a tab strip: *Sample* (one-click the bundled `examples/sample_conversation.md`), *Paste* (textarea), *Drop* (file). Below that: provider radio (Gemini default), key field with show/hide toggle, model strings (editable text, defaults match `config.py`), and the **instruction editor** as a real expandable textarea — not a hidden setting. The instruction is the biggest quality lever; surfacing it in the primary surface is the whole MVP lesson in one UI choice.

**Trajectory (middle).** Vertical timeline of step cards. Each card shows: step number, elapsed time, a colored badge for *kind* (`root` / `sub-llm` / `tool` / `submit`), a one-line summary, then collapsible regions for reasoning, code (syntax-highlighted Python), and output (truncated with "show more"). Auto-scrolls; pauses auto-scroll when the user scrolls up so they can read. Top of pane: running totals.

**Mind map (right).** Empty state while the run is in flight (a small "stage 2 of 3" indicator that mirrors the trajectory pane). On `final_mindmap`, mounts the same interactive SVG component used in the CLI's HTML output — drag-pan, scroll-zoom, click-to-collapse, detail panel. Four download buttons below it.

**Why this layout works for the RLM story.** The visitor's eyes move *left-to-right with time*: I gave it input → I watched it think in code → here is the structured artifact. The trajectory pane is where the value of using RLM (vs. a one-shot prompt) is visible. If we hid the trajectory, the demo would be indistinguishable from any LLM JSON-out tool.

**Stretch — trajectory ↔ map linking.** If we can tag each node with the trajectory step that produced it (requires teaching the RLM to emit `step_id` alongside node ids), clicking a map node highlights the originating step, and vice versa. Big payoff, real complexity. **Not in MVP.** Listed in §8.

---

## 4. The event protocol (frontend ↔ Python service)

Server-Sent Events, one event per line, JSON payloads. Keep the schema small and stable.

```
event: status
data: {"phase": "ingesting" | "extracting" | "rendering", "message": "..."}

event: step
data: {
  "index": 3,
  "kind": "root" | "sub_llm" | "tool" | "submit",
  "elapsed_s": 14.2,
  "reasoning": "I'll batch the transcript into 4 slices...",
  "code": "slices = chunk(conversation, n=4)\nresults = llm_query_batched(slices, ...)",
  "output": "['theme: caching', 'theme: streaming', ...]",
  "model": "gemini/gemini-2.5-flash",     # present when kind == sub_llm
  "tool_name": "validate_mindmap_json",   # present when kind == tool
  "tool_result": "OK"                     # present when kind == tool
}

event: tokens
data: {"root_in": 4120, "root_out": 280, "sub_in": 18330, "sub_out": 920, "est_cost_usd": 0.024}

event: final_mindmap
data: { ... MindMap JSON ... }

event: error
data: {"message": "...", "where": "extraction"}

event: done
data: {"wall_time_s": 72.4}
```

Acceptance for the protocol: client can replay a recorded SSE stream from a fixture file and the UI renders the same three panes deterministically. (This is how we develop the UI without burning tokens.)

---

## 5. BYOK — security model

- The key lives in `localStorage` under a single key (`threadmap.byok`), namespaced by provider.
- The key never leaves the browser except as an `X-LLM-Provider-Key` header on the `/api/extract` request to *our own* Vercel route, which forwards it as a header to the Python service.
- The Python service reads the header into `os.environ` *for the duration of the request only*, runs DSPy, and `del`s the variable in a `finally`.
- We never log request bodies or headers in either service. Add a top-of-file `logging.getLogger("uvicorn.access").disabled = True` and document this in the Python README.
- Banner in the UI: "Your key is sent only to threadmap's extraction service for this run, and is never stored. Source: github.com/suhaasteja/threadmap". Link to the relevant 20-line file so it's auditable.
- Add a "Clear stored key" button next to the field.

What we are *not* claiming: this is not enterprise-grade key custody. It is honest BYOK for a public demo.

---

## 6. Target file tree

```
threadmap/                       # existing Python project
├── threadmap/...                # unchanged
├── server/                      # NEW — thin FastAPI wrapper around extract.build_mindmap
│   ├── main.py                  # /extract endpoint, SSE generator
│   ├── stream.py                # converts dspy trajectory steps -> our event protocol
│   └── pyproject.toml           # adds fastapi, uvicorn, sse-starlette
└── web/                         # NEW — Next.js app
    ├── package.json
    ├── next.config.ts
    ├── app/
    │   ├── layout.tsx
    │   ├── page.tsx             # the three-pane UI
    │   └── api/
    │       └── extract/route.ts # streaming proxy to the Python service
    ├── components/
    │   ├── InputPane.tsx
    │   ├── TrajectoryPane.tsx
    │   ├── StepCard.tsx
    │   ├── MindMapPane.tsx       # ported from threadmap/render.py to React
    │   └── KeyField.tsx
    ├── lib/
    │   ├── sse.ts                # typed EventSource client for our protocol
    │   └── costs.ts              # provider price tables, est_cost_usd
    └── fixtures/
        └── sample-trajectory.sse # canned event stream for offline UI dev
```

The Python service is *just an HTTP wrapper* around the existing `extract.build_mindmap`. No business logic moves out of the package.

---

## 7. Phases — each is a commit, each is verifiable

### Phase U0 — Python service & event protocol

1. Add `server/` with FastAPI. One endpoint: `POST /extract` returning SSE.
2. Translate the DSPy trajectory into our event schema (§4). A trajectory step from DSPy carries some of these fields; map what exists, leave others empty.
3. The endpoint reads `X-LLM-Provider-Key` into `os.environ[provider_key_name]` for the duration of the request only.
4. Provide `fixtures/sample-trajectory.sse`: a recorded run against the bundled sample so UI dev does not need an API key.

**Acceptance.** `curl -N -X POST localhost:8000/extract -H 'Content-Type: application/json' -d @sample_body.json` streams `status`, multiple `step`, `tokens`, `final_mindmap`, `done` events in order. With `X-LLM-Provider-Key` unset, returns 401 with a clear error. Stateless: two requests with different keys never cross-pollute.

### Phase U1 — Next.js scaffold + fixture-driven UI

1. `web/` Next.js (App Router, TS, Tailwind). Three-pane layout with placeholder content.
2. `lib/sse.ts` — a typed EventSource wrapper that emits `step`, `tokens`, `final_mindmap`, `done`, `error`.
3. Wire the panes to consume the fixture file via a "Replay sample" button — no backend yet. This proves the UI works end-to-end before any network code.

**Acceptance.** `pnpm dev`, click "Replay sample", watch the trajectory pane fill in real time and the mind map appear at the end. All entirely offline.

### Phase U2 — Input pane (real, including BYOK and instruction editor)

1. Tabs: Sample / Paste / Drop. Drop uses the File System Access fallback to read a `.md/.txt/.json`.
2. Provider radio + key field (`KeyField.tsx` with mask/show toggle + "Clear" button + persists to localStorage namespaced by provider).
3. Model strings (defaults from `config.py`, editable).
4. Instruction editor: prefilled with `prompts/mindmap_instruction.md` content shipped as a static asset; "Reset to default" button. **This is the surface, not a setting.**

**Acceptance.** Hard-refresh the page, fields persist (except the key honors the user's choice — default to *not* persisting unless they tick "Remember"). Edit the instruction, edits survive a reload. The "Run" button is disabled until: input present + key present + models filled.

### Phase U3 — Live run wired to Python service

1. `app/api/extract/route.ts` — a streaming proxy. Reads the body, forwards to the Python service URL (`process.env.THREADMAP_SERVICE_URL`), pipes the SSE response back. No mutation of events.
2. Hook the "Run" button to POST to `/api/extract` and feed the SSE stream into the existing fixture-driven pane components. The component code does not change — same event protocol.
3. `lib/costs.ts` keeps a small price table per model and computes `est_cost_usd` from token counts client-side as a fallback in case the server omits it.

**Acceptance.** With the Python service running locally and a real Gemini key, clicking Run on the bundled sample streams a real trajectory, the mind map appears, the counters tick up, downloads work. Stopping the service mid-run shows a graceful error in the UI without crashing it.

### Phase U4 — Polish and deploy

1. Loading states for slow first step (RLM warmup feels long; show a "warming up sandbox" hint for the first ~10s of silence).
2. Mobile/narrow layout: stack panes vertically with the trajectory collapsed by default.
3. Empty-state copy that doubles as the "what is RLM, why is this trajectory pane the point" pitch.
4. Deploy: Next.js → Vercel; Python service → Modal (recommended — single `modal deploy`, cheap, scales to zero) or Render/Fly. Set `THREADMAP_SERVICE_URL` and a `THREADMAP_SERVICE_SHARED_SECRET` (header check so randoms can't bill the service).
5. Add a public demo button: "Use the maintainer's quota for one tiny sample" — gated by IP rate limit + only allowed against the bundled sample.

**Acceptance.** Open the production URL on a clean browser, paste a key, click Run on the sample, see the full flow end-to-end.

### Phase U5 (optional polish) — Code highlighting & step density

1. Syntax highlight the `code` field with Shiki (server-rendered, no runtime JS payload).
2. Group consecutive `sub_llm` events under the parent `root` step that dispatched them, so the trajectory pane stays readable on long runs.
3. "Copy as cURL" for the request, "Copy trajectory JSONL" for the run — pairs well with the learning-tool framing.

---

## 8. Stretch (not MVP, write down so we don't forget)

- **Trajectory ↔ map linking.** Have the RLM emit `step_id` for each node it creates. Clicking a node in the right pane highlights the producing step in the middle pane; clicking a step highlights any nodes it produced. Pedagogically gold. Real cost: requires instruction edits + a stable id-passing convention through DSPy outputs.
- **Diff two runs.** Same input, two different instructions or two different root models. Side-by-side trajectory + map diff. Sells the "instruction is the lever" lesson better than any docs page.
- **Share link.** Persist a single run (trajectory + map) as a static JSON on object storage, generate a `share/<id>` URL that replays it. No account needed.
- **Streaming mind map.** Build the SVG progressively as nodes arrive, instead of waiting for `final_mindmap`. Visually striking; would need the RLM to emit partial results.

---

## 9. Risks and open questions

- **DSPy trajectory shape.** We need to confirm what fields are present per step in the version we're pinned to. Phase U0 task one: dump a real trajectory and write `stream.py` against the actual shape, not a hoped-for one.
- **Sub-LLM call attribution.** RLM's sub-calls happen inside the sandboxed code execution. We may need to subclass or wrap `dspy.LM` to record per-call tokens with a parent-step pointer. If this proves invasive, fall back to root-level totals only for MVP.
- **Vercel ↔ Python latency.** SSE over two hops (browser → Vercel → Python) is fine but each hop adds a small buffer. Confirm events arrive in roughly real time, not in a batch at the end.
- **Cost surprises.** A user pasting a 200k-token transcript could rack up significant Gemini cost. Show an estimated cost *before* the run (rough: total chars / 4 × root price + a heuristic sub multiplier) and require explicit confirmation above a threshold (e.g. $0.50).
- **Python service warmup.** Modal/Render cold starts add 5–20s. Either keep the service warm (cost) or surface "warming up" copy honestly (recommended).
- **Single-file HTML output.** The current `render.to_html()` is a self-contained file; the React `MindMapPane` is its sibling. Keep both — the file is still useful as an artifact users can save and re-open offline.

---

## 10. What this UI ultimately argues for

That RLM is worth using even when the input fits in context, because **a trajectory is auditable in a way a one-shot completion is not**. The mind map is the artifact you keep; the trajectory is what convinces you the artifact is trustworthy. Build the UI so a skeptical visitor can see, in 60 seconds, the difference between "AI gave me a summary" and "I watched a model decompose a conversation in code, validate its own output against a schema, and assemble a structured artifact." If the trajectory pane is dull, the project is dull. If it's good, the rest of the product writes itself.
