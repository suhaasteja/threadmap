// Streaming clients for our event protocol.
//
// - `replayFixture(url)`: fetches a recorded `.sse` file and yields its
//   events with synthetic pacing so the UI looks alive. Used in U1 before
//   the backend is wired.
// - `streamFromUrl(url, init)`: real Server-Sent Events from a POST that
//   returns `text/event-stream`. The browser's EventSource is GET-only,
//   so we use fetch + a manual parser. Used in U3.
//
// Both yield a uniform `StreamEvent`.

import type { StreamEvent } from "./types";

export async function* replayFixture(url: string): AsyncGenerator<StreamEvent> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`fixture fetch failed: ${res.status}`);
  const text = await res.text();
  const parsed = parseSseText(text);

  // synthetic pacing: status/tool/done are quick, step cards take a moment
  for (const evt of parsed) {
    const delay =
      evt.event === "step"
        ? Math.min(1200, Math.max(250, ((evt.data as { elapsed_s?: number }).elapsed_s || 0.5) * 80))
        : evt.event === "final_mindmap"
        ? 600
        : 200;
    await sleep(delay);
    yield evt;
  }
}

export async function* streamFromUrl(
  url: string,
  init: RequestInit
): AsyncGenerator<StreamEvent> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { ...(init.headers || {}) } });
  } catch (e) {
    throw new Error(`network: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!res.ok || !res.body) {
    let detail = "";
    try {
      const txt = await res.text();
      const parsed = JSON.parse(txt);
      if (parsed && typeof parsed.error === "string") detail = parsed.error;
      else if (txt) detail = txt;
    } catch {
      /* not JSON, fall through */
    }
    throw new Error(`${res.status} ${res.statusText}${detail ? ` — ${detail}` : ""}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = drainBuffer(buffer);
    buffer = events.remainder;
    for (const evt of events.events) yield evt;
  }
}

// ---------- SSE parsing ----------

function parseSseText(text: string): StreamEvent[] {
  const { events } = drainBuffer(text);
  return events;
}

function drainBuffer(buf: string): { events: StreamEvent[]; remainder: string } {
  const events: StreamEvent[] = [];
  const parts = buf.split(/\r?\n\r?\n/);
  // keep the last (possibly incomplete) chunk in the remainder
  const remainder = parts.pop() ?? "";
  for (const part of parts) {
    const evt = parseSseBlock(part);
    if (evt) events.push(evt);
  }
  return { events, remainder };
}

function parseSseBlock(block: string): StreamEvent | null {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (!line || line.startsWith(":")) continue;
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  if (!dataLines.length) return null;
  let data: unknown;
  try {
    data = JSON.parse(dataLines.join("\n"));
  } catch {
    return null;
  }
  return { event, data } as StreamEvent;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
