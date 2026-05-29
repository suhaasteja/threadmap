"use client";

import { useEffect, useState } from "react";
import { PROVIDERS, type Provider } from "@/lib/defaults";
import { delLS, delSS, getLS, getSS, setLS, setSS } from "@/lib/storage";

interface Props {
  provider: Provider;
  onProviderChange: (p: Provider) => void;
  apiKey: string;
  onApiKeyChange: (k: string) => void;
}

const keyStorageKey = (p: Provider) => `byok.${p}`;
const rememberStorageKey = (p: Provider) => `byok.${p}.remember`;

export function KeyField({ provider, onProviderChange, apiKey, onApiKeyChange }: Props) {
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(false);

  // load persisted key + remember preference whenever the provider changes
  useEffect(() => {
    const rememberStored = getLS(rememberStorageKey(provider)) === "1";
    setRemember(rememberStored);
    const stored = rememberStored ? getLS(keyStorageKey(provider)) : getSS(keyStorageKey(provider));
    onApiKeyChange(stored ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  // persist the key as it changes, in whichever store the user chose
  useEffect(() => {
    if (!apiKey) {
      delLS(keyStorageKey(provider));
      delSS(keyStorageKey(provider));
      return;
    }
    if (remember) setLS(keyStorageKey(provider), apiKey);
    else setSS(keyStorageKey(provider), apiKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, provider, remember]);

  const updateRemember = (next: boolean) => {
    setRemember(next);
    if (next) setLS(rememberStorageKey(provider), "1");
    else delLS(rememberStorageKey(provider));
    // migrate the current key between stores so the toggle is immediate
    if (apiKey) {
      if (next) {
        setLS(keyStorageKey(provider), apiKey);
        delSS(keyStorageKey(provider));
      } else {
        setSS(keyStorageKey(provider), apiKey);
        delLS(keyStorageKey(provider));
      }
    }
  };

  const clear = () => {
    onApiKeyChange("");
    delLS(keyStorageKey(provider));
    delSS(keyStorageKey(provider));
  };

  const current = PROVIDERS.find((p) => p.id === provider)!;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {PROVIDERS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onProviderChange(p.id)}
            className={`rounded-md px-2 py-1 text-xs ${
              p.id === provider
                ? "bg-accent-root/80 text-white"
                : "border border-ink-600 text-zinc-300 hover:bg-ink-700"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <input
          type={show ? "text" : "password"}
          value={apiKey}
          onChange={(e) => onApiKeyChange(e.target.value)}
          placeholder={`${current.label} API key`}
          className="flex-1 rounded-md border border-ink-600 bg-ink-900 px-2 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-accent-root focus:outline-none"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="rounded border border-ink-600 px-2 py-1 text-[11px] text-zinc-300 hover:bg-ink-700"
        >
          {show ? "hide" : "show"}
        </button>
        <button
          type="button"
          onClick={clear}
          disabled={!apiKey}
          className="rounded border border-ink-600 px-2 py-1 text-[11px] text-zinc-300 hover:bg-ink-700 disabled:opacity-40"
        >
          clear
        </button>
      </div>

      <div className="flex items-center justify-between text-[11px] text-zinc-500">
        <label className="flex cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => updateRemember(e.target.checked)}
            className="accent-accent-root"
          />
          <span>Remember on this device</span>
        </label>
        <a
          href={`https://${current.keyHint}`}
          target="_blank"
          rel="noreferrer"
          className="text-zinc-500 underline decoration-dotted hover:text-zinc-300"
        >
          get a key
        </a>
      </div>

      <p className="text-[11px] leading-relaxed text-zinc-500">
        Your key is sent only to threadmap&rsquo;s extraction service for the run, and is never
        logged. By default it lives in this tab&rsquo;s session storage and is cleared on close;
        tick <em>Remember</em> to keep it in this browser.
      </p>
    </div>
  );
}
