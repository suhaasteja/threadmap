# DEPLOY

Two services. Render hosts the Python extraction service; Vercel hosts the Next.js UI. The UI talks to Render via a thin Next.js API route. Visitors bring their own provider key.

```
visitor browser
      │  (BYOK header)
      ▼
 Vercel (Next.js)  ── /api/extract proxy ──►  Render (FastAPI + DSPy RLM)
      │                                                │
      │                                                └─► Gemini / Anthropic / OpenAI
      │
      └─ static UI, fixture for offline replay
```

---

## 1. Render — the Python extraction service

The repo already contains `render.yaml` (Blueprint) and `server/Dockerfile`. The Dockerfile installs Deno because `dspy.RLM`'s default sandbox is Pyodide-in-Deno.

1. Push the repo to GitHub (already done at `github.com/suhaasteja/threadmap`).
2. Render dashboard → **New +** → **Blueprint** → pick the repo.
3. Render reads `render.yaml`, picks up the Dockerfile, builds, deploys.
4. Once the service is up, set its env vars in the Render dashboard:
   - `THREADMAP_SHARED_SECRET` — pick a long random string (`openssl rand -hex 24`). Required.
     Without it, anyone hitting the public Render URL with a provider key could bill that quota.
   - `THREADMAP_ALLOWED_ORIGINS` — set to your Vercel URL once you have it
     (e.g. `https://threadmap.vercel.app`). Until then, leave the default so local dev works.
5. Note the service's public URL — looks like `https://threadmap-extract.onrender.com`.
6. Smoke test:
   ```bash
   curl https://threadmap-extract.onrender.com/health
   # {"status":"ok"}
   ```

**Cold starts.** Render's `starter` plan idles after inactivity and the first request after takes 15–60s. The UI already shows a "Warming up the sandbox…" hint after 6s of silence — but if you want it instantaneous, bump to `standard` (always-on).

**Cost.** `starter` is ~$7/mo. The RLM run itself is billed against the visitor's provider key, not Render. The only Render compute cost is request handling + the sandbox process — both modest.

---

## 2. Vercel — the Next.js UI

1. Vercel dashboard → **Add New Project** → import the same GitHub repo.
2. **Root Directory:** set to `web` (not the repo root — the Next.js project lives there).
3. **Build Command, Output Directory, Install Command:** leave Vercel's auto-detected defaults.
4. Add environment variables (Production + Preview):
   - `THREADMAP_SERVICE_URL` = `https://threadmap-extract.onrender.com` (the Render URL from step 1).
   - `THREADMAP_SHARED_SECRET` = the same value you set on Render. The Next.js proxy sends it as
     `X-Threadmap-Shared-Secret`; Render rejects requests without it.
5. Deploy. Note the production URL (`https://threadmap.vercel.app` or whatever you pick).
6. Go back to Render and update `THREADMAP_ALLOWED_ORIGINS` to that Vercel URL.

**Function duration.** The streaming proxy is configured with `maxDuration = 300`. That's Vercel's Pro / Fluid Compute cap. Hobby plan caps at 60s, which will timeout most real RLM runs — Pro is effectively required for production use.

**No Vercel-side API keys.** The visitor's provider key flows through the proxy as a header, never touching disk or logs. Verify in the Vercel function logs after a real run: you should see HTTP method + path + status, never bodies.

---

## 3. Verify the production flow

```bash
# Open the Vercel URL in a browser
# 1. Sample tab → ▶ Replay sample. Should work without keys (fixture only).
# 2. Paste tab → paste a short transcript with USER:/ASSISTANT: lines.
# 3. Provider & key → pick Gemini (or your provider) → paste your real key.
# 4. ▶ Run.
```

Expect: warmup hint after a few seconds on the first run, then a streaming trajectory, then the mind map. Click downloads — `mindmap.json`, `mindmap.md`, `trace.txt` save locally.

---

## 4. Security check

After a real run:

- **Render logs.** Should show the `/extract` HTTP method + status only. The service has
  `uvicorn.access` logging disabled, so neither request bodies nor headers reach disk.
- **Vercel function logs.** Same shape — method, path, status. No body, no header values.
- **Shared secret.** Hit the Render `/extract` URL directly without the header. Should return 401.
  Hit it through Vercel — Vercel injects the header, request succeeds.
- **CORS.** Hit Render `/extract` from a random origin (e.g. `localhost` after revoking it from
  `THREADMAP_ALLOWED_ORIGINS`). The browser should refuse to read the response.

---

## 5. Local dev parity

The same configuration knobs work locally:

```bash
# Terminal 1 — Python service
source .venv/bin/activate
export GEMINI_API_KEY=...      # only needed if you want to test live extraction
uvicorn server.main:app --port 8000

# Terminal 2 — Next.js
cd web
cp .env.example .env.local     # THREADMAP_SERVICE_URL defaults to http://localhost:8000
npm install
npm run dev
# open http://localhost:3000
```

To match production with the shared-secret check on:

```bash
# Terminal 1
export THREADMAP_SHARED_SECRET=$(openssl rand -hex 24)
uvicorn server.main:app --port 8000

# Terminal 2: add it to web/.env.local too
echo "THREADMAP_SHARED_SECRET=$THREADMAP_SHARED_SECRET" >> web/.env.local
npm run dev
```

---

## 6. Future work (deliberately out of scope here)

- **Maintainer-quota demo button.** A one-click run that uses the maintainer's key against
  the bundled sample only, with IP-based rate limiting. Lets a visitor see a real run without
  needing their own key. Requires server-side rate limiting (Redis or Upstash) and a sample-only
  guard rail. Roughly half a day to add cleanly.
- **Warm worker pool on Render.** Custom Render setup that keeps a sandbox process pre-warmed,
  eliminating the 10–20s cold start. Worth doing only after we know the use case.
- **Audit log.** Per-run anonymized metrics (tokens used, wall time, model) for cost transparency.
  Either push to a logging sink (Logflare, Axiom) or write to a Vercel KV store.
