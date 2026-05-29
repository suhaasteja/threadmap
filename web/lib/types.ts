// Event protocol — mirrors server/main.py § event protocol.
// Keep in sync with ui-plan.md §4.

export type StepKind = "root" | "sub_llm" | "tool" | "submit";

export interface StepEvent {
  index: number;
  kind: StepKind;
  elapsed_s: number;
  model?: string;
  reasoning?: string;
  code?: string;
  output?: string;
  tool_name?: string;
  tool_result?: string;
  tokens?: { in: number; out: number };
}

export interface StatusEvent {
  phase: "ingesting" | "extracting" | "rendering";
  message: string;
}

export interface TokensEvent {
  root_in: number;
  root_out: number;
  sub_in: number;
  sub_out: number;
}

export interface MindMapNode {
  id: string;
  label: string;
  summary?: string | null;
  parent_id: string | null;
}

export interface MindMapEdge {
  source_id: string;
  target_id: string;
  relation: string;
}

export interface MindMap {
  title: string;
  nodes: MindMapNode[];
  edges: MindMapEdge[];
}

export interface ErrorEvent {
  message: string;
  where?: string;
}

export interface DoneEvent {
  wall_time_s: number;
}

export type StreamEvent =
  | { event: "status"; data: StatusEvent }
  | { event: "step"; data: StepEvent }
  | { event: "tokens"; data: TokensEvent }
  | { event: "final_mindmap"; data: MindMap }
  | { event: "error"; data: ErrorEvent }
  | { event: "done"; data: DoneEvent };
