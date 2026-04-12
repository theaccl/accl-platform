# ACCL Platform

Next.js application for the ACCL chess platform: gameplay, tournaments, Nexus, payments (test mode for controlled launch), and compliance-aware flows. **Business rules for tournaments, ranking, ecosystem isolation, anti-cheat, and payments are implemented in code and migrations — treat `main` as stable; do not land experimental behavior there.**

## Requirements

- Node.js 20+
- npm

## Local development

```bash
npm install
cp .env.example .env.local           # adjust filename if your template differs
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Scripts

| Command | Purpose |
|--------|---------|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run start` | Run production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript |
| `npm run gate:operational-core` | Operational regression gate (needs `.env.local`) |

## Environment variables

**Never commit secrets.** `.env*` is gitignored. **Never put secrets in `NEXT_PUBLIC_*`** — those are exposed to the browser.

### Public (safe for `NEXT_PUBLIC_`)

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |

### Server-only (Vercel → Environment Variables, not exposed to client)

| Variable | Description |
|----------|-------------|
| `SUPABASE_SERVICE_ROLE_KEY` | Service role (API routes / server only) |
| `STRIPE_SECRET_KEY` | **Test mode only:** `sk_test_…` |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret (test dashboard) |
| `ACCL_ANALYSIS_QUEUE_SECRET` | Internal analysis queue auth |
| `ACCL_INTERNAL_PAYMENTS_SECRET` | Internal payout/refund route auth |
| `SUPABASE_ACCESS_TOKEN` | Optional: **Supabase CLI** (`supabase link`, migrations) — not required at runtime |

Additional optional keys (bots, Stripe Connect, etc.) are documented in code and `AGENTS.md`.

### Stripe (controlled launch)

- Use **Stripe test mode** only: secret keys must start with `sk_test_`.
- If `sk_live_` is set, the app **refuses** to use live Stripe and falls back to the **stub** provider (no real charges).
- Register the webhook URL in the Stripe dashboard: `https://<your-deployment>/api/payments/webhook`.

### Kill switches (Vercel, &lt; 1 minute)

| Variable | Effect |
|----------|--------|
| `ACCL_DISABLE_PAID_ENTRY=1` | `POST /api/payments/create-entry` returns 503 with `paid_entry_disabled` |
| `ACCL_DISABLE_PAYOUT_PROCESSING=1` | Internal payout/refund routes return 503; payout retry worker no-ops |

Removing Stripe keys forces stub payment behavior (after redeploy / cold start).

## GitHub

1. Create a **private** repository on GitHub.
2. `main` should only receive stable, reviewed changes.
3. Push this repo (after `git init` if needed):

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<org>/<repo>.git
git push -u origin main
```

## Vercel deployment

1. Import the GitHub repo in [Vercel](https://vercel.com).
2. Framework preset: **Next.js** (auto-detected).
3. Set **all** environment variables from the tables above (Production + Preview as needed).
4. Enable **automatic deployments** on push to `main`.
5. After deploy, verify:
   - `GET /api/health` → `{ ok: true }`
   - `GET /api/status` → `ready: true`, `control.stripe_mode` is `test` or `stub`, `control.stripe_test_only: true`

Optional: add a custom domain later; the default `*.vercel.app` host is fine for soft launch.

## Supabase (production)

- Link CLI: `supabase link` (uses project ref / `SUPABASE_ACCESS_TOKEN` locally).
- Apply migrations: `supabase db push` or your CI process.
- Confirm RLS remains enabled; server code uses the **service role** only in API routes.

## Soft launch checklist

- [ ] `npm run build` and `npm run gate:operational-core` pass locally before deploy.
- [ ] Vercel env vars set; no `NEXT_PUBLIC_` secrets.
- [ ] Stripe **test** keys and webhook URL for deployed origin.
- [ ] `/api/status` shows `ready: true` and acceptable `stripe_mode`.
- [ ] Smoke: sign up, free game, moves; Nexus (including `?public=1`); spectate where applicable.
- [ ] Invite a **small** trusted group; avoid public advertising until you intentionally go wider.

## Documentation

- `AGENTS.md` — agent / Next.js notes.
- `CLAUDE.md` — points at `AGENTS.md`.

---

**Principle:** ACCL can be live for real users in a **controlled, test-safe** configuration — not full public marketing or live-money production until you explicitly choose it.
