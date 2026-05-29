// Streaming proxy: browser -> Vercel -> Render Python service.
//
// The browser POSTs JSON + the BYOK header. We forward both to the
// Python service unchanged, optionally injecting the shared secret so
// our deployed extraction URL can't be billed by randoms. The upstream
// response body is a `ReadableStream` of Server-Sent Events; we pipe it
// back to the browser without buffering.

import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vercel Pro / Fluid Compute caps at 300s. RLM runs are usually 60–180s.
export const maxDuration = 300;

const SERVICE_URL = process.env.THREADMAP_SERVICE_URL || "http://localhost:8000";
const SHARED_SECRET = process.env.THREADMAP_SHARED_SECRET;

export async function POST(request: NextRequest): Promise<Response> {
  const providerKey = request.headers.get("x-llm-provider-key");
  const provider = request.headers.get("x-llm-provider");

  if (!providerKey) {
    return jsonError(401, "missing X-LLM-Provider-Key");
  }

  const body = await request.text();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-LLM-Provider-Key": providerKey,
  };
  if (provider) headers["X-LLM-Provider"] = provider;
  if (SHARED_SECRET) headers["X-Threadmap-Shared-Secret"] = SHARED_SECRET;

  let upstream: Response;
  try {
    upstream = await fetch(`${SERVICE_URL}/extract`, {
      method: "POST",
      headers,
      body,
      // do not buffer; pipe straight through
      cache: "no-store",
    });
  } catch (e) {
    return jsonError(
      502,
      `upstream unreachable at ${SERVICE_URL}: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    return jsonError(upstream.status, text || `upstream returned ${upstream.status}`);
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  });
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
