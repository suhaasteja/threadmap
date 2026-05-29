"use client";

import { useCallback, useState } from "react";
import { InputPane, type RunConfig } from "@/components/InputPane";
import { TrajectoryPane } from "@/components/TrajectoryPane";
import { MindMapPane } from "@/components/MindMapPane";
import { replayFixture } from "@/lib/sse";
import type {
  DoneEvent,
  MindMap,
  StatusEvent,
  StepEvent,
  StreamEvent,
  TokensEvent,
} from "@/lib/types";

export default function Page() {
  const [status, setStatus] = useState<StatusEvent | null>(null);
  const [steps, setSteps] = useState<StepEvent[]>([]);
  const [tokens, setTokens] = useState<TokensEvent | null>(null);
  const [mindmap, setMindmap] = useState<MindMap | null>(null);
  const [walltime, setWalltime] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = useCallback(() => {
    setStatus(null);
    setSteps([]);
    setTokens(null);
    setMindmap(null);
    setWalltime(null);
    setErrorMsg(null);
  }, []);

  const consume = useCallback(
    async (stream: AsyncGenerator<StreamEvent>) => {
      reset();
      setBusy(true);
      try {
        for await (const evt of stream) {
          switch (evt.event) {
            case "status":
              setStatus(evt.data as StatusEvent);
              break;
            case "step":
              setSteps((s) => [...s, evt.data as StepEvent]);
              break;
            case "tokens":
              setTokens(evt.data as TokensEvent);
              break;
            case "final_mindmap":
              setMindmap(evt.data as MindMap);
              break;
            case "done":
              setWalltime((evt.data as DoneEvent).wall_time_s);
              break;
            case "error":
              setErrorMsg((evt.data as { message: string }).message);
              break;
          }
        }
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [reset]
  );

  const replay = useCallback(() => consume(replayFixture("/sample-trajectory.sse")), [consume]);

  // U2: the Run button collects real inputs but still plays the fixture.
  // U3 swaps `replayFixture` for `streamFromUrl("/api/extract", { ... })`
  // with the BYOK header — no other UI code changes.
  const runLive = useCallback(
    (_cfg: RunConfig) => {
      // For now, replay the fixture so the UX stays demonstrable end-to-end.
      // The collected config is intentionally unused until U3.
      return consume(replayFixture("/sample-trajectory.sse"));
    },
    [consume]
  );

  return (
    <div className="grid h-screen w-screen grid-cols-12 bg-ink-900 text-zinc-100">
      <div className="col-span-4 border-r border-ink-600 bg-ink-800/40">
        <InputPane busy={busy} onReplaySample={replay} onRunLive={runLive} onReset={reset} />
      </div>
      <div className="col-span-5 border-r border-ink-600">
        <TrajectoryPane
          status={status}
          steps={steps}
          tokens={tokens}
          walltime={walltime}
          errorMsg={errorMsg}
        />
      </div>
      <div className="col-span-3">
        <MindMapPane mindmap={mindmap} busy={busy && !mindmap} />
      </div>
    </div>
  );
}
