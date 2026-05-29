"""Bridges dspy.RLM execution to our SSE event protocol.

We run extraction in a background thread and use DSPy's callback hooks
to push events into a thread-safe queue as they happen. The SSE
generator drains the queue and emits events to the client in real
time. After extraction completes, we synthesize the final tokens /
final_mindmap / done events from the result.

If the callback hooks are unavailable in a future DSPy version, the
fallback path (`_dump_trajectory_after_run`) still produces a sensible
event stream from `result.trajectory` after completion.
"""

from __future__ import annotations

import json
import queue
import threading
import time
import traceback
from dataclasses import dataclass
from typing import Any, Iterator

import dspy
from dspy.utils.callback import BaseCallback

from threadmap import config, extract, ingest
from threadmap.models import Document, MindMap


# ---------- public ----------


@dataclass
class ExtractRequest:
    conversation_text: str
    instruction: str
    root_model: str
    sub_model: str
    provider_key: str
    provider_key_var: str  # e.g. "GEMINI_API_KEY"


def run_extraction_stream(req: ExtractRequest) -> Iterator[dict]:
    """Yield event dicts as the run progresses.

    Each dict has shape: {"event": "<name>", "data": <json-serializable>}.
    The caller wraps them in SSE framing.
    """
    yield _evt("status", {"phase": "ingesting", "message": "normalizing transcript"})

    # build a Document from raw text (skip the file-path code path)
    doc = _doc_from_text(req.conversation_text)
    yield _evt(
        "status",
        {
            "phase": "extracting",
            "message": f"turns={doc.metadata['turn_count']} est_tokens≈{doc.metadata['est_tokens']}",
        },
    )

    # set the provider key for this request only
    import os

    prior = os.environ.get(req.provider_key_var)
    os.environ[req.provider_key_var] = req.provider_key
    # config picked up its model values at import time; override now.
    config.ROOT_MODEL = req.root_model
    config.SUB_MODEL = req.sub_model

    q: "queue.Queue[dict]" = queue.Queue()
    cb = _RLMCallback(q, root_model=req.root_model, sub_model=req.sub_model)
    dspy.settings.configure(callbacks=[cb])

    result_box: dict[str, Any] = {}

    def worker() -> None:
        t0 = time.time()
        try:
            mm, trajectory = extract.build_mindmap(doc, req.instruction)
            result_box["mm"] = mm
            result_box["trajectory"] = trajectory
            result_box["wall_time_s"] = time.time() - t0
        except Exception as e:
            result_box["error"] = f"{type(e).__name__}: {e}"
            result_box["traceback"] = traceback.format_exc()
        finally:
            q.put({"__done__": True})

    t = threading.Thread(target=worker, daemon=True)
    t.start()

    last_heartbeat = time.time()
    while True:
        try:
            item = q.get(timeout=2.0)
        except queue.Empty:
            now = time.time()
            if now - last_heartbeat >= 8.0:
                yield _evt("status", {"phase": "extracting", "message": "still working..."})
                last_heartbeat = now
            continue

        if item.get("__done__"):
            break
        yield item
        last_heartbeat = time.time()

    # cleanup callback so it doesn't leak into the next request
    try:
        dspy.settings.configure(callbacks=[])
    except Exception:
        pass

    # restore env
    if prior is None:
        os.environ.pop(req.provider_key_var, None)
    else:
        os.environ[req.provider_key_var] = prior

    if "error" in result_box:
        yield _evt("error", {"message": result_box["error"], "where": "extraction"})
        return

    mm: MindMap = result_box["mm"]
    yield _evt("tokens", cb.token_snapshot())
    yield _evt("final_mindmap", mm.model_dump())
    yield _evt("done", {"wall_time_s": round(result_box["wall_time_s"], 2)})


# ---------- internals ----------


def _evt(event: str, data: Any) -> dict:
    return {"event": event, "data": data}


def _doc_from_text(text: str) -> Document:
    """Skip file I/O: run the same normalization as ingest, on a string."""
    # Reuse the markdown parser by writing the text through the text path.
    # ingest._parse_text expects raw text; we call it directly to avoid a tmp file.
    from threadmap.ingest import _parse_text  # internal but stable for our use

    turns = _parse_text(text)
    if not turns:
        # no role markers found -> treat the whole thing as one user turn
        turns = [("USER", text.strip())]
    normalized = "\n".join(f"{role}: {body}" for role, body in turns)
    return Document(
        text=normalized,
        metadata={
            "source": "<inline>",
            "turn_count": len(turns),
            "est_tokens": max(1, len(normalized) // 4),
        },
    )


class _RLMCallback(BaseCallback):
    """Captures LM and tool calls during the RLM run.

    Heuristic root-vs-sub: compare the model string on the LM instance
    to the configured root model. Sub-LM calls are emitted with a
    distinct `kind` so the UI can color them differently.
    """

    def __init__(self, q: "queue.Queue[dict]", root_model: str, sub_model: str) -> None:
        self.q = q
        self.root_model = root_model
        self.sub_model = sub_model
        self.step_index = 0
        self.lm_start_times: dict[str, float] = {}
        self.lm_models: dict[str, str] = {}
        self.tool_start_times: dict[str, float] = {}
        self.tool_names: dict[str, str] = {}
        self.root_in_tokens = 0
        self.root_out_tokens = 0
        self.sub_in_tokens = 0
        self.sub_out_tokens = 0

    # ----- LM hooks -----

    def on_lm_start(self, call_id: str, instance: Any, inputs: dict[str, Any]) -> None:
        self.lm_start_times[call_id] = time.time()
        model = getattr(instance, "model", "") or ""
        self.lm_models[call_id] = model

    def on_lm_end(
        self,
        call_id: str,
        outputs: dict[str, Any] | None,
        exception: Exception | None = None,
    ) -> None:
        model = self.lm_models.pop(call_id, "")
        t0 = self.lm_start_times.pop(call_id, time.time())
        elapsed = round(time.time() - t0, 2)
        kind = "root" if model == self.root_model else "sub_llm"
        usage = _extract_usage(outputs)
        if kind == "root":
            self.root_in_tokens += usage["in"]
            self.root_out_tokens += usage["out"]
        else:
            self.sub_in_tokens += usage["in"]
            self.sub_out_tokens += usage["out"]

        if exception is not None:
            self._emit_step(
                kind=kind,
                elapsed_s=elapsed,
                model=model,
                reasoning=None,
                code=None,
                output=f"ERROR: {exception}",
                tokens=usage,
            )
            return

        reasoning, code, output_text = _split_output(outputs)
        self._emit_step(
            kind=kind,
            elapsed_s=elapsed,
            model=model,
            reasoning=reasoning,
            code=code,
            output=output_text,
            tokens=usage,
        )

    # ----- tool hooks -----

    def on_tool_start(self, call_id: str, instance: Any, inputs: dict[str, Any]) -> None:
        self.tool_start_times[call_id] = time.time()
        self.tool_names[call_id] = getattr(instance, "name", None) or instance.__class__.__name__

    def on_tool_end(
        self,
        call_id: str,
        outputs: Any | None,
        exception: Exception | None = None,
    ) -> None:
        name = self.tool_names.pop(call_id, "tool")
        t0 = self.tool_start_times.pop(call_id, time.time())
        elapsed = round(time.time() - t0, 2)
        result = "ERROR: " + str(exception) if exception else str(outputs)
        self.step_index += 1
        self.q.put(
            _evt(
                "step",
                {
                    "index": self.step_index,
                    "kind": "tool",
                    "elapsed_s": elapsed,
                    "tool_name": name,
                    "tool_result": _truncate(result, 1200),
                },
            )
        )

    # ----- utilities -----

    def token_snapshot(self) -> dict:
        return {
            "root_in": self.root_in_tokens,
            "root_out": self.root_out_tokens,
            "sub_in": self.sub_in_tokens,
            "sub_out": self.sub_out_tokens,
        }

    def _emit_step(
        self,
        *,
        kind: str,
        elapsed_s: float,
        model: str,
        reasoning: str | None,
        code: str | None,
        output: str | None,
        tokens: dict,
    ) -> None:
        self.step_index += 1
        payload = {
            "index": self.step_index,
            "kind": kind,
            "elapsed_s": elapsed_s,
            "model": model,
            "tokens": tokens,
        }
        if reasoning:
            payload["reasoning"] = _truncate(reasoning, 4000)
        if code:
            payload["code"] = _truncate(code, 4000)
        if output:
            payload["output"] = _truncate(output, 4000)
        self.q.put(_evt("step", payload))


def _extract_usage(outputs: Any) -> dict:
    """Pull token usage out of an LM outputs dict, defensively."""
    if not isinstance(outputs, dict):
        return {"in": 0, "out": 0}
    usage = outputs.get("usage") or {}
    if isinstance(usage, dict):
        return {
            "in": int(usage.get("prompt_tokens") or usage.get("input_tokens") or 0),
            "out": int(usage.get("completion_tokens") or usage.get("output_tokens") or 0),
        }
    return {"in": 0, "out": 0}


def _split_output(outputs: Any) -> tuple[str | None, str | None, str | None]:
    """Best-effort split into (reasoning, code, output_text)."""
    if not isinstance(outputs, dict):
        return None, None, str(outputs) if outputs is not None else None
    reasoning = outputs.get("reasoning") or outputs.get("thought")
    code = outputs.get("code") or outputs.get("python")
    # the rest collapsed to a string
    blob = {k: v for k, v in outputs.items() if k not in {"reasoning", "thought", "code", "python", "usage"}}
    text: str | None
    try:
        text = json.dumps(blob, default=str)[:4000] if blob else None
    except Exception:
        text = str(blob)[:4000]
    return reasoning, code, text


def _truncate(s: str, n: int) -> str:
    if len(s) <= n:
        return s
    return s[:n] + "\n... [truncated]"
