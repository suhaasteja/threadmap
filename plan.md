# threadmap — Build Plan

Read `context.md` first. This file is the step-by-step build order for Claude Code. Build in the phases given; each phase has acceptance criteria you can verify before moving on. Favor small, readable modules over cleverness.

---

## Target file tree

```
threadmap/
├── README.md                  # quickstart: install, set key, run
├── requirements.txt           # dspy>=3.1.2, pydantic>=2, python-dotenv, typer
├── .env.example               # ANTHROPIC_API_KEY=
├── pyproject.toml             # optional; console_script entry point "threadmap"
├── threadmap/
│   ├── __init__.py
│   ├── models.py              # Document, Node, Edge, MindMap (the contracts)
│   ├── ingest.py              # load_conversation(source) -> Document  [PLUGGABLE]
│   ├── extract.py             # build_mindmap(doc, instruction) -> (MindMap, trajectory)
│   ├── render.py              # to_html(mm), to_markdown(mm), to_json(mm)  [PLUGGABLE]
│   ├── config.py              # model names, paths, env loading
│   └── cli.py                 # `threadmap build <input> --out ... --trace`
├── prompts/
│   └── mindmap_instruction.md # the explicit extraction instruction (editable)
├── examples/
│   └── sample_conversation.md # a fixture to test against without burning tokens on a real export
└── tests/
    └── test_pipeline.py       # schema validation + ingestion + render (mock the LM)
```

Keep the three pluggable layers (`ingest`, `extract`, `render`) free of cross-imports beyond `models`. That isolation is the scalability guarantee.

---

## Phase M0 — Skeleton & contracts

1. Scaffold the tree above. `requirements.txt`, `.env.example`, `README.md` stub.
2. Implement `models.py` exactly as specified in `context.md` §5.
3. `config.py`: load `.env`, expose `ROOT_MODEL` (a current coding-strong Claude model string), `SUB_MODEL` (a cheaper model), and output dir defaults.

**Acceptance:** `python -c "from threadmap.models import MindMap"` works; a hand-written `MindMap(...)` validates and round-trips through `.model_dump_json()` / `.model_validate_json()`.

## Phase M1 — Ingestion

Implement `ingest.load_conversation(source: str | Path) -> Document`:

- Detect format: if `*.json`, parse a Claude `conversations.json` export; otherwise treat as plain text/markdown transcript.
- Normalize to **one turn per line**, role-tagged, e.g. `USER: ...` / `ASSISTANT: ...`. Preserve order; strip nothing meaningful.
- Populate `metadata`: `source`, `turn_count`, `est_tokens` (rough = chars/4 is fine for MVP).
- Keep the JSON parser tolerant: if structure is unexpected, fall back to flattening all message text in order rather than crashing.

**Design for scale (do now, cheap):** make the public surface `load(source)` dispatch to a loader chosen by type. A future `load_directory()` that returns a list of `Document`s — or one concatenated `Document` with `\n\n===== CONVERSATION N =====\n\n` separators — should slot in without touching `extract`/`render`.

**Acceptance:** running ingestion on `examples/sample_conversation.md` returns a `Document` with correct `turn_count` and sane `est_tokens`; running on a small fake `conversations.json` returns equivalent normalized text.

## Phase M2 — Extraction (the RLM core)

Implement `extract.build_mindmap(doc: Document, instruction: str) -> tuple[MindMap, list]`:

1. Configure DSPy once:
   ```python
   import dspy
   lm = dspy.LM(config.ROOT_MODEL)         # coding-strong Claude
   dspy.configure(lm=lm)
   ```
2. Define the RLM with a typed output bound to our schema. Use the DSPy signature form and route sub-calls to the cheaper model:
   ```python
   rlm = dspy.RLM("conversation, instruction -> mindmap: MindMap", sub_lm=dspy.LM(config.SUB_MODEL))
   result = rlm(conversation=doc.text, instruction=instruction)
   mm = MindMap.model_validate(result.mindmap)   # validate/coerce
   return mm, result.trajectory
   ```
   If binding a Pydantic type directly in the signature is unreliable, fall back to `-> mindmap: str` returning JSON and `MindMap.model_validate_json(...)`. Pick whichever the installed DSPy version handles cleanly; note the choice in a comment.
3. Load the instruction text from `prompts/mindmap_instruction.md` (so it's editable without code changes).
4. Add a `validate_mindmap()` helper exposed to the RLM via the `tools=` param: it checks every `parent_id`/edge endpoint references an existing node id and that exactly one root exists. This gives the model a guardrail to self-correct before `SUBMIT()`.
5. Defensive post-processing: if validation still fails, repair obvious issues (orphan → attach to root) rather than crashing; log what was repaired.

**Write the instruction to be explicit** (this is the single biggest quality lever — see `context.md` §3 lesson). It must state: pick 4–8 top-level themes as children of root; nest sub-points 1–2 levels deep; each node gets a short label + 1–2 sentence summary; add `edges` for ideas that relate across branches, marking `contradicts`/`depends-on`/`relates-to`; ignore pure pleasantries; prefer the *content* of turns over surface keywords.

**Acceptance:** on `examples/sample_conversation.md`, returns a schema-valid `MindMap` with one root, several themed branches, and ≥1 cross edge. `trajectory` is non-empty.

## Phase M3 — Rendering

Implement in `render.py`, each taking a `MindMap`:

- `to_json(mm, path)` — pretty JSON. (Doubles as the persistence stub for the future atlas.)
- `to_markdown(mm, path)` — nested bullet outline **plus** a fenced ` ```mermaid ` `mindmap` block generated from the tree. List cross-edges in a short "Connections" section below.
- `to_html(mm, path)` — a single self-contained `.html` file: an interactive, pan/zoom/collapsible mind map. No build step, no external network calls at runtime. A small vanilla-JS + SVG renderer, or inline a library from a CDN-pinned `<script>` is acceptable; embed the `MindMap` JSON inline as the data source. Cross-edges drawn as dashed links.

Keep each renderer pure (MindMap in → file out) so new formats are additive.

**Acceptance:** all three files generate from a fixture `MindMap` with no LM call; the HTML opens in a browser and is navigable offline; the Mermaid block renders.

## Phase M4 — CLI & glue

Implement `cli.py`:

```
threadmap build <input_path> [--out DIR] [--format html,md,json] [--trace] [--instruction PATH]
```

- Pipeline: `ingest → extract → render`, printing progress and token/time info between stages.
- `--trace`: write the full RLM trajectory to `<out>/trace.txt` (each step: reasoning, code, truncated output) — this is the learning payoff; make it readable.
- Clear, early errors for: missing `ANTHROPIC_API_KEY`, missing Deno, unreadable input.
- Exit non-zero on failure; print the output paths on success.

**Acceptance:** end-to-end `threadmap build examples/sample_conversation.md --out out/ --trace` produces `mindmap.html`, `mindmap.md`, `mindmap.json`, and `trace.txt`, and prints their paths.

---

## Testing approach

- `tests/test_pipeline.py` should run **without hitting the API**: mock/stub `extract.build_mindmap` to return a fixed `MindMap`, and assert ingestion normalization and all three renderers. Validate the schema invariants (single root, all references resolve).
- Provide `examples/sample_conversation.md` (a short, multi-topic fake Claude chat) so the real RLM path can be smoke-tested cheaply by hand.

## README must cover

Install (incl. Deno), copy `.env.example` → `.env` and add the key, how to export a real Claude conversation, the one `threadmap build` command, and where outputs land.

---

## Scaling notes (leave seams, don't build)

When you later move to longer / multiple documents, only these touch points should change:

1. **Ingestion:** add `load_directory()` returning concatenated `Document`s with separators. Nothing downstream changes — RLM already explores structured text.
2. **Extraction:** the RLM signature is already generic over `conversation`/`context`; for huge inputs, rely on `llm_query_batched` sub-calls (the model does this itself) and consider raising `max_iterations`. Optionally introduce a DSPy optimizer later to compile the instruction.
3. **Rendering / persistence:** `to_json` is already the atlas seed. A future `atlas` command would load many `MindMap` JSONs and compute shared nodes/edges across them — a new module consuming the same contract, not a rewrite.

If any future feature would force edits across all three layers at once, stop and revisit the interface in `models.py` — that's the signal the contract needs to absorb the change instead.
