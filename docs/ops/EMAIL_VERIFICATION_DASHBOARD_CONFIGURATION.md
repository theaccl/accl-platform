# Email verification — Supabase Dashboard configuration (pending)

**Status:** Repository implementation complete. **Do not enable Confirm Email in Supabase until local tests pass and this checklist is executed in a controlled order.**

**Player experience (locked):** Signup → check email → confirmation link → `/auth/confirm` verifies token → session cleared → `/login?confirmation=complete` → player manually signs in. **No confirmation link may leave the player authenticated.**

---

## Prerequisites (repository)

- Branch/worktree: `stage1/email-verification-player-flow`
- ACCL confirmation route: `GET /auth/confirm`
- Login success query: `/login?confirmation=complete` → message: **Email verified. Sign in to continue.**
- `NEXT_PUBLIC_SITE_URL` in production must match the canonical origin below.

---

## 1. Site URL and redirect URLs

### Production (`play.theaccl.com`)

| Setting | Value |
|---------|--------|
| **Site URL** | `https://play.theaccl.com` |
| **Redirect URL (allow list)** | `https://play.theaccl.com/auth/confirm` |

Remove or avoid adding wildcard preview URLs. Production confirmation links must not target Vercel preview hosts.

### Local development

| Setting | Value |
|---------|--------|
| **Site URL** (local project / `.env.local`) | `http://localhost:3000` (or `http://127.0.0.1:3000` if that is your dev host) |
| **Redirect URL (allow list)** | `http://localhost:3000/auth/confirm` |
| | `http://127.0.0.1:3000/auth/confirm` |
| | `http://localhost:3001/auth/confirm` (optional second port) |
| | `http://127.0.0.1:3001/auth/confirm` (optional second port) |

Repository env: set `NEXT_PUBLIC_SITE_URL` to the same origin you use locally so `emailRedirectTo` matches the allow list.

---

## 2. Confirm signup email template

**Location:** Supabase Dashboard → Authentication → Email Templates → **Confirm signup**

### Subject

```
Confirm your ACCL account
```

### Body (HTML)

Use TokenHash so the link hits the ACCL-owned confirmation endpoint (not Supabase-hosted redirect with session):

```html
<h2>Confirm your ACCL account</h2>
<p>Thanks for signing up. Confirm your email address to activate your account.</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Confirm email address</a></p>
<p>If you did not create an ACCL account, you can ignore this email.</p>
<p>This link expires. If it stops working, return to ACCL and request a new confirmation email.</p>
```

### Body (plain text fallback)

```
Confirm your ACCL account

Thanks for signing up. Confirm your email address to activate your account.

Open this link in your browser:
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email

If you did not create an ACCL account, ignore this email.
If the link expires, request a new confirmation email from the ACCL signup page.
```

**Do not** use `{{ .ConfirmationURL }}` alone — that default flow can establish a session before ACCL clears it. The custom link above is required for the manual sign-in return experience.

**Do not** append `next=` or other post-auth redirect parameters to the confirmation link.

---

## 3. Confirm Email toggle

| Step | Action |
|------|--------|
| Before go-live | **Confirm Email = OFF** while validating repository changes and unit tests |
| After tests pass locally | Enable **Confirm Email** only in the target Supabase project (staging first if available) |
| After staging validation | Enable in production during a controlled window |

When Confirm Email is OFF, signup may return an immediate session (legacy). Repository code preserves that path for compatibility; when ON, signup returns no session and shows the check-email state.

---

## 4. Resend / SMTP

- Resend (or other SMTP) configuration is **unchanged** by this work.
- Do not modify Resend API keys or DNS from this lane.
- After Confirm Email is ON, use the ACCL login page **Resend confirmation email** control to test resend; it calls `POST /api/auth/resend-confirmation` with the same fixed `emailRedirectTo` (`{origin}/auth/confirm`).

---

## 5. Controlled testing order (after Dashboard config)

Execute in order. Stop if any step fails.

1. **Repository tests (local, Confirm Email still OFF)**
   `npx playwright test tests/unit/emailVerificationPhaseB1.spec.ts tests/unit/emailVerificationManualSignInReturn.spec.ts tests/unit/loginPageAuth.spec.ts --project=unit`

2. **Set Dashboard redirect URLs and email template** (Confirm Email still OFF)
   Verify template preview shows `…/auth/confirm?token_hash=…&type=email`.

3. **Enable Confirm Email** in staging or a disposable Supabase project first.

4. **Signup (no session)**
   - Open `/login?intent=signup`
   - Create account → see verification pending panel
   - Confirm no automatic redirect to Profile/Nexus

5. **Email link**
   - Open confirmation link from inbox
   - Must land on `/login?confirmation=complete`
   - Must **not** be signed in (no authed nav, no redirect to `/profile`)

6. **Manual sign-in**
   - Message: **Email verified. Sign in to continue.**
   - Enter email + password → normal post-auth routing (profile/onboarding)

7. **Failure paths**
   - Reuse same link → safe failed message on login
   - Malformed `/auth/confirm` → `?confirmation=missing`
   - Invalid token → `?confirmation=failed`
   - No raw tokens or Supabase errors exposed in UI

8. **Resend**
   - From verification pending panel, resend → new link follows same manual sign-in return

9. **Production**
   - Repeat steps 4–8 on `https://play.theaccl.com` after production Dashboard updates

---

## 6. Operator checklist (quick reference)

- [ ] Site URL = canonical ACCL origin
- [ ] Redirect allow list includes `{origin}/auth/confirm` only (no open wildcards)
- [ ] Confirm signup template uses TokenHash link to `/auth/confirm?token_hash=…&type=email`
- [ ] Confirm Email OFF until repo tests green
- [ ] Confirm Email ON only after staging manual test passes
- [ ] Post-confirmation: player always returns to login unsigned
- [ ] Post-login: player enters credentials manually

---

## Related code

| Area | Path |
|------|------|
| Confirmation route | `app/auth/confirm/route.ts` |
| Callback handler | `lib/auth/emailConfirmCallback.ts` |
| Redirect origin trust | `lib/emailConfirmationRedirect.ts` |
| Login / signup UI | `app/login/page.tsx` |
| Signup handler | `app/login/authHandlers.ts` |
| Resend API | `app/api/auth/resend-confirmation/route.ts` |
