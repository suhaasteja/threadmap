# threadmap extraction service

Thin FastAPI wrapper that runs `threadmap.extract.build_mindmap` and streams
the trajectory as Server-Sent Events.

## Local

```bash
# from repo root
pip install -e .
pip install -r server/requirements.txt
uvicorn server.main:app --reload --port 8000

# health
curl localhost:8000/health

# extract — uses your own Gemini key, sent only as a header
cat > /tmp/body.json <<'JSON'
{
  "conversation_text": "USER: hi\nASSISTANT: hello",
  "root_model": "gemini/gemini-2.5-pro",
  "sub_model": "gemini/gemini-2.5-flash"
}
JSON
curl -N -X POST http://localhost:8000/extract \
  -H "Content-Type: application/json" \
  -H "X-LLM-Provider: gemini" \
  -H "X-LLM-Provider-Key: $GEMINI_API_KEY" \
  --data @/tmp/body.json
```

## Render deploy

1. Push `render.yaml` (already at repo root).
2. In Render: **New +** → **Blueprint** → pick this repo.
3. Set `THREADMAP_SHARED_SECRET` in the Render dashboard. The Vercel proxy
   will send this in `X-Threadmap-Shared-Secret`; requests without it 401.
4. (Optional) Tighten `THREADMAP_ALLOWED_ORIGINS` to your Vercel URL.

The Dockerfile installs Deno because `dspy.RLM`'s default sandbox is
Pyodide-in-Deno.

## Event protocol

See `ui-plan.md` §4. Quick summary:

```
event: status         { phase, message }
event: step           { index, kind, elapsed_s, model?, reasoning?, code?, output?, tool_name?, tool_result?, tokens? }
event: tokens         { root_in, root_out, sub_in, sub_out }
event: final_mindmap  { ...MindMap... }
event: error          { message, where }
event: done           { wall_time_s }
```

## Security

- The provider key is taken from `X-LLM-Provider-Key`, set into a per-request
  env var, and reset in a `finally` block. It is never persisted or logged.
- `uvicorn.access` logging is disabled so request bodies (which carry the
  transcript and key header) never reach disk.
- Optional `X-Threadmap-Shared-Secret` gate prevents random callers from
  using your deployed service to drive Gemini/Anthropic calls.
