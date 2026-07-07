# Successful Performance v1 — Privilege Hardening (Stage 1 Lane)

Lane: `ACCL_STAGE1_SUCCESSFUL_PERFORMANCE_PRIVILEGE_HARDENING_PATHWAY`
Branch: `stage1/successful-performance-privilege-hardening`
Foundation migration: `20260705120000_successful_performance_read_foundation.sql` (unchanged; production-applied — **no rollback**)
Hardening migration: `20260707160000_successful_performance_helper_privilege_hardening.sql`
Static tests: `tests/unit/successfulPerformancePrivilegeHardeningMigration.spec.ts`

---

## Gate C helper-privilege mismatch (production finding — context only)

Gate C post-apply verification confirmed the main RPC privilege contract remains correct:

| Role | `get_own_successful_performance()` EXECUTE |
|------|------------------------------------------|
| PUBLIC | denied |
| anon | denied |
| authenticated | granted |

The three internal helpers incorrectly retained explicit EXECUTE for anon and authenticated after the foundation migration revoked only PUBLIC:

1. `public.successful_performance_strict_control(text, text)`
2. `public.successful_performance_mode_from_control(text)`
3. `public.successful_performance_player_outcome(text, uuid, uuid, uuid)`

This follow-up migration removes direct client EXECUTE on those helpers only. It does **not** change helper function bodies, data tables, or main RPC grants.

**Foundation migration `20260705120000` must not be rolled back.** Ledger reconciliation for the hardening migration remains a separate step.

---

## Hardening migration scope

| In scope | Out of scope |
|----------|--------------|
| `REVOKE EXECUTE` on three helpers from `public`, `anon`, `authenticated` | Modify `20260705120000_successful_performance_read_foundation.sql` |
| Explicit `begin;` / `commit;` transaction wrapper | Change helper function bodies |
| | Alter `get_own_successful_performance()` privileges |
| | Data-table DDL/DML |
| | Production apply, remote push, or ledger repair |

Helpers remain invokable internally by the SECURITY DEFINER main RPC owner.

---

## Expected post-apply privilege matrix

After hardening migration `20260707160000` is applied:

| Function | PUBLIC | anon | authenticated |
|----------|-------:|-----:|----------------:|
| `get_own_successful_performance()` | false | false | true |
| `successful_performance_strict_control(text,text)` | false | false | false |
| `successful_performance_mode_from_control(text)` | false | false | false |
| `successful_performance_player_outcome(text,uuid,uuid,uuid)` | false | false | false |

---

## Post-merge production authorization (pending)

| Item | Status |
|------|--------|
| Authenticated owner-scoped RPC smoke test | **Pending** — not run in this lane |
| Separate production named-file authorization | **Required after merge** before apply |
| Gate C evidence reference | ZIP SHA-256 `091be1adf7b42f67b17f92c145bdeb0b72421216f86bcbc77c45516829bcc42c` |

---

## Rollback record (privilege restore only)

If reversal is explicitly authorized on a target where this migration was applied:

```sql
begin;

grant execute on function public.successful_performance_strict_control(text, text) to anon, authenticated;
grant execute on function public.successful_performance_mode_from_control(text) to anon, authenticated;
grant execute on function public.successful_performance_player_outcome(text, uuid, uuid, uuid) to anon, authenticated;

commit;
```

Rollback restores the pre-hardening helper EXECUTE posture only. It does not drop functions, indexes, alter the main RPC, or roll back `20260705120000`.

---

## Locked baseline artifacts (must remain unchanged)

| Artifact | SHA-256 |
|----------|---------|
| `20260705120000_successful_performance_read_foundation.sql` | `67975aefc5f3db0968a022729c68212d8e3e9025efc4fc61bc7069ea5e00e0af` |
| `tests/unit/successfulPerformanceReadMigration.spec.ts` | unchanged from baseline commit |
| `docs/phase-locks/SUCCESSFUL_PERFORMANCE_V1_BACKEND_READINESS.md` | unchanged from baseline commit |

---

## Local verification status

| Item | Status |
|------|--------|
| Preflight branch / HEAD / clean tree | Verified at baseline `f4a9bb6c6861e738d85ff32b61e9c62faf7969ad` |
| Foundation migration hash lock | Match (`67975aefc5f3db0968a022729c68212d8e3e9025efc4fc61bc7069ea5e00e0af`) |
| Hardening migration created | `20260707160000_successful_performance_helper_privilege_hardening.sql` |
| Hardening migration SHA-256 | `8ac177ec1a45a37655512076dfcb49094ee80b2c033cb9b85c5e60f5fe3ee54e` |
| Static hardening tests | **Pass** (14/14) |
| Prior SP static tests (42) | **Pass** (42/42) |
| Combined SP static suite | **Pass** (56/56) |
| Production contact | **Forbidden** |

---

## Pre-commit checklist

| Item | Status |
|------|--------|
| Hardening migration approved as written | Yes |
| Foundation migration untouched | Yes |
| Main RPC privileges untouched in new migration | Yes |
| Static hardening migration tests | **Pass** (14/14) |
| Prior SP static tests (42) still pass | **Pass** (42/42) |
| Commit / push / PR | **Blocked** — not authorized in this lane step |
