"use client";

import { useCallback } from "react";
import type { MindMap, StepEvent, TokensEvent } from "@/lib/types";
import { toJSON, toMarkdown, toTrace } from "@/lib/renderers";

interface Props {
  mindmap: MindMap | null;
  steps: StepEvent[];
  tokens: TokensEvent | null;
  walltime: number | null;
}

export function Downloads({ mindmap, steps, tokens, walltime }: Props) {
  const download = useCallback((name: string, mime: string, body: string) => {
    const blob = new Blob([body], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, []);

  const hasMap = !!mindmap;
  const hasTrace = steps.length > 0;

  return (
    <div className="flex flex-wrap gap-1.5 text-[11px]">
      <Btn
        disabled={!hasMap}
        onClick={() => mindmap && download("mindmap.json", "application/json", toJSON(mindmap))}
      >
        ⬇ json
      </Btn>
      <Btn
        disabled={!hasMap}
        onClick={() => mindmap && download("mindmap.md", "text/markdown", toMarkdown(mindmap))}
      >
        ⬇ md
      </Btn>
      <Btn
        disabled={!hasTrace}
        onClick={() => download("trace.txt", "text/plain", toTrace(steps, tokens, walltime))}
      >
        ⬇ trace
      </Btn>
    </div>
  );
}

function Btn({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded border border-ink-600 px-2 py-1 text-zinc-300 hover:bg-ink-700 disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  );
}
