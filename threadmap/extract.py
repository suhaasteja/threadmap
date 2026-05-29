"""Extraction layer: Document -> (MindMap, trajectory).

Uses DSPy's RLM (Recursive Language Model). The RLM treats the
conversation as a variable in a Python REPL and can recursively call
sub-LLMs over slices instead of stuffing everything into one context.

The signature is generic over `conversation` + `instruction`, so
swapping prompts or schemas does not touch ingestion or rendering.
"""

from __future__ import annotations

import json
from pathlib import Path

import dspy

from . import config
from .models import Document, Edge, MindMap, Node


# ---------- public ----------


def build_mindmap(doc: Document, instruction: str) -> tuple[MindMap, list]:
    """Run the RLM over the normalized conversation text.

    Returns the validated MindMap and the RLM trajectory (a list of
    step dicts: reasoning, code, output) for the --trace mode.
    """
    config.require_api_key()
    _configure_dspy()

    # We bind the output as a JSON string and parse ourselves rather
    # than relying on Pydantic-typed signature support in dspy.RLM,
    # which is still experimental and inconsistent across versions.
    rlm = dspy.RLM(
        "conversation, instruction -> mindmap_json: str",
        sub_lm=dspy.LM(config.SUB_MODEL),
        tools=[validate_mindmap_json],
    )
    result = rlm(conversation=doc.text, instruction=instruction)

    mm = _coerce_mindmap(result.mindmap_json)
    mm = _repair(mm)
    trajectory = getattr(result, "trajectory", []) or []
    return mm, trajectory


def load_instruction(path: str | Path | None = None) -> str:
    path = Path(path) if path else config.DEFAULT_INSTRUCTION_PATH
    return path.read_text(encoding="utf-8")


# ---------- tools exposed to the RLM ----------


def validate_mindmap_json(mindmap_json: str) -> str:
    """Tool the RLM can call before SUBMIT() to self-check structure.

    Returns "OK" or a short list of problems. The model should fix the
    JSON and re-validate until OK before returning.
    """
    try:
        mm = _coerce_mindmap(mindmap_json)
    except Exception as e:
        return f"INVALID JSON or schema: {e}"

    problems = _structural_problems(mm)
    if not problems:
        return "OK"
    return "PROBLEMS:\n- " + "\n- ".join(problems)


# ---------- internals ----------


def _configure_dspy() -> None:
    lm = dspy.LM(config.ROOT_MODEL)
    dspy.configure(lm=lm)


def _coerce_mindmap(raw: str | dict) -> MindMap:
    """Accept a JSON string or a dict and return a MindMap."""
    if isinstance(raw, MindMap):
        return raw
    if isinstance(raw, str):
        # tolerate fenced code blocks around the JSON
        s = raw.strip()
        if s.startswith("```"):
            s = s.strip("`")
            if s.lower().startswith("json"):
                s = s[4:].lstrip()
        data = json.loads(s)
    else:
        data = raw
    return MindMap.model_validate(data)


def _structural_problems(mm: MindMap) -> list[str]:
    problems: list[str] = []
    ids = {n.id for n in mm.nodes}
    if len(ids) != len(mm.nodes):
        problems.append("duplicate node ids")

    roots = [n for n in mm.nodes if n.parent_id is None]
    if len(roots) == 0:
        problems.append("no root node (need exactly one with parent_id=null)")
    elif len(roots) > 1:
        problems.append(f"multiple roots: {[n.id for n in roots]}")

    for n in mm.nodes:
        if n.parent_id is not None and n.parent_id not in ids:
            problems.append(f"node {n.id} has unknown parent_id={n.parent_id}")

    for e in mm.edges:
        if e.source_id not in ids:
            problems.append(f"edge source_id={e.source_id} not in nodes")
        if e.target_id not in ids:
            problems.append(f"edge target_id={e.target_id} not in nodes")

    return problems


def _repair(mm: MindMap) -> MindMap:
    """Last-resort fixups so we never crash downstream.

    - if no root, promote the first node to root.
    - if multiple roots, keep the first; attach the others under it.
    - orphan parent_ids -> reattach to root.
    - drop edges with unknown endpoints.
    """
    if not mm.nodes:
        return mm

    ids = {n.id for n in mm.nodes}
    roots = [n for n in mm.nodes if n.parent_id is None]

    fixed_nodes: list[Node] = []
    if not roots:
        root = mm.nodes[0].model_copy(update={"parent_id": None})
        fixed_nodes = [root] + [n for n in mm.nodes[1:]]
        root_id = root.id
    elif len(roots) > 1:
        root_id = roots[0].id
        for n in mm.nodes:
            if n.parent_id is None and n.id != root_id:
                fixed_nodes.append(n.model_copy(update={"parent_id": root_id}))
            else:
                fixed_nodes.append(n)
    else:
        root_id = roots[0].id
        fixed_nodes = list(mm.nodes)

    # reattach orphans
    fixed_nodes = [
        n if (n.parent_id is None or n.parent_id in ids)
        else n.model_copy(update={"parent_id": root_id})
        for n in fixed_nodes
    ]

    fixed_edges: list[Edge] = [
        e for e in mm.edges if e.source_id in ids and e.target_id in ids
    ]

    return MindMap(title=mm.title, nodes=fixed_nodes, edges=fixed_edges)
