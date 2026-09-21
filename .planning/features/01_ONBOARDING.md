# 01_ONBOARDING.md — Landing & First Run (Anonymous Session)

> **Spec ID:** F-001 · **Priority:** P0 · **Status:** draft
> **Depends on:** — (foundational); feeds F-002 Story Discovery and every creation feature
> **Owner spec guide:** ../features/_SPEC_GUIDE.md

## Summary

Landing and first-run with **no account wall**: visitors experience real value (story concepts, previews) before being asked for anything. Creation is tied to an anonymous session — an `anonymous_project_id` plus a secure browser token — carried through the whole journey; an account/email is requested only when persistence or an order needs it, with a claim-project-later flow. Mobile-first per D012.

## 1. Goal

spec §20 (ideal journey) is explicit: "No account wall before the user experiences the product. Allow anonymous creation initially. Ask for email/account only when needed to save, resume or order." Competitors push forms before the emotional hook; we pair the category's "wow moment before checkout" imperative (spec §8) with a friction-free first run. The goal is a first-run that converts exploring visitors into a moment of wonder (a recognised child in a real story) while preserving everything they make even if they never register.

## 2. User value

A gift buyer who lands after midnight shouldn't need a password to feel the magic of their child in a story. Removing the early wall raises completion (fewer abandonment points). The claim-later promise means no work is lost: the parent who returns at the weekend finds their project waiting. This is the difference between "sign up to a studio" and "a studio that knows my child" (spec §19).

## 3. Current implementation

```text
None (Observed). No application code exists. See ../codebase/README.md and RESEARCH_LOG.md.
Nothing to KEEP/MODIFY/REPLACE; this system is greenfield (ADD/BUILD per D013).
```

## 4. Problems with current implementation

Not applicable (greenfield). Design risks: tying an `anonymous_project_id` to a cookie that the platform clears (silent loss — violates D010 persistence); asking for an account at the moment the user is most emotionally invested but least willing to type; storing tokens insecurely on the client; treating "anonymous" as "unrecoverable" instead of recoverable via email claim (claim = durable recovery, spec §20).

## 5. Desired UX

Walkthrough: a parent lands from a paid ad on their phone. Page is value-first — "Make your child the star of their own book" + a photo-prompting visual; CTA "Start a story". Tap → an anonymous session is created silently (no form). Journey proceeds: choose an occasion/theme (F-002) → who is it for (F-003) → photo (F-004) → a few details (F-006) → three story concepts (F-007) → preview (F-011) → corrections (F-012/13). Nowhere so far has asked for identity. The first account touchpoint appears precisely when value must be protected: at save/resume across devices, at "Approve & Print", or at checkout (F-018). The card says "Save your story with an email — or start over anytime". If the parent declines, everything continues in the anonymous session; if they claim later (from any later screen or the "Where's my book?" email), the project merges under their account. Returning users with a browser token resume instantly; people who lost the token recover via email-magic-link claim.

## 6. UI specification

Landing: hero + CTA, mobile-first single-column, one primary CTA per viewport; social proof strip (privacy bullet — "photos are never sold", spec §18) as trust signal, not a wall. Anonymous banner is invisible-by-default; a subtle "Saved on this device" chip appears once a project exists. The account request is a single inline card, not a full-screen gate; dismissible; "Not now, keep making" secondary. Claim flow: email field + magic link (no password on mobile), 2–3 taps. All copy is product-voice (D002, warm/calm) — never "session", "token", "claim account" jargon.

## 7. Domain model

```text
AnonymousSession { anonymous_project_id, browserTokenHash, created,
  lastSeen, projects[], claimedByCustomerId? , claimedAt }
Project { projectId, sessionOwner (anonymous_project_id | customerId),
  childProfiles[], books[], latestActivityAt }        // existing creation graph
```

`anonymous_project_id` is the durable owner key; the **browser token is only a carrier** (guid: randomly generated, stored HttpOnly + SameSite, hashed at rest), so losing the token is recoverable via email claim (rekey: merge projects under a customer id, optionally re-issue token). Retention: anonymous data follows the profile retention rules (F-025); expired anonymous sessions are purged per the documented schedule after the claim grace period. **Decision needed:** grace period length for reclaiming unclaimed anonymous projects, and whether cross-device claim email is magic-link-only vs one-time-code.

## 8. Backend/API requirements

`POST /sessions/anonymous` → creates `anonymous_project_id` + sets browser token (cryptographically random; hash stored; token never returned in logs). `POST /sessions/claim` — email + magic link → merges anonymous projects under the customer; idempotent (one claim per anonymous id). Scope checks: every project-scoped API validates `session.projectAllowed(projectId)`; claiming revokes anonymous-only tokens. No PII in session-creation payloads; emails the claimed user a "your story is saved" confirmation with a link. Cookie policy surfaced at first touch (privacy notice, spec §18 / guide §7: this is a persistent token, so the first-run shows a short consent note with a "learn more" link to the full privacy page).

## 9. Background jobs

`AnonymousSessionSweeper` — expires/purges anonymous sessions past grace period (records deleted per F-025, with projects carriable only if claimed); `ClaimMergeJob` — merge project ownership, rekey sessions, invalidate old tokens, notify. Both idempotent and resumable (D010).

## 10. AI behaviour

None. The anonymous session is plumbing for F-002–F-018; no model decision here.

## 11. QA

Token issuance returns anonymous id usable for project APIs; token never observable in URLs/logs/analytics; claim of one project id cannot hijack another (authz negative tests); merge keeps revisions consistent (no revision pointer changes); expiry purges exactly the mandated records; magic link expires; session survives refresh and reconnect (D010).

## 12. Privacy/security

Anonymous session is not "tracking-for-ads": we store the minimum (project ownership, lastSeen) to fulfil our promise of not losing work (spec §20). Browser token is bearer — server-side hashed, HttpOnly, SameSite, short-lived renewal; secure transport only. Child data remains protected under the anonymous session exactly as under an account (guide §7: same storage/retention/delete-now guarantees; F-025). Consent note covers the cookie/token; no third-party marketing cookies at first run.

## 13. Analytics

`session_started`, `project_created`, `claim_completed` — no child PII, no token, no email hash beyond the claim event (retained under login retention). These measure the funnel effects of the no-wall decision.

## 14. Acceptance criteria

1. Given a brand-new visitor on mobile → zero identity inputs before the first story concept is shown (spec §20 no-account-wall honoured); creating a project requires no account.
2. Given the parent closes the tab and returns on the same device → the project resumes with all state intact (D010).
3. Given the parent changes device or loses the token → email-magic-link claim recovers and merges the project with no generation loss.
4. Given a project is claimed → the old anonymous token stops working and all subsequent operations are scoped to the account.
5. Given the anonymous session expires unclaimed → records are purged per F-025 and no child data leaks into long-term storage.

## 15. Dependencies

None upstream; prerequisite for F-002, F-003, F-007, F-008, F-011, F-018 (checkout claim gate). Runs in parallel with F-026/F-027 (which consume its anonymity rules).

## 16. Priority

**P0 — category parity** (spec §26: an account-less creation start is table-stakes parity). Filter (spec §27): directly makes creation easier and protects the personal result from loss. Ship with launch; claims and consent copy land together.