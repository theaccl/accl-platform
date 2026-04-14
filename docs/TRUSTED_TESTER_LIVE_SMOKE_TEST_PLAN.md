# Trusted tester — live smoke test (runbook)

Controlled validation with **2–5** trusted testers before widening the cohort. **No feature work during the window** — stability and friction only.

## 1. Cohort selection

Pick testers who are comfortable on the web, report issues clearly, and are not disruptive.

For each person, before invite:

- [ ] `profiles.accl_tester = true` (after migration applied)
- [ ] Valid username (ACCL rules)
- [ ] `cohort_ready: true` from `GET /api/operator/tester-readiness` (moderator auth)

## 2. Pre-test (operator)

- [ ] Production healthy; latest deploy live; migrations applied
- [ ] `/tester/welcome`, `/nexus` (signed-in), `/free` load
- [ ] Chat send/load smoke; `POST /api/tester/bug-report` succeeds
- [ ] `npm run audit:testers` — all flagged rows `cohort_ready` (or fix profiles before invite)

## 3. Minimal message to testers (do not over-guide)

Send something like:

> You’re in the ACCL test environment. Log in (or sign up), then use the app as you normally would. Try NEXUS, free play, watching a game, lobby chat, DMs, and the bug report if something breaks. Tell us anything confusing, broken, or unclear — no need for perfect steps.

Do **not** attach a long script.

## 4. Flows each tester should hit (natural use)

| Area | What to confirm |
|------|-----------------|
| Auth | Login, logout, login again; redirect feels sane |
| Onboarding | Username claim if needed; no loops |
| Nav | Welcome, NEXUS, free, main nav |
| Game | Open a game; spectate; no leaked controls as spectator |
| Chat | Lobby send/receive; DM; game player vs spectator separation |
| Bug report | At least one successful submit |

## 5. Observability

Watch: browser console, server logs, failed APIs, 429s, auth/username redirects, bug report intake.

Note: confusion (“what do I do?”), surprise redirects, broken links, duplicates, empty states, wrong identity labels.

## 6. Issue classification

- **Critical** — fix now: cannot log in, core routes broken, nav broken, chat down, crashes/blank, permission/security bugs
- **High** — fix soon: confusing flows, wrong labels, missing recovery
- **Low** — defer: feature asks, styling nitpicks

## 7. Fix loop (critical only)

Reproduce → root cause → minimal fix → redeploy → same tester re-checks. No unrelated churn.

## 8. Exit criteria (expand cohort)

All testers can: log in, reach core routes, use chat, play/view games, submit bugs; **no criticals** open; no repeated confusion pattern; behavior consistent.

## 9. Post-test

Address highs; optional UX clarity; plan wider invite (e.g. 10–25).

---

## Results log (fill after the session)

**Date:** _______________

**Testers (count):** ___

**Issues (by severity):** _(paste below)_

**Fixes applied:**

**Remaining risks:**

**Recommendation:** ☐ Expand cohort ☐ Hold / fix first
