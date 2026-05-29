# threadmap

Turn one long Claude conversation into a navigable mind map using a DSPy Recursive Language Model (RLM).

## Install

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# Deno (required by DSPy's RLM sandbox):
curl -fsSL https://deno.land/install.sh | sh
cp .env.example .env   # then fill in GEMINI_API_KEY (default), or another provider's key
```

## Usage

```bash
threadmap build examples/sample_conversation.md --out out/ --trace
```

Outputs land in `out/`: `mindmap.html`, `mindmap.md`, `mindmap.json`, and (with `--trace`) `trace.txt`.

## Models

Defaults: `gemini/gemini-2.5-pro` (root) + `gemini/gemini-2.5-flash` (sub).
DSPy routes through LiteLLM, so any LiteLLM-supported model works. Override via env:

```bash
THREADMAP_ROOT_MODEL=anthropic/claude-opus-4-5 \
THREADMAP_SUB_MODEL=anthropic/claude-haiku-4-5 \
threadmap build mychat.md --out out/
```

The CLI checks for the env var matching your root model's provider
(`GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc.) and errors
clearly if it's missing.
