"use client";

import { useEffect, useRef } from "react";
import type { StatusEvent, StepEvent, TokensEvent } from "@/lib/types";
import { estimateCostUSD, fmtUSD } from "@/lib/costs";
import { StepCard } from "./StepCard";

interface Props {
  status: StatusEvent | null;
  steps: StepEvent[];
  tokens: TokensEvent | null;
  walltime: number | null;
  errorMsg: string | null;
  rootModel?: string;
  subModel?: string;
}

export function TrajectoryPane({ status, steps, tokens, walltime, errorMsg, rootModel, subModel }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // auto-scroll to bottom unless user scrolled up
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [steps.length]);

  const subCalls = steps.filter((s) => s.kind === "sub_llm").length;
  const toolCalls = steps.filter((s) => s.kind === "tool").length;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-ink-600 px-4 py-3">
        <div className="text-[11px] uppercase tracking-wider text-zinc-500">trajectory</div>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-300">
          <Stat label="steps" value={steps.length} />
          <Stat label="sub-llm" value={subCalls} />
          <Stat label="tools" value={toolCalls} />
          {tokens && (
            <>
              <Stat label="root tok" value={fmt(tokens.root_in + tokens.root_out)} />
              <Stat label="sub tok" value={fmt(tokens.sub_in + tokens.sub_out)} />
              {rootModel && subModel && (
                <Stat label="cost" value={fmtUSD(estimateCostUSD(rootModel, subModel, tokens))} />
              )}
            </>
          )}
          {walltime != null && <Stat label="wall" value={`${walltime.toFixed(1)}s`} />}
        </div>
        {status && (
          <div className="mt-1 text-[11px] text-zinc-500">
            <span className="text-zinc-400">{status.phase}:</span> {status.message}
          </div>
        )}
        {errorMsg && (
          <div className="mt-1 text-[11px] text-accent-err">error: {errorMsg}</div>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto scroll-thin px-4 py-3 space-y-2">
        {steps.length === 0 && !status && (
          <div className="mt-12 text-center text-sm text-zinc-500">
            Trajectory steps appear here as the RLM runs.
            <br />
            <span className="text-zinc-600">
              Each step shows the code the model wrote and the result it observed.
            </span>
          </div>
        )}
        {steps.map((s) => (
          <StepCard key={s.index} step={s} />
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="tabular-nums">
      <span className="text-zinc-500">{label}</span>{" "}
      <span className="text-zinc-200">{value}</span>
    </span>
  );
}

function fmt(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;
}
