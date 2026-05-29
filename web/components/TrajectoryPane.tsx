"use client";

import { useEffect, useRef, useState } from "react";
import type { StatusEvent, StepEvent, TokensEvent } from "@/lib/types";
import { estimateCostUSD, fmtUSD } from "@/lib/costs";
import { StepCard } from "./StepCard";

interface Props {
  status: StatusEvent | null;
  steps: StepEvent[];
  tokens: TokensEvent | null;
  walltime: number | null;
  errorMsg: string | null;
  busy: boolean;
  rootModel?: string;
  subModel?: string;
}

export function TrajectoryPane({
  status,
  steps,
  tokens,
  walltime,
  errorMsg,
  busy,
  rootModel,
  subModel,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showWarmup, setShowWarmup] = useState(false);

  // RLM cold starts on Render can take 10–20s before the first event.
  // After ~6s of silence post-run-start, show a "warming up" hint so the
  // UI doesn't look frozen. Hide again as soon as anything streams in.
  useEffect(() => {
    if (!busy) {
      setShowWarmup(false);
      return;
    }
    if (status || steps.length) {
      setShowWarmup(false);
      return;
    }
    const t = setTimeout(() => setShowWarmup(true), 6000);
    return () => clearTimeout(t);
  }, [busy, status, steps.length]);

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
        {steps.length === 0 && !status && !busy && (
          <div className="mx-auto mt-10 max-w-md space-y-3 text-sm text-zinc-400">
            <p className="text-center text-zinc-300">
              This pane is the point of using RLM.
            </p>
            <p>
              The Recursive Language Model treats your transcript as a variable in a Python REPL.
              It writes code to slice the conversation, dispatches cheaper sub-LLM calls over
              the slices, validates its own output against a schema, and only then submits a
              <span className="text-zinc-200"> mind map</span>.
            </p>
            <p className="text-zinc-500">
              Each step below shows the code it wrote, the model that ran, the tokens spent, and the
              observation it acted on next. Hide this pane and you can&rsquo;t tell this apart from any
              &ldquo;AI summary&rdquo; tool. Surface it and the artifact becomes auditable.
            </p>
          </div>
        )}
        {showWarmup && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            <span className="font-semibold">Warming up the sandbox…</span>{" "}
            <span className="text-amber-300/80">
              The extraction service runs the model&rsquo;s code in a Pyodide-in-Deno sandbox. First
              run after a cold start can take 10–20s before any output. Subsequent runs are quick.
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
