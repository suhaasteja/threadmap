"use client";

interface Props {
  onReplaySample: () => void;
  onReset: () => void;
  busy: boolean;
}

export function InputPane({ onReplaySample, onReset, busy }: Props) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-ink-600 px-4 py-3">
        <div className="text-[11px] uppercase tracking-wider text-zinc-500">input</div>
        <h1 className="mt-0.5 text-lg font-semibold text-white">threadmap</h1>
        <p className="mt-0.5 text-[11px] text-zinc-500">
          One Claude conversation → navigable mind map via DSPy RLM.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto scroll-thin px-4 py-4 space-y-4">
        <Section title="Stage U1 — fixture-driven preview">
          <p className="text-xs leading-relaxed text-zinc-400">
            This UI is wired to the SSE event protocol but not yet to the live backend. Click
            <span className="mx-1 rounded bg-ink-700 px-1.5 py-0.5 font-mono text-[11px] text-zinc-200">
              Replay sample
            </span>
            to stream a recorded trajectory. The trajectory pane fills in real time, then the mind
            map renders on the right when the run completes.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={onReplaySample}
              disabled={busy}
              className="rounded-md bg-accent-root/80 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-root disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "Replaying…" : "▶ Replay sample"}
            </button>
            <button
              onClick={onReset}
              disabled={busy}
              className="rounded-md border border-ink-600 px-3 py-1.5 text-sm text-zinc-300 hover:bg-ink-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Reset
            </button>
          </div>
        </Section>

        <Section title="Coming in U2">
          <ul className="space-y-1 text-xs text-zinc-400">
            <li>• Paste / drop a transcript or pick a sample</li>
            <li>• Bring-your-own provider key (Gemini default, Anthropic, OpenAI…)</li>
            <li>• Editable instruction — the biggest quality lever</li>
            <li>• Model picker (root + cheaper sub for RLM sub-calls)</li>
          </ul>
        </Section>

        <Section title="Why a trajectory pane">
          <p className="text-xs leading-relaxed text-zinc-400">
            RLM treats the conversation as a variable in a Python REPL and writes code to explore
            it — slicing turns, dispatching sub-LLM calls, validating its own output before
            submitting. The middle pane shows exactly that. Hide the trajectory and this looks like
            any &ldquo;AI summary&rdquo; tool; surface it and you can see, step by step, how the
            model arrived at the artifact.
          </p>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[11px] uppercase tracking-wider text-zinc-500">{title}</div>
      {children}
    </div>
  );
}
