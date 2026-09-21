# Platform Evaluation

Purpose:

Determine which mature primitives should be reused rather than rebuilt.

---

## Candidates

### Medusa

Possible role:

Commerce foundation.

Evaluate against current implementation.

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