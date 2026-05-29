"""Unit tests for the extract layer that don't hit the LM.

We test the validator tool, the JSON coercion, and the repair pass.
"""

import json

import pytest

from threadmap.extract import (
    _coerce_mindmap,
    _repair,
    _structural_problems,
    validate_mindmap_json,
)
from threadmap.models import Edge, MindMap, Node


def _mm(nodes, edges=None, title="t"):
    return MindMap(title=title, nodes=nodes, edges=edges or [])


def test_validator_ok():
    mm = _mm([Node(id="r", label="root"), Node(id="a", label="a", parent_id="r")])
    assert validate_mindmap_json(mm.model_dump_json()) == "OK"


def test_validator_detects_problems():
    bad = {
        "title": "t",
        "nodes": [
            {"id": "r", "label": "root"},
            {"id": "a", "label": "a", "parent_id": "ghost"},
            {"id": "b", "label": "b"},  # second root
        ],
        "edges": [{"source_id": "r", "target_id": "ghost", "relation": "x"}],
    }
    out = validate_mindmap_json(json.dumps(bad))
    assert "multiple roots" in out
    assert "unknown parent_id" in out
    assert "edge target_id" in out


def test_validator_handles_garbage():
    out = validate_mindmap_json("not json at all")
    assert out.startswith("INVALID")


def test_coerce_strips_fenced_json():
    raw = '```json\n{"title": "t", "nodes": [{"id": "r", "label": "root"}]}\n```'
    mm = _coerce_mindmap(raw)
    assert mm.title == "t" and mm.nodes[0].id == "r"


def test_repair_promotes_root_when_missing():
    bad = _mm([
        Node(id="a", label="a", parent_id="r"),  # orphan, no root present
        Node(id="b", label="b", parent_id="a"),
    ])
    fixed = _repair(bad)
    assert _structural_problems(fixed) == []


def test_repair_collapses_multiple_roots():
    bad = _mm([
        Node(id="r1", label="r1"),
        Node(id="r2", label="r2"),
        Node(id="c", label="c", parent_id="r1"),
    ])
    fixed = _repair(bad)
    assert _structural_problems(fixed) == []
    roots = [n for n in fixed.nodes if n.parent_id is None]
    assert len(roots) == 1 and roots[0].id == "r1"


def test_repair_drops_dangling_edges():
    bad = _mm(
        [Node(id="r", label="r"), Node(id="a", label="a", parent_id="r")],
        edges=[Edge(source_id="a", target_id="ghost", relation="x")],
    )
    fixed = _repair(bad)
    assert fixed.edges == []
