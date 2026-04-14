# ACCL tester invite — launch-day checklist

Short operational pass before sending invites. Adjust URLs for your deployment host.

## Environment & deploy

- [ ] Production health endpoint responds (`/api/health` or equivalent).
- [ ] Latest migrations applied (including `profiles.accl_tester` and chat/tester tables).
- [ ] Current app revision is live (verify build SHA or deploy timestamp).

## Auth & identity

- [ ] Post-login default route (`/tester/welcome`) loads for a known test account.
- [ ] Username onboarding is not looping; middleware username gate returns expected redirects.
- [ ] One known tester can complete login → lands on welcome (or intended `next`).

## Tester surfaces

- [ ] `/tester/welcome` — copy and links (NEXUS, Free, Lobby chat, Messages, Report issue).
- [ ] `/tester/lobby-chat` — messages load for authenticated user.
- [ ] `/tester/messages` — DM UI reachable.
- [ ] Bug report submission succeeds (`POST /api/tester/bug-report`) and appears in DB/logs.

## Core product smoke

- [ ] `/nexus` — requires sign-in; loads hub for authed user with username.
- [ ] `/free` — guest or authed can open free play as designed.
- [ ] One spectator-safe or public game path works (spectate link, no leaked player controls).

## Cohort hygiene (operator)

- [ ] Run `GET /api/operator/tester-readiness` (moderator token) — all invited testers show `cohort_ready: true`, or fix rows in `profiles`.
- [ ] No email displayed as public identity on welcome/NEXUS/profile (spot-check).

## Rollback mindset

- [ ] Support contact path for testers documented (e.g. Lobby chat + Report issue).
- [ ] If chat or auth degrades, communicate pause before mass invite.
