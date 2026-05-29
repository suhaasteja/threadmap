"""CLI integration test that mocks the RLM so no API call is made."""

from pathlib import Path

from typer.testing import CliRunner

from threadmap import extract
from threadmap.cli import app
from threadmap.models import Edge, MindMap, Node

runner = CliRunner()


def _fake_mm() -> MindMap:
    return MindMap(
        title="Stubbed",
        nodes=[
            Node(id="r", label="root", summary="overall"),
            Node(id="a", label="Theme A", parent_id="r"),
            Node(id="b", label="Theme B", parent_id="r"),
        ],
        edges=[Edge(source_id="a", target_id="b", relation="relates-to")],
    )


def test_build_end_to_end(tmp_path, monkeypatch):
    # avoid needing a real API key for this test
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(
        extract, "build_mindmap", lambda doc, instr: (_fake_mm(), [{"reasoning": "stub"}])
    )

    sample = Path("examples/sample_conversation.md")
    out = tmp_path / "out"
    result = runner.invoke(
        app,
        ["build", str(sample), "--out", str(out), "--trace"],
    )
    assert result.exit_code == 0, result.output
    assert (out / "mindmap.html").exists()
    assert (out / "mindmap.md").exists()
    assert (out / "mindmap.json").exists()
    assert (out / "trace.txt").exists()
    assert "Stubbed" in (out / "mindmap.html").read_text()


def test_build_rejects_unknown_format(tmp_path, monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    result = runner.invoke(
        app,
        ["build", "examples/sample_conversation.md", "--out", str(tmp_path), "--format", "pdf"],
    )
    assert result.exit_code == 1
    assert "Unknown --format" in result.output


def test_build_errors_on_missing_input(tmp_path, monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    result = runner.invoke(app, ["build", str(tmp_path / "nope.md")])
    assert result.exit_code == 1
    assert "not found" in result.output
