# threadmap

Turn one long Claude conversation into a navigable mind map using a DSPy Recursive Language Model (RLM).

## Install

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# Deno (required by DSPy's RLM sandbox):
curl -fsSL https://deno.land/install.sh | sh
cp .env.example .env   # then fill in ANTHROPIC_API_KEY
```

## Usage

```bash
threadmap build examples/sample_conversation.md --out out/ --trace
```

Outputs land in `out/`: `mindmap.html`, `mindmap.md`, `mindmap.json`, and (with `--trace`) `trace.txt`.
