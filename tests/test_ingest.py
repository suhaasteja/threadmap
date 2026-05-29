import json
from pathlib import Path

from threadmap.ingest import load_conversation

SAMPLE = Path(__file__).parent.parent / "examples" / "sample_conversation.md"


def test_load_markdown_sample():
    doc = load_conversation(SAMPLE)
    assert doc.metadata["source"].endswith("sample_conversation.md")
    assert doc.metadata["turn_count"] >= 8
    assert doc.metadata["est_tokens"] > 0
    # role tags present, one turn per line
    lines = doc.text.splitlines()
    assert all(l.startswith(("USER:", "ASSISTANT:", "SYSTEM:")) for l in lines)
    # roles alternate at least some
    roles = [l.split(":", 1)[0] for l in lines]
    assert "USER" in roles and "ASSISTANT" in roles


def test_load_claude_json(tmp_path):
    export = [
        {
            "chat_messages": [
                {"sender": "human", "text": "What is the capital of France?"},
                {"sender": "assistant", "text": "Paris."},
                {"sender": "human", "content": [{"text": "And of Spain?"}]},
                {"sender": "assistant", "content": "Madrid."},
            ]
        }
    ]
    p = tmp_path / "conv.json"
    p.write_text(json.dumps(export))
    doc = load_conversation(p)
    assert doc.metadata["turn_count"] == 4
    assert "Paris." in doc.text
    assert "Madrid." in doc.text
    assert "USER: What is the capital of France?" in doc.text


def test_json_fallback_on_unknown_shape(tmp_path):
    p = tmp_path / "weird.json"
    p.write_text(json.dumps({"foo": {"bar": ["hello", "world"]}}))
    doc = load_conversation(p)
    assert doc.metadata["turn_count"] == 1
    assert "hello" in doc.text and "world" in doc.text


def test_missing_file_raises(tmp_path):
    import pytest

    with pytest.raises(FileNotFoundError):
        load_conversation(tmp_path / "nope.md")
