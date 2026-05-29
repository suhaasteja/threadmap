// Client-side conversation normalizer. Mirrors threadmap/ingest.py so
// the server only has to deal with role-tagged text in `_doc_from_text`.
//
// Inputs: a File (md / txt / json) OR a raw string.
// Output: a string with one role-tagged turn per line.

const ROLE_LINE =
  /^\s*(?:#+\s*)?(user|human|assistant|claude|ai|system)\s*[:\-]\s*(.*)$/i;

const ROLE_MAP: Record<string, string> = {
  user: "USER",
  human: "USER",
  assistant: "ASSISTANT",
  claude: "ASSISTANT",
  ai: "ASSISTANT",
  system: "SYSTEM",
};

export interface NormalizedConversation {
  text: string;
  turn_count: number;
  est_tokens: number;
  source: string;
}

export async function parseFileToConversation(
  file: File
): Promise<NormalizedConversation> {
  const raw = await file.text();
  const isJson =
    file.name.toLowerCase().endsWith(".json") || raw.trimStart().startsWith("[") || raw.trimStart().startsWith("{");
  const turns = isJson ? parseClaudeJson(raw) : parseText(raw);
  return finalize(turns, file.name);
}

export function parseStringToConversation(
  text: string,
  source = "<paste>"
): NormalizedConversation {
  const turns = parseText(text);
  return finalize(turns.length ? turns : [["USER", text.trim()]], source);
}

// ---------- internals ----------

function finalize(turns: [string, string][], source: string): NormalizedConversation {
  const text = turns.map(([r, b]) => `${r}: ${b}`).join("\n");
  return {
    text,
    turn_count: turns.length,
    est_tokens: Math.max(1, Math.floor(text.length / 4)),
    source,
  };
}

function parseText(raw: string): [string, string][] {
  const turns: [string, string[]][] = [];
  for (const line of raw.split(/\r?\n/)) {
    const m = ROLE_LINE.exec(line);
    if (m) {
      const role = ROLE_MAP[m[1].toLowerCase()];
      turns.push([role, [m[2].trim()]]);
    } else if (turns.length) {
      turns[turns.length - 1][1].push(line.trimEnd());
    }
  }
  return turns
    .map(([r, lines]): [string, string] => [r, flatten(lines)])
    .filter(([, b]) => b.length > 0);
}

function flatten(lines: string[]): string {
  return lines
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");
}

function parseClaudeJson(raw: string): [string, string][] {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return parseText(raw);
  }

  const out: [string, string][] = [];
  const conversations = Array.isArray(data) ? data : [data];

  for (const conv of conversations) {
    if (!conv || typeof conv !== "object") continue;
    const c = conv as Record<string, unknown>;
    const msgs = (c.chat_messages || c.messages) as unknown;
    if (!Array.isArray(msgs)) continue;
    for (const m of msgs) {
      if (!m || typeof m !== "object") continue;
      const msg = m as Record<string, unknown>;
      const sender = String((msg.sender || msg.role || "")).toLowerCase();
      const role = ROLE_MAP[sender] ?? (sender === "user" ? "USER" : "ASSISTANT");
      const body = extractBody(msg);
      if (body) out.push([role, body]);
    }
  }
  if (!out.length) {
    const flat = flattenStrings(data).trim();
    if (flat) out.push(["USER", flat]);
  }
  return out;
}

function extractBody(msg: Record<string, unknown>): string {
  if (typeof msg.text === "string" && msg.text.trim()) return msg.text.trim();
  const content = msg.content;
  const parts: string[] = [];
  if (typeof content === "string") parts.push(content);
  else if (Array.isArray(content)) {
    for (const chunk of content) {
      if (typeof chunk === "string") parts.push(chunk);
      else if (chunk && typeof chunk === "object") {
        const ck = chunk as Record<string, unknown>;
        for (const key of ["text", "input", "output", "content"]) {
          if (typeof ck[key] === "string") parts.push(ck[key] as string);
        }
      }
    }
  }
  return parts.map((s) => s.trim()).filter(Boolean).join(" ");
}

function flattenStrings(obj: unknown): string {
  const out: string[] = [];
  const walk = (x: unknown) => {
    if (typeof x === "string") {
      const s = x.trim();
      if (s) out.push(s);
    } else if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === "object") Object.values(x).forEach(walk);
  };
  walk(obj);
  return out.join(" ");
}
