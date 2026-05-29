"""Ingestion layer: any source -> normalized Document.

Public surface is `load_conversation(source)`. It dispatches on file
extension. Future multi-doc support slots in as another loader without
touching extract/render.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from .models import Document

_ROLE_MAP = {
    "user": "USER",
    "human": "USER",
    "assistant": "ASSISTANT",
    "claude": "ASSISTANT",
    "ai": "ASSISTANT",
    "system": "SYSTEM",
}


def load_conversation(source: str | Path) -> Document:
    """Load a conversation from a path, normalize to a Document.

    Dispatches on extension: `.json` -> Claude export parser; everything
    else is treated as plain text/markdown.
    """
    path = Path(source)
    if not path.exists():
        raise FileNotFoundError(f"No such conversation file: {path}")

    raw = path.read_text(encoding="utf-8")
    if path.suffix.lower() == ".json":
        turns = _parse_claude_json(raw)
    else:
        turns = _parse_text(raw)

    text = "\n".join(f"{role}: {body}" for role, body in turns)
    metadata = {
        "source": str(path),
        "turn_count": len(turns),
        "est_tokens": max(1, len(text) // 4),
    }
    return Document(text=text, metadata=metadata)


# ---------- text/markdown ----------

_ROLE_LINE = re.compile(
    r"^\s*(?:#+\s*)?(user|human|assistant|claude|ai|system)\s*[:\-]\s*(.*)$",
    re.IGNORECASE,
)


def _parse_text(raw: str) -> list[tuple[str, str]]:
    """Parse a plain transcript. Each turn starts with a role marker
    (e.g. `User:`, `Assistant:`, `# Human`). Lines without a marker
    attach to the previous turn.
    """
    turns: list[tuple[str, list[str]]] = []
    for line in raw.splitlines():
        m = _ROLE_LINE.match(line)
        if m:
            role = _ROLE_MAP[m.group(1).lower()]
            turns.append((role, [m.group(2).strip()]))
        elif turns:
            turns[-1][1].append(line.rstrip())
        # lines before the first role marker are ignored (preamble)

    return [(role, _flatten(body)) for role, body in turns if _flatten(body)]


def _flatten(lines: list[str]) -> str:
    return " ".join(s.strip() for s in lines if s.strip())


# ---------- claude conversations.json ----------


def _parse_claude_json(raw: str) -> list[tuple[str, str]]:
    """Tolerant Claude export parser. Handles the common shapes:

    - top-level list of conversations, each with `chat_messages` or `messages`
    - a single conversation object
    - anything else: best-effort flatten of strings under `text`/`content`

    Falls back to scraping every string field rather than crashing.
    """
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return _parse_text(raw)

    turns: list[tuple[str, str]] = []

    def walk_messages(messages):
        for msg in messages:
            if not isinstance(msg, dict):
                continue
            sender = (msg.get("sender") or msg.get("role") or "").lower()
            role = _ROLE_MAP.get(sender, "USER" if sender == "user" else "ASSISTANT")
            body = _extract_body(msg)
            if body:
                turns.append((role, body))

    candidates = data if isinstance(data, list) else [data]
    for conv in candidates:
        if not isinstance(conv, dict):
            continue
        msgs = conv.get("chat_messages") or conv.get("messages")
        if isinstance(msgs, list):
            walk_messages(msgs)

    if not turns:
        # fallback: flatten any strings we can find
        flat = _flatten_strings(data)
        if flat:
            turns.append(("USER", flat))
    return turns


def _extract_body(msg: dict) -> str:
    """Pull human-readable text out of a single message dict."""
    if isinstance(msg.get("text"), str) and msg["text"].strip():
        return msg["text"].strip()

    content = msg.get("content")
    parts: list[str] = []
    if isinstance(content, str):
        parts.append(content)
    elif isinstance(content, list):
        for chunk in content:
            if isinstance(chunk, str):
                parts.append(chunk)
            elif isinstance(chunk, dict):
                for key in ("text", "input", "output", "content"):
                    val = chunk.get(key)
                    if isinstance(val, str):
                        parts.append(val)
    return " ".join(s.strip() for s in parts if s and s.strip())


def _flatten_strings(obj) -> str:
    out: list[str] = []

    def walk(x):
        if isinstance(x, str):
            s = x.strip()
            if s:
                out.append(s)
        elif isinstance(x, dict):
            for v in x.values():
                walk(v)
        elif isinstance(x, list):
            for v in x:
                walk(v)

    walk(obj)
    return " ".join(out)
