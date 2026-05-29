from threadmap.models import Document, Edge, MindMap, Node


def test_mindmap_roundtrip():
    mm = MindMap(
        title="Test",
        nodes=[
            Node(id="n_00", label="root"),
            Node(id="n_01", label="child", parent_id="n_00", summary="A child."),
        ],
        edges=[Edge(source_id="n_01", target_id="n_00", relation="relates-to")],
    )
    blob = mm.model_dump_json()
    again = MindMap.model_validate_json(blob)
    assert again == mm
    assert again.nodes[0].parent_id is None
    assert again.edges[0].relation == "relates-to"


def test_document_defaults():
    d = Document(text="hello")
    assert d.metadata == {}
