# threadmap — Project Context

> Turn one long Claude conversation into a navigable mind map, using a Recursive Language Model (RLM) via DSPy. Built simple for a single conversation, but layered so it scales to large/multi-document inputs later.

This file orients whoever (or whatever) builds the project. Read it fully before writing code. The companion `plan.md` contains the concrete build steps.

---

## 1. The problem

Long Claude sessions accumulate good ideas, decisions, and tangents that get buried in scroll-back. Linear chat is a bad medium for *seeing structure*. We want to compress one session into a hierarchical mind map (plus a few cross-links between related ideas) that you can actually navigate.

## 2. What the MVP does

- **Input:** one Claude conversation, supplied either as a plain-text/markdown transcript **or** a `conversations.json` export.
- **Process:** normalize to text → run a DSPy RLM that explores the conversation and extracts a structured mind map → validate against a schema.
- **Output:** a self-contained interactive HTML mind map (pan/zoom/collapse) **and** a Markdown outline with an embedded Mermaid `mindmap`. Plus the raw `MindMap` JSON.
- **Bonus (core to the learning goal):** a `--trace` mode that dumps the RLM's step-by-step trajectory so you can *see how it decomposed the conversation*.

That's it. Single command, local, no server, no database.

## 3. Why RLM (and the honest caveat)

RLM treats a long prompt as a variable in a Python REPL the model can explore with code and recursive sub-calls, instead of stuffing everything into one context window. It was designed to fight "context rot" — quality degradation as context grows — and to handle inputs far larger than the window.

**Honest note for this MVP:** a single conversation (~50k–150k tokens) usually *fits* in a modern context window, so RLM is arguably overkill *right now*. We use it anyway on purpose, because (a) it's the learning objective, and (b) the same pipeline becomes genuinely necessary the moment the input is a folder of conversations or a large document. The architecture below is built so that transition costs almost nothing.

## 4. Core design principle: four decoupled layers

The entire point of the architecture is that **the RLM extraction core never knows where its input came from or where the output is rendered.** Keep these four layers separate behind small interfaces:

```
┌─────────────┐   Document    ┌──────────────┐   MindMap    ┌─────────────┐
│  Ingestion  │ ────────────▶ │  Extraction  │ ───────────▶ │  Rendering  │
│ (load+norm) │   (text+meta) │  (DSPy RLM)  │  (Pydantic)  │ (html/md)   │
└─────────────┘               └──────────────┘              └─────────────┘
        ▲                             │                            │
        │                             ▼                            ▼
   pluggable                   trajectory/trace              MindMap JSON
   loaders                     (learning view)               (persistence stub)
```

- **Ingestion** turns *any* source into a normalized `Document(text, metadata)`. MVP ships one loader (Claude conversation). Scaling = add loaders; the rest of the pipeline is untouched. Multi-doc later is just "concatenate Documents with clear separators" — which RLM is explicitly good at parsing.
- **Extraction** is the DSPy RLM. Its signature is generic over a `context` string and an `instruction`. Swapping schema or instruction does not touch ingestion or rendering.
- **Rendering** consumes a `MindMap` object and emits files. Adding a new output (Obsidian, JSON-only, PNG) is a new renderer, nothing else changes.
- **Orchestration/CLI** wires the three together and owns config.

If a change to one layer forces edits in another, the boundary is wrong — fix the interface, not the symptom.

## 5. Data model (the contract between layers)

The `MindMap` is the spine of the whole system. Tree via `parent_id`; non-hierarchical cross-links via `edges` (this is where RLM's "surface hidden connections / contradictions" value shows up, and it's what makes the future multi-map "knowledge atlas" possible).

```python
from pydantic import BaseModel, Field

class Node(BaseModel):
    id: str                      # stable slug, e.g. "n_03"
    label: str                   # short title shown on the node
    summary: str | None = None   # 1–2 sentence detail
    parent_id: str | None = None # None == root

class Edge(BaseModel):
    source_id: str
    target_id: str
    relation: str                # e.g. "relates-to", "contradicts", "depends-on"

class MindMap(BaseModel):
    title: str
    nodes: list[Node]
    edges: list[Edge] = Field(default_factory=list)
```

`Document` is deliberately tiny:

```python
class Document(BaseModel):
    text: str                    # normalized, role-tagged, one turn per line
    metadata: dict = {}          # source, turn_count, est_tokens, etc.
```

## 6. Tech stack

- **Python 3.11+**
- **DSPy ≥ 3.1.2** (this is when native `dspy.RLM` landed — do not pin older)
- **Pydantic v2** for the schema/validation
- A coding-strong LLM as the RLM root, because RLM works by *writing code*. Use a current Claude model via `dspy.LM('anthropic/<model>')`. Use `sub_lm` to route recursive sub-calls to a cheaper model.
- **Deno** must be installed — DSPy's default RLM interpreter uses a Pyodide WASM sandbox that requires it. (`curl -fsSL https://deno.land/install.sh | sh`)
- Standard CLI via `argparse` or `typer` (keep deps light).
- No web framework, no DB, no auth in the MVP.

## 7. Non-goals for the MVP (do NOT build these yet)

These are real future directions, but building them now violates the "easy to understand" requirement. Leave clean seams (noted in `plan.md`), not implementations.

- Multi-conversation / whole-history ingestion.
- The cross-map "knowledge atlas" / force-directed network.
- A web server, hosted UI, or live/streaming updates.
- DSPy optimizers / compiling the program (just run it directly first).
- Persistence beyond writing JSON files to disk.

## 8. Setup gotchas

- `dspy.RLM` is marked **experimental**; the API may shift. Pin the DSPy version you build against in `requirements.txt`.
- Deno is a hard runtime dependency for the default sandbox — surface a clear error if it's missing.
- `ANTHROPIC_API_KEY` via a `.env` file (use `python-dotenv`); never hard-code it.
- RLM runs can take a couple of minutes and cost real tokens — log progress and token usage so it doesn't feel hung.

## 9. Glossary

- **RLM (Recursive Language Model):** inference strategy where the long input is a variable in a code REPL the model explores; it can recursively call sub-LLMs over slices instead of reading everything at once.
- **`sub_lm`:** DSPy param to use a smaller/cheaper model for the recursive sub-calls.
- **trajectory:** the ordered list of (reasoning, code, output) steps the RLM took — exposed as `output.trajectory`. Our `--trace` mode prints this.
- **context rot:** degradation in model quality as context length grows, even within the window.
