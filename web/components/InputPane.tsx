"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_MODELS, type Provider } from "@/lib/defaults";
import { parseFileToConversation, parseStringToConversation, type NormalizedConversation } from "@/lib/parseConversation";
import { getLS, setLS } from "@/lib/storage";
import { KeyField } from "./KeyField";

export type InputMode = "sample" | "paste" | "drop";

export interface RunConfig {
  mode: InputMode;
  conversation: NormalizedConversation | null;
  apiKey: string;
  provider: Provider;
  rootModel: string;
  subModel: string;
  instruction: string;
}

interface Props {
  busy: boolean;
  onReplaySample: () => void;
  onRunLive: (cfg: RunConfig) => void;
  onReset: () => void;
}

export function InputPane({ busy, onReplaySample, onRunLive, onReset }: Props) {
  const [mode, setMode] = useState<InputMode>("sample");
  const [provider, setProvider] = useState<Provider>("gemini");
  const [apiKey, setApiKey] = useState("");
  const [rootModel, setRootModel] = useState(DEFAULT_MODELS.gemini.root);
  const [subModel, setSubModel] = useState(DEFAULT_MODELS.gemini.sub);

  const [pasteText, setPasteText] = useState("");
  const [droppedConv, setDroppedConv] = useState<NormalizedConversation | null>(null);
  const [dropName, setDropName] = useState<string | null>(null);
  const [dropError, setDropError] = useState<string | null>(null);

  const [instruction, setInstruction] = useState<string>("");
  const [defaultInstruction, setDefaultInstruction] = useState<string>("");
  const [instructionExpanded, setInstructionExpanded] = useState(false);

  // ---------- persistence ----------

  // restore non-secret fields (provider, models, instruction edits) on mount
  useEffect(() => {
    const p = (getLS("provider") as Provider) || "gemini";
    setProvider(p);
    const rm = getLS(`models.${p}.root`) || DEFAULT_MODELS[p].root;
    const sm = getLS(`models.${p}.sub`) || DEFAULT_MODELS[p].sub;
    setRootModel(rm);
    setSubModel(sm);
    const inst = getLS("instruction") || "";
    setInstruction(inst);
    const lastMode = (getLS("mode") as InputMode) || "sample";
    setMode(lastMode);
  }, []);

  // fetch the shipped default instruction once; do not overwrite user edits
  useEffect(() => {
    fetch("/default-instruction.md")
      .then((r) => (r.ok ? r.text() : ""))
      .then((t) => {
        setDefaultInstruction(t);
        setInstruction((prev) => prev || t);
      })
      .catch(() => {});
  }, []);

  // persist provider + models on change
  useEffect(() => {
    setLS("provider", provider);
  }, [provider]);
  useEffect(() => {
    setLS(`models.${provider}.root`, rootModel);
  }, [provider, rootModel]);
  useEffect(() => {
    setLS(`models.${provider}.sub`, subModel);
  }, [provider, subModel]);
  useEffect(() => {
    if (instruction && instruction !== defaultInstruction) setLS("instruction", instruction);
  }, [instruction, defaultInstruction]);
  useEffect(() => {
    setLS("mode", mode);
  }, [mode]);

  // when provider changes, refill models to that provider's defaults
  // *unless* the user has stored overrides for that provider
  useEffect(() => {
    const rm = getLS(`models.${provider}.root`) || DEFAULT_MODELS[provider].root;
    const sm = getLS(`models.${provider}.sub`) || DEFAULT_MODELS[provider].sub;
    setRootModel(rm);
    setSubModel(sm);
  }, [provider]);

  // ---------- file drop ----------

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setDropError(null);
    try {
      const conv = await parseFileToConversation(file);
      setDroppedConv(conv);
      setDropName(file.name);
    } catch (e) {
      setDropError(e instanceof Error ? e.message : String(e));
      setDroppedConv(null);
      setDropName(null);
    }
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  // ---------- run gating ----------

  const conversationForRun: NormalizedConversation | null =
    mode === "paste"
      ? pasteText.trim()
        ? parseStringToConversation(pasteText)
        : null
      : mode === "drop"
      ? droppedConv
      : null;

  const canRun =
    mode !== "sample" &&
    !!conversationForRun &&
    apiKey.trim().length > 0 &&
    rootModel.trim().length > 0 &&
    subModel.trim().length > 0 &&
    instruction.trim().length > 0 &&
    !busy;

  const fireRun = () => {
    if (!canRun || !conversationForRun) return;
    onRunLive({
      mode,
      conversation: conversationForRun,
      apiKey: apiKey.trim(),
      provider,
      rootModel: rootModel.trim(),
      subModel: subModel.trim(),
      instruction: instruction.trim(),
    });
  };

  // ---------- render ----------

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-ink-600 px-4 py-3">
        <div className="text-[11px] uppercase tracking-wider text-zinc-500">input</div>
        <h1 className="mt-0.5 text-lg font-semibold text-white">threadmap</h1>
        <p className="mt-0.5 text-[11px] text-zinc-500">
          One Claude conversation → navigable mind map via DSPy RLM.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto scroll-thin px-4 py-4 space-y-5">
        {/* tabs */}
        <div>
          <div className="mb-2 flex gap-1">
            {(["sample", "paste", "drop"] as InputMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`rounded-md px-2.5 py-1 text-xs ${
                  mode === m
                    ? "bg-ink-700 text-white"
                    : "border border-ink-600 text-zinc-400 hover:bg-ink-700"
                }`}
              >
                {labelFor(m)}
              </button>
            ))}
          </div>

          {mode === "sample" && (
            <div className="rounded-md border border-ink-600 bg-ink-800/40 p-3">
              <p className="text-xs leading-relaxed text-zinc-400">
                Replay a recorded RLM trajectory against the bundled sample. No backend, no key, no
                tokens. Useful for seeing what live runs will look like.
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
            </div>
          )}

          {mode === "paste" && (
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={
                'Paste a transcript with role markers, e.g.\n\nUSER: ...\nASSISTANT: ...\nUSER: ...'
              }
              rows={8}
              className="block w-full rounded-md border border-ink-600 bg-ink-900 p-2 font-mono text-[12px] text-zinc-100 placeholder:text-zinc-600 focus:border-accent-root focus:outline-none"
              spellCheck={false}
            />
          )}

          {mode === "drop" && (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className="cursor-pointer rounded-md border border-dashed border-ink-600 bg-ink-900/40 p-6 text-center text-xs text-zinc-400 hover:bg-ink-900/70"
            >
              {dropName ? (
                <div>
                  <div className="text-zinc-200">{dropName}</div>
                  <div className="mt-1 tabular-nums text-zinc-500">
                    {droppedConv?.turn_count ?? 0} turns · ≈
                    {fmt(droppedConv?.est_tokens ?? 0)} tokens
                  </div>
                  {dropError && <div className="mt-1 text-accent-err">{dropError}</div>}
                </div>
              ) : (
                <>
                  Drop a <code className="font-mono">.md</code> / <code className="font-mono">.txt</code> /
                  conversations.json here, or click to pick a file.
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".md,.txt,.json,text/plain,application/json"
                className="hidden"
                onChange={(e) => e.target.files && e.target.files[0] && handleFile(e.target.files[0])}
              />
            </div>
          )}
        </div>

        {/* BYOK */}
        <Section title="Provider & key">
          <KeyField
            provider={provider}
            onProviderChange={setProvider}
            apiKey={apiKey}
            onApiKeyChange={setApiKey}
          />
        </Section>

        {/* Models */}
        <Section title="Models (LiteLLM format)">
          <div className="space-y-2">
            <LabeledInput label="root" value={rootModel} onChange={setRootModel} />
            <LabeledInput label="sub_lm" value={subModel} onChange={setSubModel} />
            <p className="text-[11px] leading-relaxed text-zinc-500">
              The root model writes code that explores the conversation. The sub_lm handles the
              bulk slice-reading via <code className="font-mono">llm_query_batched</code> — that&rsquo;s
              where most of the token spend lives.
            </p>
          </div>
        </Section>

        {/* Instruction */}
        <Section
          title="Instruction (biggest quality lever)"
          right={
            <button
              type="button"
              onClick={() => setInstruction(defaultInstruction)}
              disabled={!defaultInstruction || instruction === defaultInstruction}
              className="text-[11px] text-zinc-500 underline decoration-dotted hover:text-zinc-300 disabled:opacity-40"
            >
              reset
            </button>
          }
        >
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            rows={instructionExpanded ? 16 : 6}
            className="block w-full rounded-md border border-ink-600 bg-ink-900 p-2 font-mono text-[11px] text-zinc-100 focus:border-accent-root focus:outline-none"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={() => setInstructionExpanded((v) => !v)}
            className="mt-1 text-[11px] text-zinc-500 hover:text-zinc-300"
          >
            {instructionExpanded ? "− shrink" : "+ expand"}
          </button>
        </Section>

        {/* Run */}
        {mode !== "sample" && (
          <div className="rounded-md border border-ink-600 bg-ink-800/40 p-3">
            <div className="flex gap-2">
              <button
                onClick={fireRun}
                disabled={!canRun}
                className="rounded-md bg-accent-root/80 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-root disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? "Running…" : "▶ Run"}
              </button>
              <button
                onClick={onReset}
                disabled={busy}
                className="rounded-md border border-ink-600 px-3 py-1.5 text-sm text-zinc-300 hover:bg-ink-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Reset
              </button>
            </div>
            <ChecklistGate
              items={[
                { ok: !!conversationForRun, label: "conversation present" },
                { ok: apiKey.trim().length > 0, label: "API key present" },
                { ok: rootModel.trim().length > 0, label: "root model set" },
                { ok: subModel.trim().length > 0, label: "sub_lm set" },
                { ok: instruction.trim().length > 0, label: "instruction non-empty" },
              ]}
            />
            <p className="mt-2 text-[11px] text-amber-300/80">
              Live extraction is wired in U3 (the FastAPI service + the Vercel proxy). In U2,{" "}
              <span className="font-semibold">Run</span> will play back the recorded sample so you
              can see the end-to-end UX — the inputs above are real and will drive the real
              extraction once the backend is wired.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- small atoms ----------

function Section({
  title,
  children,
  right,
}: {
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-wider text-zinc-500">{title}</div>
        {right}
      </div>
      {children}
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="w-14 font-mono text-zinc-500">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 rounded-md border border-ink-600 bg-ink-900 px-2 py-1 font-mono text-[11px] text-zinc-100 focus:border-accent-root focus:outline-none"
        spellCheck={false}
        autoComplete="off"
      />
    </label>
  );
}

function ChecklistGate({ items }: { items: { ok: boolean; label: string }[] }) {
  const passing = items.every((i) => i.ok);
  if (passing) return null;
  return (
    <ul className="mt-2 space-y-0.5 text-[11px] text-zinc-500">
      {items.map((i, idx) => (
        <li key={idx} className={i.ok ? "text-emerald-400/80" : "text-zinc-500"}>
          {i.ok ? "✓" : "•"} {i.label}
        </li>
      ))}
    </ul>
  );
}

function labelFor(m: InputMode): string {
  switch (m) {
    case "sample":
      return "Sample";
    case "paste":
      return "Paste";
    case "drop":
      return "Drop";
  }
}

function fmt(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;
}
