# ACCL Once-Used Identity, Closed Account, and Verified Recovery Doctrine

## 1. Core Principle

ACCL treats account identity as permanent once created.

An email address or username that enters the ACCL system becomes part of ACCL’s historical identity record. Closing, deleting, disabling, banning, or abandoning an account does not make that email or username available for a fresh new account.

Core rule:

**Same email or same username = same historical identity, not a clean restart.**

ACCL must not allow users to erase account history, rating history, tournament history, payout history, scholarship history, moderation history, or dispute history by closing an account and creating a new one with the same email or username.

---

## 2. Once-Used Email Rule

When an email address is used to create an ACCL account, that email becomes a once-used ACCL identity.

If the account is later closed, deleted, disabled, banned, or removed from active use:

- the account is marked as closed, deleted, disabled, banned, or otherwise inactive
- the email is stored in a protected once-used identity registry
- the email may not be used again for normal signup
- the email may not create a fresh blank account
- the email remains tied to the original historical account identity
- signup must check the once-used registry before account creation is allowed

There is no automatic reuse period.

There is no 30-day reset.

There is no fresh start with the same email.

Closing an account is final for normal signup purposes.

### User-Facing Signup Block Message

> This email was previously used for an ACCL account and can no longer be used to create a new account. Please use a different email address.

Optional recovery version:

> This email was previously used for an ACCL account and cannot create a new account. If this was your account, you may request verified account recovery using this same email.

---

## 3. Once-Used Username Rule

Usernames are also permanent once used.

Once a username enters the ACCL system:

- it cannot be reused by another account
- it cannot be reclaimed through normal signup
- it cannot be recycled after deletion
- it cannot be reused after closure, disablement, ban, inactivity, or abandonment
- it remains attached to the historical account identity for audit, tournament, rating, chat, moderation, and dispute continuity

A closed account does not release its username.

A banned account does not release its username.

A deleted account does not release its username.

### User-Facing Username Block Message

> This username has already been used in ACCL and is no longer available. Please choose a different username.

---

## 4. Why This Rule Exists

This rule exists to prevent:

- account reset loopholes
- rating resets
- tournament identity confusion
- payout disputes
- prize disputes
- scholarship disputes
- fake “missing account” claims
- screenshot manipulation
- ban evasion
- moderation history evasion
- duplicate identity abuse
- username impersonation
- username recycling confusion
- chargeback confusion
- legal/dispute record confusion
- old account/new account identity conflicts

ACCL must preserve identity continuity because ACCL may involve ratings, rankings, tournaments, prizes, payouts, scholarships, K-12 guardian records, moderation records, and long-term audit history.

---

## 5. Account Closure Does Not Mean Full Historical Erasure

When a user closes an ACCL account, ACCL may remove, hide, deactivate, or anonymize public-facing profile information where appropriate.

However, account closure does not erase ACCL’s need to preserve limited records for:

- tournament integrity
- rating integrity
- payout verification
- prize verification
- scholarship records
- K-12 guardian/student program records
- anti-fraud review
- chargeback defense
- ban/moderation history
- legal compliance
- dispute resolution
- audit continuity
- platform security

Closed account records should be retained only as much as necessary for ACCL’s legitimate operational, legal, financial, security, and integrity needs.

Privacy/legal deletion requests must be handled separately from account reactivation or membership recovery.

---

## 6. Signup Verification Requirement

Before creating any new ACCL account, the signup flow must verify against:

1. active users
2. closed accounts
3. deleted accounts
4. disabled accounts
5. banned accounts
6. once-used email registry
7. once-used username registry
8. payout hold records
9. scholarship hold records
10. legal hold records
11. moderation hold records
12. tournament integrity hold records

If the email or username exists in any once-used or restricted identity record, normal signup must be blocked.

The user must either:

- choose a different email and username, or
- request verified recovery of the original account identity if eligible

---

## 7. Verified Recovery Exception

ACCL may allow a closed account identity to be recovered only through a controlled support process.

This is an exception, not the default.

Verified recovery is:

- not automatic
- not guaranteed
- not self-serve
- not a clean reset
- not a new blank account
- not a loophole around bans, fraud flags, payout disputes, scholarship disputes, or legal holds

Verified recovery means ACCL may restore controlled access to the original historical identity, subject to proof, support approval, and membership requirements.

---

## 8. Original Email Recovery Requirement

A closed ACCL account identity may only be recovered through the original email address that was attached to that account.

If a person requests recovery:

- ACCL must send the recovery notice, verification link, or verification code to the original account email
- the user must prove they still control that original email
- a different email may not be used to reclaim the old account identity
- screenshots, receipts, confirmation numbers, and payment records may support the claim, but they do not replace control of the original email
- if the person no longer has access to the original email, standard recovery is denied

### Hard Rule

**No original email access = no standard recovery.**

A new email cannot be used to reclaim an old ACCL account identity.

This prevents someone from using screenshots, copied records, partial payment details, old images, or secondhand information to claim an account they do not control.

---

## 9. Recovery Proof Requirements

To qualify for verified recovery, the person must prove they owned the original account.

Acceptable proof may include:

- successful verification through the original email
- forwarded ACCL confirmation emails
- original signup confirmation numbers
- original payment confirmation numbers
- screenshots of the old account
- matching username history
- matching tournament history
- matching prize or payout records
- matching scholarship records, if applicable
- matching billing records, if applicable
- matching support records
- matching internal account details ACCL can cross-reference

The original email verification is the main gate.

Additional proof supports the claim but does not replace original email control.

---

## 10. ACCL Internal Cross-Reference

Before approving recovery, ACCL support must compare the claim against internal records.

Support may review:

- original user ID
- original email hash
- original username
- prior account status
- closure reason
- closure date
- payment history
- subscription history
- tournament history
- rating history
- prize history
- scholarship history
- moderation history
- ban history
- legal hold status
- payout hold status
- K-12 guardian/student records, if applicable
- previous recovery attempts
- device/session/security signals where available

Support should record the recovery decision in an internal audit log.

---

## 11. Membership Requirement for Recovery

If ACCL approves verified account recovery, the user must activate an ACCL membership/subscription on the spot.

The recovery membership is required because the user is asking ACCL to restore a closed historical identity instead of using a new email and new username.

Membership rule:

- recovery requires an active ACCL membership
- membership is sold one year at a time
- the recovery membership does not erase old account history
- the recovery membership does not erase ratings
- the recovery membership does not erase tournaments
- the recovery membership does not erase payouts
- the recovery membership does not erase scholarship records
- the recovery membership does not erase moderation history
- the recovery membership does not erase audit records

This is not a history reset.

This is controlled restoration of the original identity.

---

## 12. Second and Final Strike Rule

Using verified recovery counts as the second and final strike for that email and username identity.

If the recovered account is later closed, deleted, disabled, abandoned, or removed again:

- the email becomes permanently unrecoverable
- the username remains permanently unrecoverable
- no further normal support recovery is available
- no self-serve recovery is available
- no new account may be created with that email
- no new account may be created with that username

After verified recovery has been used once, the next closure is final forever for that email and username.

---

## 13. Accounts Not Eligible for Standard Recovery

ACCL may deny verified recovery if the account has unresolved or serious issues involving:

- fraud
- ban evasion
- chargebacks
- unpaid balances
- payout disputes
- prize disputes
- scholarship disputes
- K-12 guardian/student disputes
- legal holds
- moderation holds
- tournament integrity violations
- identity conflicts
- harassment or safety violations
- account compromise concerns
- suspicious recovery attempts

Paid recovery is not a loophole around bans, fraud flags, legal holds, unpaid balances, or unresolved disputes.

ACCL may require manual/legal review for these cases.

---

## 14. Account Statuses

ACCL should support clear account identity statuses, such as:

- active
- closure_requested
- closed
- deleted_public_profile
- disabled
- banned
- closed_reserved
- permanently_reserved
- recovery_requested
- recovery_verified
- recovery_denied
- recovery_used
- final_strike
- payout_hold
- scholarship_hold
- legal_hold
- moderation_hold
- tournament_integrity_hold

These statuses should control whether the account can log in, recover, participate, receive payouts, access scholarships, or create new accounts.

---

## 15. Database / Registry Requirement

ACCL should maintain a protected identity reservation system.

Suggested table:

`account_identity_reservations`

Suggested fields:

- id
- original_user_id
- normalized_email_hash
- normalized_username
- reservation_type: email | username | both
- reservation_reason: closed | deleted | disabled | banned | payout_hold | scholarship_hold | legal_hold | moderation_hold | tournament_integrity_hold
- account_status
- recovery_eligible: true | false
- recovery_requested_at
- recovery_verified_at
- recovery_used: true | false
- recovery_used_at
- final_strike: true | false
- membership_required: true | false
- membership_term: annual
- original_email_required: true
- original_email_verified: true | false
- permanently_reserved: true
- created_at
- closed_at
- updated_at
- notes_internal

Email should be normalized before hashing.

Usernames should be normalized before reservation checks.

Raw personal data should be minimized where possible, while preserving the records ACCL needs for account integrity, legal, financial, anti-abuse, tournament, scholarship, and audit purposes.

---

## 16. Signup Flow

Signup flow must work like this:

1. User enters email and username.
2. System normalizes email and username.
3. System checks active accounts.
4. System checks once-used email records.
5. System checks once-used username records.
6. System checks closed/deleted/disabled/banned identity records.
7. System checks restricted hold records where applicable.
8. If no conflict exists, signup may continue.
9. If email is once-used, signup is blocked.
10. If username is once-used, signup is blocked.
11. If the email belongs to a closed account, the user may be shown the verified recovery option.
12. Recovery may only proceed through the original email.

Normal signup must never bypass the once-used identity registry.

---

## 17. Recovery Flow

Verified recovery flow must work like this:

1. User attempts signup with a once-used email.
2. System detects the email in the closed-account / once-used registry.
3. Signup is blocked.
4. User is shown a recovery option if the account is recovery-eligible.
5. ACCL sends a verification notice only to the original account email.
6. User must verify through that original email.
7. ACCL may request additional proof.
8. ACCL support cross-references internal records.
9. ACCL approves or denies recovery.
10. If approved, the user must activate a one-year ACCL membership.
11. Account identity is restored under recovery status.
12. Recovery is logged.
13. Recovery_used is marked true.
14. Final_strike is marked true.
15. If the account is closed again, the email and username become permanently unrecoverable.

---

## 18. Public Profile Handling After Closure

When an account is closed, ACCL may remove or hide public-facing profile details.

Depending on platform needs, ACCL may display closed historical records as:

- Closed Account
- Former Player
- Account Closed
- Deleted User
- Reserved Identity

However, ACCL should preserve the internal link between:

- original user ID
- rating history
- tournament history
- finished games
- payout records
- scholarship records
- moderation records
- audit records

Public display can be minimized.

Internal continuity must remain intact.

---

## 19. Tournament, Rating, and Game History

Closing an account does not erase completed games, tournament records, rating history, standings history, or payout-relevant results.

Finished games and tournament records remain part of ACCL’s historical record.

If public display is adjusted, the account may appear as:

- Closed Account
- Former Player
- Reserved Identity

But the underlying record must remain auditable.

---

## 20. K-12 and Scholarship Records

If the closed account is tied to K-12 participation, guardian records, student records, scholarship balances, scholarship claims, or education-fund eligibility, ACCL must preserve the records necessary to administer and audit those obligations.

A closed student or guardian account does not erase scholarship history.

A closed account does not release ACCL from preserving education-fund rules, claim deadlines, guardian custody records, or redistribution rules.

K-12 and scholarship-related accounts may be placed under:

- scholarship_hold
- guardian_review
- legal_hold
- recovery_review

Recovery for K-12-related accounts may require stricter verification.

---

## 21. Legal / Privacy Separation

Account closure, verified recovery, paid membership, and privacy/legal deletion requests are separate processes.

A user may request account closure.

A user may request verified recovery.

A user may make privacy or legal requests.

These should not be treated as the same workflow.

ACCL may preserve limited records where needed for legal compliance, financial records, dispute defense, fraud prevention, tournament integrity, scholarship administration, platform security, or audit continuity.

Legal/privacy language should be reviewed by a qualified attorney before public launch.

---

## 22. Admin / Support Rules

Support must not manually create a fresh new account using a once-used email or once-used username.

Support must not move a closed username to a new account unless this is part of an approved verified recovery of the original identity.

Support must not approve recovery through a different email.

Support must not treat screenshots alone as ownership proof.

Support must not allow paid recovery to bypass fraud, ban, legal, scholarship, payout, or tournament-integrity holds.

Every recovery decision must be logged.

---

## 23. Final User-Facing Account Closure Warning

Before a user closes an account, ACCL should clearly warn:

> Closing your ACCL account is final for this email and username.  
> Your email and username cannot be used to create a new ACCL account later.  
> ACCL may retain limited records needed for tournament integrity, rating history, payouts, scholarships, moderation, fraud prevention, legal compliance, and audit purposes.  
> If you later request recovery, it must be verified through this original email address and may require an annual ACCL membership.  
> If recovered and closed again, the account identity becomes permanently unrecoverable.

Require the user to confirm before closure.

Suggested confirmation checkbox:

> I understand that closing my ACCL account permanently reserves my email and username and prevents me from creating a new account with them.

---

## 24. Hard Rules Summary

- One email equals one ACCL identity.
- One username equals one ACCL identity.
- Closing an account does not release the email.
- Closing an account does not release the username.
- Deleted accounts do not allow fresh signup with the same email.
- Deleted accounts do not allow username reuse.
- Normal signup must check the once-used identity registry.
- Recovery may only happen through the original email.
- Screenshots alone are not enough for recovery.
- Recovery requires internal verification.
- Approved recovery requires a one-year ACCL membership.
- Recovery counts as the second and final strike.
- If recovered and closed again, the email and username are permanently unrecoverable.
- Paid recovery cannot bypass bans, fraud, legal holds, payout holds, scholarship holds, or tournament-integrity holds.
- Privacy/legal requests must be handled separately from paid account recovery.
- ACCL must preserve enough historical identity data to protect tournament integrity, payouts, scholarships, ratings, moderation, disputes, and audit continuity.

## Final Doctrine Statement

Closing or deleting an ACCL account does not create the right to restart clean with the same email or username.

The email and username become once-used ACCL identities.

They are blocked from normal signup forever.

The only possible exception is verified recovery of the original account identity through the original email address, with proof, support approval, internal cross-reference, and a one-year ACCL membership.

Once verified recovery is used, the next closure is final forever.
