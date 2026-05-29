# threadmap — MVP Summary

Turn one long Claude conversation into a navigable mind map, using a DSPy Recursive Language Model (RLM). Built simple for one conversation, layered so it scales.

---

## What this delivers today

- **One command**, end to end: `threadmap build <conversation> --out out/ --trace`
- **Inputs:** plain text/markdown transcripts OR Claude's `conversations.json` export.
- **Outputs:**
  - `mindmap.html` — self-contained interactive mind map (pan/zoom/click-to-collapse, side panel for summaries and cross-links). Opens offline; no CDN, no server.
  - `mindmap.md` — nested bullet outline + a fenced Mermaid `mindmap` block + a Connections section for cross-links.
  - `mindmap.json` — the raw `MindMap` (the persistence + future-atlas seed).
  - `trace.txt` (with `--trace`) — the RLM's step-by-step trajectory: reasoning, code it ran, and outputs. This is the learning view.
- **Architecture:** four decoupled layers — ingestion, extraction, rendering, CLI — so scaling later means adding a loader or a renderer, not rewriting the pipeline.
- **Safety net:** schema validator the RLM can call mid-run, plus a defensive repair pass that fixes orphans/multi-root/dangling edges instead of crashing.

---

## Build stages (each a commit, each user-verifiable)

```
3e723a1 M4: typer CLI (build + --trace + preflight), pyproject + entry point
a76bfae M3: renderers (json, markdown+mermaid, offline html with pan/zoom/collapse)
20c7d5b M2: extraction via dspy.RLM with validator tool + repair pass
6ce3a0d M1: ingestion (text/md + tolerant conversations.json parser) + sample
3bf151b M0: skeleton + contracts (models, config, stubs, instruction prompt)
```

### M0 — Skeleton & contracts
- `threadmap/models.py`: `Document`, `Node`, `Edge`, `MindMap` (Pydantic v2). The spine.
- `threadmap/config.py`: env loading, model names, default paths, `require_api_key()`.
- All other modules are stubs raising `NotImplementedError` — proves the seams are wired.
- Editable prompt at `prompts/mindmap_instruction.md`.

### M1 — Ingestion
- `load_conversation(path)` dispatches on extension: `.json` → tolerant Claude export parser; everything else → text/markdown.
- Normalizes every turn to `ROLE: body` on one line. Metadata: `source`, `turn_count`, `est_tokens`.
- JSON parser is fault-tolerant: unknown shapes fall back to flattened text rather than crashing.

### M2 — Extraction (DSPy RLM)
- `dspy.RLM("conversation, instruction -> mindmap_json: str", sub_lm=cheaper_model, tools=[validate])`.
- Returns parsed `MindMap` + the full `trajectory` for `--trace`.
- `validate_mindmap_json` tool is exposed to the model so it can self-check before submitting.
- `_repair` post-process guarantees a single root, valid parent refs, and no dangling edges.

### M3 — Rendering
- `to_json`, `to_markdown` (bullets + Mermaid + Connections), `to_html` (offline SVG with pan/zoom + collapse + detail panel).
- Each renderer is pure: `MindMap` → file. Adding a new format is additive.

### M4 — CLI & glue
- `threadmap build <input> [--out DIR] [--format html,md,json] [--trace] [--instruction PATH]`
- Preflight: file exists, `ANTHROPIC_API_KEY` set, warn if Deno missing.
- Progress + timing/token info between stages so a multi-minute RLM run doesn't feel hung.

---

## How to test it

```bash
cd /Users/mac/Desktop/threadmap
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt pytest
pip install -e .
```

### Offline (no API key, no Deno required)

```bash
pytest -q                         # 19 tests, LM is mocked
threadmap --help
threadmap build --help
```

Per-stage smoke checks (each works at the matching commit, but all also pass on HEAD):

```bash
# M0 — contracts round-trip
pytest -q tests/test_models.py

# M1 — ingestion on the sample
pytest -q tests/test_ingest.py
python -c "from threadmap.ingest import load_conversation as L; d=L('examples/sample_conversation.md'); print('turns:', d.metadata['turn_count']); print(d.text[:300])"

# M2 — validator + repair (offline parts of extraction)
pytest -q tests/test_extract_unit.py

# M3 — renderers using a fixture (no LM call)
pytest -q tests/test_render.py
python - <<'PY'
from threadmap.models import MindMap, Node, Edge
from threadmap.render import to_html, to_markdown, to_json
mm = MindMap(title='demo',
  nodes=[Node(id='r',label='Root'),
         Node(id='a',label='A',parent_id='r',summary='first'),
         Node(id='b',label='B',parent_id='r'),
         Node(id='a1',label='A.1',parent_id='a')],
  edges=[Edge(source_id='a1',target_id='b',relation='relates-to')])
to_json(mm, 'out/mindmap.json'); to_markdown(mm, 'out/mindmap.md'); to_html(mm, 'out/mindmap.html')
print('wrote out/mindmap.{json,md,html}')
PY
open out/mindmap.html
```

### Live end-to-end (uses your key + tokens)

```bash
cp .env.example .env
# fill in ANTHROPIC_API_KEY=sk-...
curl -fsSL https://deno.land/install.sh | sh   # one time, for the RLM sandbox

threadmap build examples/sample_conversation.md --out out/ --trace
open out/mindmap.html
less out/trace.txt        # see how the RLM decomposed the conversation
```

### Tweak without touching code
- Edit `prompts/mindmap_instruction.md`, re-run — extraction behavior shifts.
- Swap models via env: `THREADMAP_ROOT_MODEL=anthropic/claude-sonnet-4-6 threadmap build ...`
- `THREADMAP_SUB_MODEL=...` controls the cheaper model used for RLM sub-calls.

---

## Value today

- **Sees structure you can't get by scrolling.** A long Claude session has 6–8 real themes buried in chronological order; the mind map surfaces them in seconds.
- **Cross-links, not just hierarchy.** Edges (`relates-to`, `contradicts`, `depends-on`) catch the moments where the conversation reaches across branches — the most interesting bits.
- **The trajectory is the lesson.** `--trace` is the cheapest way to actually understand how an RLM works: you read the code it wrote and the slices it explored.
- **Architecture is the asset.** Four decoupled layers + a small Pydantic contract means future features almost never require cross-layer edits. That's what makes the MVP cheap to grow.
- **Zero infrastructure.** No server, no DB, no auth. One CLI, three files, a browser.

---

## Honest limits

- For a single conversation that fits in context (~50–150k tokens), a one-shot prompt with a strict schema can match or beat RLM on cost and quality. RLM here is partly a learning investment for the multi-document case.
- Quality is bounded by the instruction. The single biggest lever is `prompts/mindmap_instruction.md`, not the code.
- `dspy.RLM` is experimental; the API may shift. Version is pinned.
- Runs cost real tokens and take a minute or two. Don't expect interactive latency.
- HTML renderer is hand-rolled SVG — fine for ~100 nodes, will get cramped beyond that without smarter layout.

---

## Future directions (worth building, in rough priority)

### Quality & UX

1. **Iterate the instruction.** Add a small eval harness: a handful of fixture conversations + a rubric (theme count, cross-link count, parent-child fidelity). Treat instruction edits as experiments with measurable deltas.
2. **DSPy optimizer.** Once the eval exists, compile the program (`MIPROv2` or similar) so the instruction is *learned* against the rubric instead of hand-tuned.
3. **Smarter HTML layout.** Drop the SVG hand-roll for D3 hierarchy or a force-directed view; add search, breadcrumbs, and "expand all descendants of X".
4. **Citations.** Each node carries `source_turn_ids: list[int]`; clicking a node highlights the exact turns it came from. Turns chat-noise into evidence.
5. **Streaming progress.** Pipe trajectory steps to stdout as they happen so a 2-minute run feels alive.

### Scale

6. **`load_directory()`** — many conversations → one concatenated `Document` with `===== CONVERSATION N =====` separators. Extraction code does not change; RLM is built for this.
7. **Multi-map atlas.** A new `atlas` command consumes a folder of `mindmap.json` files and computes a force-directed network of shared nodes / themes across conversations. Persistence is already JSON, so this is additive.
8. **Bigger inputs.** Raise `max_iterations`, lean on `llm_query_batched` for huge contexts, cache slices.

### Integrations

9. **Loaders for other sources.** ChatGPT export, Slack threads, meeting transcripts, a folder of markdown notes. Each is one file in `ingest/`.
10. **Output to Obsidian.** A renderer that writes one note per node with `[[wikilinks]]` for parent/child and edges. Mind map becomes a real PKM graph.
11. **Output to Notion / Mermaid Live / Excalidraw.** Pure renderers; no pipeline changes.
12. **Watcher mode.** `threadmap watch ~/Claude-exports/` re-runs whenever a file changes; pairs nicely with the atlas.

### Product polish

13. **Web UI.** Drop a transcript on a page, get the map back. Same core pipeline behind a tiny FastAPI server.
14. **Browser/desktop wrapper.** Direct integration with claude.ai exports or with Claude Code session transcripts.
15. **Diff between maps.** Run the same conversation through two instructions / two models; see what each picks up that the other misses.

---

## Where the leverage really is

If you only do three of the above, do these:

1. **Citations on nodes** — turns the map from "vibes summary" into something auditable.
2. **`load_directory()` + atlas** — this is the moment threadmap stops being a viewer and starts being a *knowledge base over all your past conversations*. That's the order-of-magnitude jump.
3. **An eval harness + optimizer pass** — replaces hand-tuning with measurable quality. Cheap to add, compounds with every other feature.

Everything else is polish on top of those three.
