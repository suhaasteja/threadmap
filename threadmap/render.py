"""Rendering layer: MindMap -> file. Each renderer is pure (in -> out)."""

from __future__ import annotations

import json
from pathlib import Path

from .models import MindMap, Node


# ---------- JSON ----------


def to_json(mm: MindMap, path: str | Path) -> Path:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(mm.model_dump_json(indent=2), encoding="utf-8")
    return p


# ---------- Markdown ----------


def to_markdown(mm: MindMap, path: str | Path) -> Path:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)

    children = _children_index(mm)
    root = _find_root(mm)

    lines: list[str] = [f"# {mm.title}", ""]
    lines.append("## Outline")
    lines.append("")
    if root is not None:
        _outline(root, children, lines, depth=0)
    lines.append("")

    lines.append("## Mermaid")
    lines.append("")
    lines.append("```mermaid")
    lines.append("mindmap")
    if root is not None:
        lines.append(f"  root(({_safe(root.label)}))")
        _mermaid(root, children, lines, depth=2)
    lines.append("```")
    lines.append("")

    if mm.edges:
        lines.append("## Connections")
        lines.append("")
        labels = {n.id: n.label for n in mm.nodes}
        for e in mm.edges:
            s = labels.get(e.source_id, e.source_id)
            t = labels.get(e.target_id, e.target_id)
            lines.append(f"- **{s}** _{e.relation}_ **{t}**")
        lines.append("")

    p.write_text("\n".join(lines), encoding="utf-8")
    return p


def _outline(node: Node, children: dict[str, list[Node]], lines: list[str], depth: int) -> None:
    indent = "  " * depth
    summary = f" — {node.summary}" if node.summary else ""
    lines.append(f"{indent}- **{node.label}**{summary}")
    for c in children.get(node.id, []):
        _outline(c, children, lines, depth + 1)


def _mermaid(node: Node, children: dict[str, list[Node]], lines: list[str], depth: int) -> None:
    indent = "  " * depth
    for c in children.get(node.id, []):
        lines.append(f"{indent}{_safe(c.label)}")
        _mermaid(c, children, lines, depth + 1)


def _safe(s: str) -> str:
    # Mermaid trips on parens/brackets in node text
    return s.replace("(", "[").replace(")", "]").replace("\n", " ")


# ---------- HTML ----------


_HTML_TEMPLATE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>__TITLE__ — threadmap</title>
<style>
  html, body { margin: 0; height: 100%; background: #0f1115; color: #e8eaf0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  #app { width: 100vw; height: 100vh; overflow: hidden; }
  svg { width: 100%; height: 100%; cursor: grab; user-select: none; display: block; }
  svg.dragging { cursor: grabbing; }
  .link { fill: none; stroke: #4a5163; stroke-width: 1.5px; }
  .link.cross { stroke: #c79a3a; stroke-dasharray: 5 4; }
  .node circle { fill: #1e2230; stroke: #7b8aa8; stroke-width: 1.5px; cursor: pointer; }
  .node.collapsed circle { fill: #2a324a; stroke: #b9c3dc; }
  .node text { fill: #e8eaf0; font-size: 13px; pointer-events: none; }
  .node:hover circle { stroke: #ffffff; }
  #panel { position: fixed; right: 16px; top: 16px; max-width: 340px; padding: 12px 14px;
    background: rgba(20,23,32,0.95); border: 1px solid #2a2f3d; border-radius: 8px;
    font-size: 13px; line-height: 1.4; box-shadow: 0 6px 24px rgba(0,0,0,0.4); }
  #panel h3 { margin: 0 0 6px 0; font-size: 14px; color: #ffffff; }
  #panel .relation { color: #c79a3a; font-style: italic; }
  #legend { position: fixed; left: 16px; bottom: 12px; font-size: 11px; color: #8a93a8; }
</style>
</head>
<body>
<div id="app"><svg></svg></div>
<div id="panel"><h3 id="panel-title">__TITLE__</h3>
<div id="panel-body">Click a node for details. Drag to pan. Scroll to zoom.</div></div>
<div id="legend">solid = hierarchy &nbsp;·&nbsp; dashed = cross-link</div>
<script>
const DATA = __DATA__;
const NS = "http://www.w3.org/2000/svg";

const byId = new Map(DATA.nodes.map(n => [n.id, n]));
const children = new Map();
let rootId = null;
for (const n of DATA.nodes) {
  if (n.parent_id == null) rootId = n.id;
  else {
    if (!children.has(n.parent_id)) children.set(n.parent_id, []);
    children.get(n.parent_id).push(n.id);
  }
}
const collapsed = new Set();

function layout() {
  // tidy-tree-ish: assign y by DFS in-order, x by depth.
  const positions = new Map();
  let row = 0;
  function walk(id, depth) {
    const kids = collapsed.has(id) ? [] : (children.get(id) || []);
    if (kids.length === 0) {
      positions.set(id, { x: depth, y: row });
      row += 1;
      return positions.get(id).y;
    }
    const ys = kids.map(k => walk(k, depth + 1));
    const y = (ys[0] + ys[ys.length - 1]) / 2;
    positions.set(id, { x: depth, y });
    return y;
  }
  if (rootId) walk(rootId, 0);
  return positions;
}

const svg = document.querySelector("svg");
let viewBox = { x: 0, y: 0, w: 1200, h: 800 };
svg.setAttribute("viewBox", `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`);

function render() {
  const positions = layout();
  const COLW = 220, ROWH = 38;
  const PADX = 80, PADY = 60;
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  // hierarchy edges
  for (const [id, p] of positions) {
    const kids = collapsed.has(id) ? [] : (children.get(id) || []);
    for (const k of kids) {
      const cp = positions.get(k);
      const x1 = PADX + p.x * COLW, y1 = PADY + p.y * ROWH;
      const x2 = PADX + cp.x * COLW, y2 = PADY + cp.y * ROWH;
      const path = document.createElementNS(NS, "path");
      const mx = (x1 + x2) / 2;
      path.setAttribute("d", `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`);
      path.setAttribute("class", "link");
      svg.appendChild(path);
    }
  }

  // cross-links
  for (const e of (DATA.edges || [])) {
    const a = positions.get(e.source_id), b = positions.get(e.target_id);
    if (!a || !b) continue;
    const x1 = PADX + a.x * COLW, y1 = PADY + a.y * ROWH;
    const x2 = PADX + b.x * COLW, y2 = PADY + b.y * ROWH;
    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", `M${x1},${y1} Q${(x1+x2)/2},${Math.min(y1,y2)-40} ${x2},${y2}`);
    path.setAttribute("class", "link cross");
    svg.appendChild(path);
  }

  // nodes
  for (const [id, p] of positions) {
    const n = byId.get(id);
    const cx = PADX + p.x * COLW, cy = PADY + p.y * ROWH;
    const g = document.createElementNS(NS, "g");
    g.setAttribute("class", "node" + (collapsed.has(id) ? " collapsed" : ""));
    g.setAttribute("transform", `translate(${cx},${cy})`);
    const c = document.createElementNS(NS, "circle");
    c.setAttribute("r", (children.get(id) || []).length ? 7 : 4);
    g.appendChild(c);
    const t = document.createElementNS(NS, "text");
    t.setAttribute("x", 12);
    t.setAttribute("dy", "0.32em");
    t.textContent = n.label;
    g.appendChild(t);
    g.addEventListener("click", (ev) => {
      ev.stopPropagation();
      showPanel(n);
      if ((children.get(id) || []).length) {
        if (collapsed.has(id)) collapsed.delete(id); else collapsed.add(id);
        render();
      }
    });
    svg.appendChild(g);
  }

  // size to content
  const all = [...positions.values()];
  if (all.length) {
    const maxX = Math.max(...all.map(v => v.x)) * COLW + PADX + 240;
    const maxY = Math.max(...all.map(v => v.y)) * ROWH + PADY + 40;
    viewBox.w = Math.max(maxX, 600);
    viewBox.h = Math.max(maxY, 400);
    svg.setAttribute("viewBox", `0 0 ${viewBox.w} ${viewBox.h}`);
  }
}

function showPanel(n) {
  document.getElementById("panel-title").textContent = n.label;
  const body = document.getElementById("panel-body");
  const edges = (DATA.edges || []).filter(e => e.source_id === n.id || e.target_id === n.id);
  let html = n.summary ? `<p>${escapeHtml(n.summary)}</p>` : "<p><em>No summary.</em></p>";
  if (edges.length) {
    html += "<p><strong>Cross-links:</strong></p><ul>";
    for (const e of edges) {
      const other = e.source_id === n.id ? byId.get(e.target_id) : byId.get(e.source_id);
      const arrow = e.source_id === n.id ? "→" : "←";
      html += `<li>${arrow} <span class="relation">${escapeHtml(e.relation)}</span> ${escapeHtml(other?.label || "?")}</li>`;
    }
    html += "</ul>";
  }
  body.innerHTML = html;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

// pan + zoom
let dragging = false, lastX = 0, lastY = 0;
svg.addEventListener("mousedown", (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; svg.classList.add("dragging"); });
window.addEventListener("mouseup", () => { dragging = false; svg.classList.remove("dragging"); });
window.addEventListener("mousemove", (e) => {
  if (!dragging) return;
  const dx = (e.clientX - lastX) * viewBox.w / svg.clientWidth;
  const dy = (e.clientY - lastY) * viewBox.h / svg.clientHeight;
  viewBox.x -= dx; viewBox.y -= dy;
  lastX = e.clientX; lastY = e.clientY;
  svg.setAttribute("viewBox", `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`);
});
svg.addEventListener("wheel", (e) => {
  e.preventDefault();
  const factor = e.deltaY > 0 ? 1.1 : 0.9;
  const mx = viewBox.x + (e.offsetX / svg.clientWidth) * viewBox.w;
  const my = viewBox.y + (e.offsetY / svg.clientHeight) * viewBox.h;
  viewBox.w *= factor; viewBox.h *= factor;
  viewBox.x = mx - (e.offsetX / svg.clientWidth) * viewBox.w;
  viewBox.y = my - (e.offsetY / svg.clientHeight) * viewBox.h;
  svg.setAttribute("viewBox", `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`);
}, { passive: false });

render();
</script>
</body>
</html>
"""


def to_html(mm: MindMap, path: str | Path) -> Path:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    data = json.dumps(mm.model_dump(), ensure_ascii=False)
    html = _HTML_TEMPLATE.replace("__TITLE__", _html_escape(mm.title)).replace("__DATA__", data)
    p.write_text(html, encoding="utf-8")
    return p


def _html_escape(s: str) -> str:
    return (
        s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        .replace('"', "&quot;").replace("'", "&#39;")
    )


# ---------- helpers ----------


def _children_index(mm: MindMap) -> dict[str, list[Node]]:
    idx: dict[str, list[Node]] = {}
    for n in mm.nodes:
        if n.parent_id is None:
            continue
        idx.setdefault(n.parent_id, []).append(n)
    return idx


def _find_root(mm: MindMap) -> Node | None:
    for n in mm.nodes:
        if n.parent_id is None:
            return n
    return mm.nodes[0] if mm.nodes else None
