# 25_PRIVACY_AND_DELETION.md — Child-Data Privacy, Retention & Deletion Program

> **Spec ID:** F-025 · **Priority:** P0 (core v0) · **Status:** draft
> **Scope note:** the privacy *core* — the deletion cascade/delete-now, retention rules, provider-payload discipline and checkout privacy copy — is launch-critical (P0, M1 core) because the platform stores children's photos from the first session; the *full* program (account revenue hub, per-child retention cards, download-my-books UX) follows in M6. All specific retention numbers below are **PROPOSED — legal/product sign-off required** before they go live (§16).
> **Depends on:** F-003 (Child Profile — per-person consent/retention) · F-004 (Photo Upload) · F-005 (Character Bible — derived likenesses) · F-010 (GenerationJob — cancel on delete). Authoritative for F-021/22/23 deletion.
> **Owner spec guide:** ../features/_SPEC_GUIDE.md

## Summary

The privacy programme the whole product runs on (spec §18). It defines (a) a **data inventory** of every party touching child data along the trace `browser → API → storage → model provider → output → retention/deletion` (spec §22), (b) explicit retention windows, (c) parent/guardian consent, (d) a **delete-now** control whose cascade removes data from storage, the DB, queues, model-provider payloads and derived likenesses (guide §7: derived likenesses are PII), and (e) privacy UX *inside the purchase experience*, not only legal pages. It also sets one non-negotiable: **photos are never used to train public models**.

## 1. Goal

Child photos, names and family data are sensitive product data (guide §7). Competing products already state explicit retention windows (Diffrun: spec §2) — being vague here is a category disadvantage. The goal is a single, enforceable policy: we can say exactly where every byte of a child's data goes, how long it lives, who touches it, and what happens when a parent asks for it to be gone.

## 2. User value

- Trust: a parent checking the checkout page can see a plain-language "what happens to Ava's photos" (spec §18: privacy belongs in the purchase experience).
- Confidence: a delete-now control that actually works gives the parent control over their family's data forever.
- Business: a defensible privacy posture prevents the class of support/reputation failures that hit AI-personalised products (spec §2, §24).

## 3. Current implementation

None (Observed). No application code exists. See ../codebase/README.md and RESEARCH_LOG.md. Greenfield (ADD/BUILD per D013).

Proposed subsystems enforcing this: `BookService`/`BookRepository` (audit + deletion cascade), `CharacterBible` (likeness provenance), `GenerationJob` (cancel-on-delete, retention sweep jobs), provider interfaces `StoryModel`, `IllustrationModel`, `IdentityReferenceModel`, `QualityModel`, `ModerationProvider` (each must declare payload handling), `PrintProvider` (print data).

## 4. Problems with current implementation

Not applicable — greenfield. The design risks are silent retention, scope creep of provider payloads, and a deletion cascade that leaves orphans (a stored photo whose likeness still lives in a book). Every spec ends at F-025 for its data; F-025 must be built such that deleting one artifact provably deletes every artifact derived from it.

## 5. Desired UX

During upload (F-004): "We use Ava's photos to draw Ava — never to train AI models, and never sold. Uploads you don't finish are deleted after a short while — see How we keep Ava's data safe." At checkout (spec §18): a short "Your child's data" panel — who processes it, how long it's kept, and a **Delete everything now** control. On the account page, "Data & privacy": per-child retention state, delete-now per child or for the whole account, plus a download-my-books before-deletion warning. Deleting shows a calm progress state ("We're removing Ava's photos everywhere — this takes a moment"), then a confirmation. Deleting is never hidden behind a legal page.

## 6. UI specification

- Inline privacy copy at upload, preview and checkout: 2–4 warm sentences + "See how we keep Ava's data safe" expander (spec §18).
- **Delete now** button: red-text, distinctive; double-confirm with the child's name typed or re-typed; shows cascade progress (photos → likenesses → books → backups); success screen is reassuring, not technical.
- Account privacy hub: per-child cards with retention status ("Ava's photos: kept while her profile exists"); banner upsell before irreversible actions.
- Mobile: delete flow fully operable one-handed; no dark-pattern wording.

## 7. Domain model

```text
ConsentRecord { profileId, grantedBy(parent/guardian), givenAt, version, languages, purposes}
RetentionRule { dataClass(upload|savedPhoto|likeness|bookContent|queueMsg|providerPayload|backup),
                window, enforcedBy(sweepJob|cascade), notes }
DeletionRecord { deletionId, scope(child|account|artifact), requestedAt, requestedBy,
                 cascadeStatus(per-party), completedAt, evidenceRef }
DataParty { node(browser|api|storage|db|queue|storyModel|illustrationModel|identityModel|
                 qualityModel|moderation|printProvider|email|analytics), 
            payloadHeld(), retention(), deleteApi?(yes|no|documented) }
```

Every `CharacterBible` records its source-photo provenance; every `Book`/`Revision` records the likenesses it embeds, so the cascade can walk the derived graph.

## 8. Backend/API requirements

Commands: `requestDeletion(scope)` (returns deletionId, idempotent), `cancelInFlightRequestsIfAllowed(scope)` (blocked once cascade started), `auditDeletion(deletionId)`. Read: `getDataInventory(profileId)` → per-party current retention/holdings. Enforcement hooks: photo upload registers `DataParty.storage + provider`; generation registers provider payloads; queue messages register retention. Access: delete-now requires the owning parent (re-auth for destructive ops); family members cannot delete each other's profiles.

## 9. Background jobs

- **Retention sweep job** (`GenerationJob` variant, internal): quarantines/evaluates expired uploads; expires unsaved uploads per the PROPOSED window (§12, legal sign-off pending), saved photos per rule below; idempotent per artifact, resumable on worker restart.
- **Deletion cascade job**: walks prototypes → storage objects → DB rows → queue messages (cancel pending) → provider delete calls (where a delete API exists; where not, documented fallback: rotate/isolate) → derived likenesses (thumbnails, editor snapshots, colouring line-art, duplicated copies) → backups mark-for-purge → audit completion.
- Both jobs are retried with backoff; a crashed cascade resumes from its checked-off audit record — deletion never "forgets" a party.

## 10. AI behaviour

Provider contracts: `StoryModel`, `IllustrationModel`, `IdentityReferenceModel`, `QualityModel`, `ModerationProvider` must declare retention (payload held only for the duration of the call) and a deletion path. **Never train public models on child data** is a contractual exclusion in every provider agreement (spec §18). Provider payloads are restricted to the minimum needed (guide §7: "no additional providers without documentation").

## 11. QA

A "deletion completeness" QA check is mandatory pre-launch: after a delete-now, a scan asserts no orphan likenesses, no storage objects, no queue messages, no provider payload references remain for the scope, and the audit log shows every party. Runs in staging + periodically in prod as a compliance sweep. Also validates that provider payloads referenced in `DataParty` match what is actually declared.

## 12. Privacy/security

This spec *is* the privacy contract. Proposed retention windows (state ours; legal sign-off pending — see Decision needed): **unsaved uploads: 48h**; **saved reference photos: while the Child Profile exists, and ≤30 days after profile/account deletion (later if an in-flight order needs them, then purged on completion)**; **book content/revisions/likenesses: while the library entry exists (F-021) and ≤30 days after deletion request**; **queue messages & provider payloads: bounded to job lifetime; sweep-backed**; **backups: purge same windows on schedule — child data excluded from long-term snapshots**. Modelled on Diffrun (spec §2) but stricter on saved photos (parent-controlled, not a flat 30 days). Retention, consent and delete-now are taught to every surface that stores children's data.

## 13. Analytics

Aggregated, anonymous: `delete_requested(child|account)`, `delete_completed`, `retention_sweep_run`, `provider_payload_deleted`. Events carry no identifiers or photo references (guide §7).

## 14. Acceptance criteria

- **Given** a parent requests delete-now while a book is `GENERATING`, **when** the cascade runs, **then** pending `GenerationJob` steps for that book/child are cancelled, provider payloads are deleted, and no partially generated likeness survives.
- **Given** a delete-now on a profile used by two books (one duplicated), **when** the cascade completes, **then** storage, DB, queue and provider audit show zero residual artifacts for that profile — including the duplicate's likeness copy.
- **Given** an unsaved upload, **when** the PROPOSED retention window (48h) passes, **then** the retention sweep removes it and its provider payload.
- **Recovery** **Given** a deletion cascade crashes mid-way, **when** the worker restarts, **then** the cascade resumes from the audit checkpoint and completes without resurrecting any data.
- **Given** the checkout page renders, **when** a parent opens the data panel, **then** retention windows, processors list and the delete-now control are visible inline (not only on legal pages).
- **Given** any provider contract, **when** it is reviewed, **then** it either provides a deletion path or the provider is rejected.

## 15. Dependencies

Landing with F-003 (consent/retention fields), F-004 (upload registration), F-005 (likeness provenance), F-010 (job cancellation). F-021/22/23 and every later spec defer their deletion contracts here. Independent of commerce (F-018) but must be embedded in its checkout copy.

## 16. Priority

**P0 (core v0) — launch-critical trust/privacy core.** The platform ingests children's photos from the very first session, so the deletion cascade, retention rules and provider-payload discipline must exist at launch; a privacy core promised but not built here is a launch blocker regardless of the P1 mark. The *full* program (account privacy hub, per-child retention cards, download-my-books, per-provider delete-api inventory) is the **P1 differentiation** surface (mission §26) and lands in M6. Mission §33 filter: fewer support problems and protective of the core promise ("we can be trusted with your children"). Launching behind Diffrun's privacy clarity is not acceptable (spec §18).

**Decision needed (legal/product sign-off required before the numbers go live):** the exact retention windows above; whether saved reference photos survive 30 days after account deletion during in-flight orders or are purged immediately on order completion; document, in one place, which providers have no delete API and the approved fallback.