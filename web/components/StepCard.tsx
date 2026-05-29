"use client";

import { useState } from "react";
import type { StepEvent } from "@/lib/types";

const KIND_STYLES: Record<string, { label: string; ring: string; dot: string }> = {
  root:    { label: "root",    ring: "border-accent-root/60", dot: "bg-accent-root" },
  sub_llm: { label: "sub-llm", ring: "border-accent-sub/60",  dot: "bg-accent-sub" },
  tool:    { label: "tool",    ring: "border-accent-tool/60", dot: "bg-accent-tool" },
  submit:  { label: "submit",  ring: "border-emerald-500/60", dot: "bg-emerald-500" },
};

export function StepCard({ step }: { step: StepEvent }) {
  const k = KIND_STYLES[step.kind] ?? KIND_STYLES.root;
  const [showReasoning, setShowReasoning] = useState(false);
  const [showCode, setShowCode] = useState(true);
  const [showOutput, setShowOutput] = useState(false);

  const summary =
    step.kind === "tool"
      ? `${step.tool_name ?? "tool"} → ${truncOneLine(step.tool_result, 80)}`
      : step.reasoning
      ? truncOneLine(step.reasoning, 110)
      : step.code
      ? truncOneLine(step.code, 110)
      : "(no detail)";

  return (
    <div className={`rounded-lg border ${k.ring} bg-ink-800/70 p-3`}>
      <div className="flex items-center gap-3 text-xs text-zinc-400">
        <span className={`inline-block h-2 w-2 rounded-full ${k.dot}`} />
        <span className="font-mono text-zinc-300">#{step.index}</span>
        <span className="uppercase tracking-wide">{k.label}</span>
        {step.model && (
          <span className="font-mono text-zinc-500 truncate max-w-[180px]" title={step.model}>
            {step.model}
          </span>
        )}
        <span className="ml-auto tabular-nums text-zinc-500">{step.elapsed_s.toFixed(1)}s</span>
        {step.tokens && (
          <span className="tabular-nums text-zinc-500">
            {step.tokens.in}↓ {step.tokens.out}↑
          </span>
        )}
      </div>

      <div className="mt-1.5 text-sm text-zinc-200">{summary}</div>

      {(step.reasoning || step.code || step.output) && (
        <div className="mt-2 flex gap-3 text-[11px] text-zinc-400">
          {step.reasoning && (
            <button onClick={() => setShowReasoning((v) => !v)} className="hover:text-zinc-200">
              {showReasoning ? "− reasoning" : "+ reasoning"}
            </button>
          )}
          {step.code && (
            <button onClick={() => setShowCode((v) => !v)} className="hover:text-zinc-200">
              {showCode ? "− code" : "+ code"}
            </button>
          )}
          {step.output && (
            <button onClick={() => setShowOutput((v) => !v)} className="hover:text-zinc-200">
              {showOutput ? "− output" : "+ output"}
            </button>
          )}
        </div>
      )}

      {showReasoning && step.reasoning && (
        <pre className="mt-2 whitespace-pre-wrap rounded bg-ink-900/80 p-2 text-[12px] text-zinc-300">
          {step.reasoning}
        </pre>
      )}
      {showCode && step.code && (
        <pre className="mt-2 overflow-x-auto rounded bg-ink-950 p-2 text-[12px] font-mono text-emerald-200 scroll-thin">
          {step.code}
        </pre>
      )}
      {showOutput && step.output && (
        <pre className="mt-2 max-h-48 overflow-auto rounded bg-ink-900/80 p-2 text-[12px] text-amber-200 scroll-thin">
          {step.output}
        </pre>
      )}
    </div>
  );
}

function truncOneLine(s: string | undefined, n: number): string {
  if (!s) return "";
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > n ? one.slice(0, n) + "…" : one;
}
