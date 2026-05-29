"""FastAPI service: thin HTTP+SSE wrapper around threadmap.extract.

One endpoint, /extract, returns Server-Sent Events. The visitor's
provider key arrives in the X-LLM-Provider-Key header and lives in
process memory only for the duration of the request.

Run locally:
    uvicorn server.main:app --reload --port 8000

Deploy: see render.yaml at repo root.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Iterator

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from . import stream

# never log request bodies — they contain user transcripts and keys
logging.getLogger("uvicorn.access").disabled = True


app = FastAPI(title="threadmap extraction service", version="0.1.0")

# CORS: the Next.js app on Vercel proxies to us, but during local dev the
# browser may hit this directly. Locked to known origins in production via env.
_allowed = os.getenv("THREADMAP_ALLOWED_ORIGINS", "*")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _allowed.split(",")] if _allowed != "*" else ["*"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
)


# ---------- types ----------


class ExtractBody(BaseModel):
    conversation_text: str = Field(..., min_length=1)
    instruction: str | None = None
    root_model: str = "gemini/gemini-2.5-pro"
    sub_model: str = "gemini/gemini-2.5-flash"


_PROVIDER_KEY_VARS = {
    "gemini": "GEMINI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
    "openai": "OPENAI_API_KEY",
    "openrouter": "OPENROUTER_API_KEY",
    "groq": "GROQ_API_KEY",
    "deepseek": "DEEPSEEK_API_KEY",
    "mistral": "MISTRAL_API_KEY",
}


# ---------- routes ----------


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/extract")
def extract_endpoint(
    body: ExtractBody,
    request: Request,
    x_llm_provider_key: str | None = Header(default=None, alias="X-LLM-Provider-Key"),
    x_llm_provider: str | None = Header(default=None, alias="X-LLM-Provider"),
    x_threadmap_shared_secret: str | None = Header(
        default=None, alias="X-Threadmap-Shared-Secret"
    ),
) -> StreamingResponse:
    # optional shared-secret gate so randoms can't bill our deployed service
    expected_secret = os.getenv("THREADMAP_SHARED_SECRET")
    if expected_secret and x_threadmap_shared_secret != expected_secret:
        raise HTTPException(status_code=401, detail="invalid shared secret")

    if not x_llm_provider_key:
        raise HTTPException(status_code=401, detail="missing X-LLM-Provider-Key header")

    provider = (x_llm_provider or _infer_provider(body.root_model)).lower()
    key_var = _PROVIDER_KEY_VARS.get(provider)
    if not key_var:
        raise HTTPException(
            status_code=400,
            detail=f"unknown provider '{provider}'. Supported: {sorted(_PROVIDER_KEY_VARS)}",
        )

    instruction = body.instruction or _load_default_instruction()

    req = stream.ExtractRequest(
        conversation_text=body.conversation_text,
        instruction=instruction,
        root_model=body.root_model,
        sub_model=body.sub_model,
        provider_key=x_llm_provider_key,
        provider_key_var=key_var,
    )

    def sse() -> Iterator[bytes]:
        try:
            for evt in stream.run_extraction_stream(req):
                yield _frame(evt["event"], evt["data"]).encode("utf-8")
        except Exception as e:
            yield _frame("error", {"message": str(e), "where": "stream"}).encode("utf-8")

    return StreamingResponse(
        sse(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


# ---------- helpers ----------


def _frame(event: str, data) -> str:
    payload = json.dumps(data, ensure_ascii=False, default=str)
    return f"event: {event}\ndata: {payload}\n\n"


def _infer_provider(model: str) -> str:
    return model.split("/", 1)[0] if "/" in model else "openai"


def _load_default_instruction() -> str:
    from threadmap.config import DEFAULT_INSTRUCTION_PATH

    return DEFAULT_INSTRUCTION_PATH.read_text(encoding="utf-8")
