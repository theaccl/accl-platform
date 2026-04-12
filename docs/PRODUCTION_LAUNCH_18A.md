# Phase 18A — Production launch blueprint

This document describes how ACCL is prepared for real users: environments, security, observability, health checks, light rate limits, and rollout. It does **not** change product scope or architecture.

## 1. Environments

| Environment   | Purpose                                      |
|---------------|----------------------------------------------|
| **development** | Local `.env.local`, `next dev`             |
| **staging**     | Recommended mirror of prod secrets + data policy |
| **production**  | Live users — strict secrets, audit logs on |

Separate Supabase projects (or strict RLS + branches) per environment are recommended so staging never points at production data.

## 2. Environment variables

See **`.env.example`** in the repo root for the canonical list.

**Client-safe (may be embedded in the browser bundle):**

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — anon key only

**Server-only (never `NEXT_PUBLIC_*`):**

- `SUPABASE_SERVICE_ROLE_KEY` — used only in server modules such as `lib/supabaseServiceRoleClient.ts`
- `ACCL_ANALYSIS_QUEUE_SECRET` — internal workers (`x-accl-analysis-queue-secret`)
- `ACCL_MODERATOR_USER_IDS`, `ACCL_ENABLE_MODERATOR_ID_FALLBACK`
- `BOT_USER_ID_*` (optional overrides)

**Verification:** `grep` the codebase for `NEXT_PUBLIC_` — only public keys and URLs should use that prefix. Service role must not appear in `components/` or client bundles.

**Optional:** `ACCL_API_AUDIT_LOG=1` enables structured `[accl-api]` JSON lines on stdout in non-production (e.g. staging) without relying on `NODE_ENV=production`.

## 3. Build and deployment

- **Build:** `npm run build` must pass.
- **Core gate:** `npm run gate:operational-core` must pass before release.
- **Runtime:** `npm start` (Node) or the platform’s equivalent (e.g. Vercel) with all server env vars set.

Inject secrets via the host’s env UI, not committed files.

### Routing smoke checks (after deploy)

- `/nexus` — Nexus shell loads
- `/game/[id]` — game page
- `/free/*`, `/tournaments/*` — no 404 on primary entry routes
- `/api/health` — `200` JSON `{ ok: true }`
- `/api/status` — JSON with `ready` and boolean `checks` (no secret values)

## 4. Database and data safety (Supabase)

- **RLS:** Must remain enabled; policies must enforce `ecosystem_scope` (and related rules) so adult and K–12 data do not cross.
- **Review:** Periodically audit policies vs. application expectations; no cross-ecosystem reads on user-facing paths.
- **Backups:** Enable Supabase automated backups; confirm retention for your compliance needs.

Application code does not replace RLS; server routes use the service role only where intentionally bypassing RLS for trusted operations.

## 5. Observability

### Structured API logs (server)

When `NODE_ENV=production` or `ACCL_API_AUDIT_LOG=1`, routes emit **single-line JSON** on stdout prefixed with `[accl-api]`:

| Event                    | Route / area                    |
|--------------------------|---------------------------------|
| `nexus_overview`         | `GET /api/nexus/overview`       |
| `submit_move`            | `POST /api/game/submit-move`    |
| `bot_game_start`         | `POST /api/bot/game/start`      |
| `tournament_register`    | `POST /api/tournaments/register`|
| `internal_nexus_generate`| `POST /api/internal/nexus/generate` |

**Never logged:** bearer tokens, full JWTs, service role keys, or raw moderation payloads. User and game IDs are shortened (`shortId`) in log fields.

### Error tracking (optional)

Sentry (or similar) is **not** bundled in this repo. To add it: install `@sentry/nextjs`, set `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` in the host, and follow the vendor’s Next.js App Router guide. Keep PII scrubbing on.

### Client errors

Nexus and other surfaces use graceful degradation (e.g. cached overview, error banners) per earlier phases; production should still be monitored via host logs + optional Sentry.

## 6. Health and status

| Endpoint        | Role |
|-----------------|------|
| `GET /api/health` | Liveness — no DB; always `200` when the app process responds. |
| `GET /api/status` | Readiness signal — env presence flags only; **no** secret values; HTTP `200` with `ready: boolean`. |

Use `/api/health` for dumb probes; use `/api/status` for dashboards (parse JSON).

## 7. Security review checklist

- [ ] No service role or queue secrets in client code or `NEXT_PUBLIC_*`.
- [ ] `submit-move` requires auth and participant check (unchanged).
- [ ] Moderator and internal routes use existing secret / allowlist patterns.
- [ ] `POST /api/internal/nexus/generate` requires `x-accl-analysis-queue-secret`.

## 8. Light rate limiting (in-process)

Per-instance fixed-window limits (for distributed limits, add Redis/KV later):

| Key prefix              | Limit (per window) | Window |
|-------------------------|--------------------|--------|
| `nexus-overview:<ip>`   | 400                | 1 min  |
| `submit-move:<userId>`  | 120                | 1 min  |
| `bot-game-start:<userId>` | 30              | 1 min  |
| `tournament-register:<userId>` | 40         | 1 min  |

HTTP **429** includes `Retry-After` when limited.

## 9. First-user and K–12 readiness

- **Guest:** Nexus viewable where designed; free play entry points work.
- **Signed-in:** Games, PersonalHook, progression surfaces behave as in staging.
- **Tournaments:** Registration and economic copy match environment (adult vs K–12 masking).
- **K–12:** No cash surfaces; audit logs must not include child-identifiable content beyond shortened technical ids.

## 10. Rollout strategy

**Recommended:** Soft launch — limited users, watch `[accl-api]` logs and latency on `/api/nexus/overview` and `/api/game/submit-move`.

**Staged:** Enable Nexus traffic first, then tournament registration volume, then economic CTAs — controlled by product/feature toggles in the host if you add them later (not required by 18A).

## 11. Signoff commands

```bash
npm run build
npm run gate:operational-core
```

Production verification: deploy succeeds; open `/nexus` and confirm load; curl `/api/health` returns `ok`.

---

**Principle:** ACCL is built; Phase 18A makes it **live-ready** — observable, bounded, and safe to roll out.
