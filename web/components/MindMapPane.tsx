"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MindMap, MindMapNode } from "@/lib/types";

interface Props {
  mindmap: MindMap | null;
  busy: boolean;
}

const COLW = 220;
const ROWH = 38;
const PADX = 80;
const PADY = 60;

export function MindMapPane({ mindmap, busy }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, w: 800, h: 600 });
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  // reset selection when the map changes
  useEffect(() => {
    setSelected(null);
    setCollapsed(new Set());
  }, [mindmap]);

  const layout = useMemo(() => (mindmap ? computeLayout(mindmap, collapsed) : null), [mindmap, collapsed]);

  useEffect(() => {
    if (!layout) return;
    const pts = Array.from(layout.positions.values());
    const maxX = Math.max(0, ...pts.map((p) => p.x)) * COLW + PADX + 240;
    const maxY = Math.max(0, ...pts.map((p) => p.y)) * ROWH + PADY + 40;
    setViewBox({ x: 0, y: 0, w: Math.max(maxX, 600), h: Math.max(maxY, 400) });
  }, [layout]);

  if (!mindmap) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-zinc-500">
        {busy ? "Building the map…" : "Mind map appears here when extraction finishes."}
      </div>
    );
  }

  const onMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    dragRef.current = { x: e.clientX, y: e.clientY };
  };
  const onMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!dragRef.current || !svgRef.current) return;
    const dx = ((e.clientX - dragRef.current.x) * viewBox.w) / svgRef.current.clientWidth;
    const dy = ((e.clientY - dragRef.current.y) * viewBox.h) / svgRef.current.clientHeight;
    dragRef.current = { x: e.clientX, y: e.clientY };
    setViewBox((v) => ({ ...v, x: v.x - dx, y: v.y - dy }));
  };
  const onMouseUp = () => {
    dragRef.current = null;
  };
  const onWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    if (!svgRef.current) return;
    const factor = e.deltaY > 0 ? 1.1 : 0.9;
    const rect = svgRef.current.getBoundingClientRect();
    const mx = viewBox.x + ((e.clientX - rect.left) / rect.width) * viewBox.w;
    const my = viewBox.y + ((e.clientY - rect.top) / rect.height) * viewBox.h;
    const nw = viewBox.w * factor;
    const nh = viewBox.h * factor;
    setViewBox({
      x: mx - ((e.clientX - rect.left) / rect.width) * nw,
      y: my - ((e.clientY - rect.top) / rect.height) * nh,
      w: nw,
      h: nh,
    });
  };

  const toggle = (id: string, hasKids: boolean) => {
    setSelected(id);
    if (!hasKids) return;
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const childrenIndex = layout!.children;
  const selectedNode = selected ? mindmap.nodes.find((n) => n.id === selected) : null;

  return (
    <div className="relative h-full">
      <svg
        ref={svgRef}
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
        className="h-full w-full cursor-grab active:cursor-grabbing select-none"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onWheel={onWheel}
      >
        {/* hierarchy edges */}
        {[...layout!.positions.entries()].map(([id, p]) => {
          const kids = collapsed.has(id) ? [] : childrenIndex.get(id) ?? [];
          return kids.map((k) => {
            const cp = layout!.positions.get(k.id)!;
            const x1 = PADX + p.x * COLW;
            const y1 = PADY + p.y * ROWH;
            const x2 = PADX + cp.x * COLW;
            const y2 = PADY + cp.y * ROWH;
            const mx = (x1 + x2) / 2;
            return (
              <path
                key={`${id}->${k.id}`}
                d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
                fill="none"
                stroke="#4a5163"
                strokeWidth={1.5}
              />
            );
          });
        })}

        {/* cross-links */}
        {mindmap.edges.map((e, i) => {
          const a = layout!.positions.get(e.source_id);
          const b = layout!.positions.get(e.target_id);
          if (!a || !b) return null;
          const x1 = PADX + a.x * COLW;
          const y1 = PADY + a.y * ROWH;
          const x2 = PADX + b.x * COLW;
          const y2 = PADY + b.y * ROWH;
          return (
            <path
              key={`edge-${i}`}
              d={`M${x1},${y1} Q${(x1 + x2) / 2},${Math.min(y1, y2) - 40} ${x2},${y2}`}
              fill="none"
              stroke="#c79a3a"
              strokeWidth={1.5}
              strokeDasharray="5 4"
            />
          );
        })}

        {/* nodes */}
        {[...layout!.positions.entries()].map(([id, p]) => {
          const n = mindmap.nodes.find((x) => x.id === id)!;
          const hasKids = (childrenIndex.get(id) ?? []).length > 0;
          const isCollapsed = collapsed.has(id);
          return (
            <g
              key={id}
              transform={`translate(${PADX + p.x * COLW},${PADY + p.y * ROWH})`}
              className="cursor-pointer"
              onClick={(ev) => {
                ev.stopPropagation();
                toggle(id, hasKids);
              }}
            >
              <circle
                r={hasKids ? 7 : 4}
                fill={isCollapsed ? "#2a324a" : "#1e2230"}
                stroke={selected === id ? "#ffffff" : isCollapsed ? "#b9c3dc" : "#7b8aa8"}
                strokeWidth={1.5}
              />
              <text x={12} dy="0.32em" fill="#e8eaf0" fontSize={13} className="pointer-events-none">
                {n.label}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="pointer-events-none absolute left-3 bottom-2 text-[10px] text-zinc-500">
        solid = hierarchy · dashed = cross-link · drag to pan · scroll to zoom · click node to collapse
      </div>

      {selectedNode && (
        <div className="absolute right-3 top-3 max-w-[300px] rounded-lg border border-ink-600 bg-ink-900/95 p-3 text-xs text-zinc-300 shadow-xl">
          <div className="mb-1 text-sm font-semibold text-white">{selectedNode.label}</div>
          <div className="text-zinc-400">
            {selectedNode.summary || <em className="text-zinc-600">No summary.</em>}
          </div>
          {(() => {
            const cross = mindmap.edges.filter(
              (e) => e.source_id === selectedNode.id || e.target_id === selectedNode.id
            );
            if (!cross.length) return null;
            return (
              <div className="mt-2">
                <div className="mb-1 text-zinc-500">cross-links</div>
                <ul className="space-y-0.5">
                  {cross.map((e, i) => {
                    const otherId = e.source_id === selectedNode.id ? e.target_id : e.source_id;
                    const other = mindmap.nodes.find((n) => n.id === otherId);
                    const arrow = e.source_id === selectedNode.id ? "→" : "←";
                    return (
                      <li key={i}>
                        {arrow} <span className="italic text-accent-sub">{e.relation}</span>{" "}
                        {other?.label ?? "?"}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

interface Layout {
  positions: Map<string, { x: number; y: number }>;
  children: Map<string, MindMapNode[]>;
}

function computeLayout(mm: MindMap, collapsed: Set<string>): Layout {
  const children = new Map<string, MindMapNode[]>();
  let rootId: string | null = null;
  for (const n of mm.nodes) {
    if (n.parent_id == null) rootId = rootId ?? n.id;
    else {
      const arr = children.get(n.parent_id) ?? [];
      arr.push(n);
      children.set(n.parent_id, arr);
    }
  }
  const positions = new Map<string, { x: number; y: number }>();
  let row = 0;
  function walk(id: string, depth: number): number {
    const kids = collapsed.has(id) ? [] : children.get(id) ?? [];
    if (kids.length === 0) {
      positions.set(id, { x: depth, y: row });
      const y = row;
      row += 1;
      return y;
    }
    const ys = kids.map((k) => walk(k.id, depth + 1));
    const y = (ys[0] + ys[ys.length - 1]) / 2;
    positions.set(id, { x: depth, y });
    return y;
  }
  if (rootId) walk(rootId, 0);
  return { positions, children };
}
