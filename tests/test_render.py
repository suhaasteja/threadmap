import json

from threadmap.models import Edge, MindMap, Node
from threadmap.render import to_html, to_json, to_markdown


def _fixture() -> MindMap:
    return MindMap(
        title="Demo Map",
        nodes=[
            Node(id="r", label="Root topic", summary="The conversation overall."),
            Node(id="a", label="Theme A", parent_id="r", summary="First theme."),
            Node(id="b", label="Theme B", parent_id="r", summary="Second theme."),
            Node(id="a1", label="Sub A1", parent_id="a"),
            Node(id="b1", label="Sub B1", parent_id="b"),
        ],
        edges=[Edge(source_id="a1", target_id="b1", relation="relates-to")],
    )


def test_to_json_roundtrip(tmp_path):
    mm = _fixture()
    p = to_json(mm, tmp_path / "mm.json")
    again = MindMap.model_validate_json(p.read_text())
    assert again == mm


def test_to_markdown_has_outline_and_mermaid(tmp_path):
    mm = _fixture()
    p = to_markdown(mm, tmp_path / "mm.md")
    text = p.read_text()
    assert "# Demo Map" in text
    assert "- **Root topic**" in text
    assert "- **Theme A**" in text
    assert "```mermaid" in text and "mindmap" in text
    assert "## Connections" in text
    assert "relates-to" in text


def test_to_html_is_self_contained(tmp_path):
    mm = _fixture()
    p = to_html(mm, tmp_path / "mm.html")
    text = p.read_text()
    assert "<!doctype html>" in text.lower()
    assert "Demo Map" in text
    # data is inlined as JSON
    assert '"id": "r"' in text or '"id":"r"' in text
    # no remote script/style/image fetches at runtime
    for tag in ('<script src=', '<link rel="stylesheet"', '<img src="http'):
        assert tag not in text
