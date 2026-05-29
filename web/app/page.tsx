"use client";

import { useCallback, useState } from "react";
import { InputPane, type RunConfig } from "@/components/InputPane";
import { TrajectoryPane } from "@/components/TrajectoryPane";
import { MindMapPane } from "@/components/MindMapPane";
import { replayFixture, streamFromUrl } from "@/lib/sse";
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
  // remember which models the *currently visible* run used, so the
  // trajectory pane can price tokens even after the run completes.
  const [activeRoot, setActiveRoot] = useState<string | undefined>();
  const [activeSub, setActiveSub] = useState<string | undefined>();

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

  const replay = useCallback(() => {
    setActiveRoot("gemini/gemini-2.5-pro");
    setActiveSub("gemini/gemini-2.5-flash");
    return consume(replayFixture("/sample-trajectory.sse"));
  }, [consume]);

  const runLive = useCallback(
    (cfg: RunConfig) => {
      setActiveRoot(cfg.rootModel);
      setActiveSub(cfg.subModel);
      const stream = streamFromUrl("/api/extract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-LLM-Provider-Key": cfg.apiKey,
          "X-LLM-Provider": cfg.provider,
        },
        body: JSON.stringify({
          conversation_text: cfg.conversation!.text,
          instruction: cfg.instruction,
          root_model: cfg.rootModel,
          sub_model: cfg.subModel,
        }),
      });
      return consume(stream);
    },
    [consume]
  );

  return (
    <div className="bg-ink-900 text-zinc-100 lg:grid lg:h-screen lg:w-screen lg:grid-cols-12">
      <div className="border-b border-ink-600 bg-ink-800/40 lg:col-span-4 lg:border-b-0 lg:border-r">
        <InputPane busy={busy} onReplaySample={replay} onRunLive={runLive} onReset={reset} />
      </div>
      <div className="border-b border-ink-600 lg:col-span-5 lg:border-b-0 lg:border-r min-h-[60vh] lg:min-h-0">
        <TrajectoryPane
          status={status}
          steps={steps}
          tokens={tokens}
          walltime={walltime}
          errorMsg={errorMsg}
          busy={busy}
          rootModel={activeRoot}
          subModel={activeSub}
        />
      </div>
      <div className="lg:col-span-3 min-h-[60vh] lg:min-h-0">
        <MindMapPane
          mindmap={mindmap}
          busy={busy && !mindmap}
          steps={steps}
          tokens={tokens}
          walltime={walltime}
        />
      </div>
    </div>
  );
}
