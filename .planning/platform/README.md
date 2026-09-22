# Platform Evaluation

Purpose:

Determine which mature primitives should be reused rather than rebuilt.

---

## Candidates

### Medusa

Role:

Commerce foundation. **ADOPTED — D006 (2026-09-22, re-opened on a constraint change); self-hosted at
`apps/commerce`.** Verified current: v2.21.0, MIT, Postgres + Redis + server + worker, first-party
Stripe provider, no OSS outbound webhooks (subscribers + our `CommerceEventAdapter` instead). Hard
boundary: commerce state only — never the Book model; line items carry opaque approved-revision
refs (`DECISIONS.md` D006, `spike/commerce/MEDUSA_EVIDENCE.md`).

---

### OpenPolotno

Possible role:

Underlying page/book editor engine.

Evaluate:

- multipage support;
- custom book dimensions;
- spread behaviour;
- image/text editing;
- serialization;
- extensibility;
- performance;
- mobile behaviour;
- maintenance risk;
- licensing;
- dependency versus internal fork.

---

### IMG.LY Photobook Starter

Role:

UX and architecture reference.

Do not assume adoption.

---

### Postiz

Role:

Architecture reference for:

- jobs;
- retries;
- observability;
- integration organisation.

Not a candidate application foundation.

---

## Evaluation Principle

Do not ask:

> Is this library good?

Ask:

> Does adopting this library materially reduce our risk or work without introducing disproportionate coupling?