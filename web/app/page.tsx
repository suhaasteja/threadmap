"use client";

import { useCallback, useState } from "react";
import { InputPane } from "@/components/InputPane";
import { TrajectoryPane } from "@/components/TrajectoryPane";
import { MindMapPane } from "@/components/MindMapPane";
import { replayFixture } from "@/lib/sse";
import type {
  DoneEvent,
  MindMap,
  StatusEvent,
  StepEvent,
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

  const replay = useCallback(async () => {
    reset();
    setBusy(true);
    try {
      for await (const evt of replayFixture("/sample-trajectory.sse")) {
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
  }, [reset]);

  return (
    <div className="grid h-screen w-screen grid-cols-12 bg-ink-900 text-zinc-100">
      <div className="col-span-4 border-r border-ink-600 bg-ink-800/40">
        <InputPane onReplaySample={replay} onReset={reset} busy={busy} />
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
