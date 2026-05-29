// Client-side renderers: MindMap -> { json, md, trace } strings.
// Mirrors threadmap/render.py for the formats the UI lets you download
// without round-tripping to the server. HTML download is intentionally
// not here — use the CLI for a fully-offline interactive file.

import type { MindMap, MindMapNode, StepEvent, TokensEvent } from "./types";

export function toJSON(mm: MindMap): string {
  return JSON.stringify(mm, null, 2);
}

export function toMarkdown(mm: MindMap): string {
  const children = childIndex(mm);
  const root = findRoot(mm);

  const lines: string[] = [`# ${mm.title}`, "", "## Outline", ""];
  if (root) outline(root, children, lines, 0);
  lines.push("");

  lines.push("## Mermaid", "", "```mermaid", "mindmap");
  if (root) {
    lines.push(`  root((${safe(root.label)}))`);
    mermaid(root, children, lines, 2);
  }
  lines.push("```", "");

  if (mm.edges.length) {
    lines.push("## Connections", "");
    const labels = new Map(mm.nodes.map((n) => [n.id, n.label]));
    for (const e of mm.edges) {
      const s = labels.get(e.source_id) ?? e.source_id;
      const t = labels.get(e.target_id) ?? e.target_id;
      lines.push(`- **${s}** _${e.relation}_ **${t}**`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function toTrace(
  steps: StepEvent[],
  tokens: TokensEvent | null,
  walltime: number | null
): string {
  const lines: string[] = [];
  for (const step of steps) {
    lines.push(`===== step ${step.index} (${step.kind}) =====`);
    if (step.model) lines.push(`model: ${step.model}`);
    lines.push(`elapsed: ${step.elapsed_s.toFixed(2)}s`);
    if (step.tokens) lines.push(`tokens: in=${step.tokens.in} out=${step.tokens.out}`);
    if (step.reasoning) {
      lines.push("--- reasoning ---");
      lines.push(step.reasoning);
    }
    if (step.code) {
      lines.push("--- code ---");
      lines.push(step.code);
    }
    if (step.output) {
      lines.push("--- output ---");
      lines.push(step.output);
    }
    if (step.tool_name) {
      lines.push(`--- tool: ${step.tool_name} ---`);
      if (step.tool_result) lines.push(step.tool_result);
    }
    lines.push("");
  }
  if (tokens) {
    lines.push("===== tokens =====");
    lines.push(
      `root_in=${tokens.root_in} root_out=${tokens.root_out} sub_in=${tokens.sub_in} sub_out=${tokens.sub_out}`
    );
  }
  if (walltime != null) {
    lines.push("===== done =====");
    lines.push(`wall_time_s=${walltime.toFixed(2)}`);
  }
  return lines.join("\n");
}

// ---------- helpers ----------

function childIndex(mm: MindMap): Map<string, MindMapNode[]> {
  const idx = new Map<string, MindMapNode[]>();
  for (const n of mm.nodes) {
    if (n.parent_id == null) continue;
    const arr = idx.get(n.parent_id) ?? [];
    arr.push(n);
    idx.set(n.parent_id, arr);
  }
  return idx;
}

function findRoot(mm: MindMap): MindMapNode | null {
  return mm.nodes.find((n) => n.parent_id == null) ?? mm.nodes[0] ?? null;
}

function outline(
  node: MindMapNode,
  children: Map<string, MindMapNode[]>,
  lines: string[],
  depth: number
): void {
  const indent = "  ".repeat(depth);
  const summary = node.summary ? ` — ${node.summary}` : "";
  lines.push(`${indent}- **${node.label}**${summary}`);
  for (const c of children.get(node.id) ?? []) outline(c, children, lines, depth + 1);
}

function mermaid(
  node: MindMapNode,
  children: Map<string, MindMapNode[]>,
  lines: string[],
  depth: number
): void {
  const indent = "  ".repeat(depth);
  for (const c of children.get(node.id) ?? []) {
    lines.push(`${indent}${safe(c.label)}`);
    mermaid(c, children, lines, depth + 1);
  }
}

function safe(s: string): string {
  return s.replace(/\(/g, "[").replace(/\)/g, "]").replace(/\n/g, " ");
}
