"""Service tests — never call a real LM.

We patch `stream.run_extraction_stream` to emit a known sequence of
events, and verify the HTTP shell, the auth/header behavior, and the
SSE framing on the wire.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from server import main, stream
from threadmap.models import MindMap, Node


def _fake_stream(req):
    yield {"event": "status", "data": {"phase": "ingesting", "message": "x"}}
    yield {"event": "step", "data": {"index": 1, "kind": "root", "elapsed_s": 0.1}}
    yield {"event": "tokens", "data": {"root_in": 10, "root_out": 2, "sub_in": 0, "sub_out": 0}}
    yield {
        "event": "final_mindmap",
        "data": MindMap(title="t", nodes=[Node(id="r", label="root")]).model_dump(),
    }
    yield {"event": "done", "data": {"wall_time_s": 1.2}}


def _body() -> dict:
    return {
        "conversation_text": "USER: hi\nASSISTANT: hello",
        "root_model": "gemini/gemini-2.5-pro",
        "sub_model": "gemini/gemini-2.5-flash",
    }


def test_health():
    client = TestClient(main.app)
    assert client.get("/health").json() == {"status": "ok"}


def test_extract_requires_key():
    client = TestClient(main.app)
    r = client.post("/extract", json=_body())
    assert r.status_code == 401
    assert "X-LLM-Provider-Key" in r.text


def test_extract_unknown_provider():
    client = TestClient(main.app)
    r = client.post(
        "/extract",
        json=_body(),
        headers={"X-LLM-Provider-Key": "k", "X-LLM-Provider": "skynet"},
    )
    assert r.status_code == 400
    assert "unknown provider" in r.text.lower()


def test_extract_streams_events(monkeypatch):
    monkeypatch.setattr(stream, "run_extraction_stream", _fake_stream)
    client = TestClient(main.app)
    with client.stream(
        "POST",
        "/extract",
        json=_body(),
        headers={"X-LLM-Provider-Key": "k", "X-LLM-Provider": "gemini"},
    ) as r:
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("text/event-stream")
        body = b"".join(r.iter_bytes()).decode("utf-8")

    # ordered events in SSE framing
    for marker in (
        "event: status",
        "event: step",
        "event: tokens",
        "event: final_mindmap",
        "event: done",
    ):
        assert marker in body
    # final_mindmap data is JSON
    assert '"title": "t"' in body or '"title":"t"' in body
    assert body.index("event: status") < body.index("event: done")


def test_shared_secret_gate(monkeypatch):
    monkeypatch.setenv("THREADMAP_SHARED_SECRET", "swordfish")
    monkeypatch.setattr(stream, "run_extraction_stream", _fake_stream)
    client = TestClient(main.app)

    # missing secret -> 401
    r = client.post(
        "/extract",
        json=_body(),
        headers={"X-LLM-Provider-Key": "k", "X-LLM-Provider": "gemini"},
    )
    assert r.status_code == 401

    # correct secret -> stream
    r = client.post(
        "/extract",
        json=_body(),
        headers={
            "X-LLM-Provider-Key": "k",
            "X-LLM-Provider": "gemini",
            "X-Threadmap-Shared-Secret": "swordfish",
        },
    )
    assert r.status_code == 200
