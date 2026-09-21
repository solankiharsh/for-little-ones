# Open Questions

These questions should be resolved through repository inspection, research or small technical spikes.

**2026-09-21 note:** the "what currently exists" style questions below predate the greenfield finding (D013). Where a question asks about existing systems, the answer is *none* — the remaining sections now read as **forward design questions**, most of which are answered in draft form by `features/01_*…28_*.md` and `PRODUCT_ARCHITECTURE_V2.md`. The still-genuinely-open items (durable-execution substrate, OpenPolotno wrap, Medusa edition, print partner/PDF standard, identity-threshold calibration) are listed as the blocking spikes in `DECISIONS.md` D014.

---

## Existing Architecture — RESOLVED 2026-09-21 (see RESEARCH_LOG.md)

Repository inspection concluded: **no application code exists**. The workspace is research-only.

| Question | Answer |
| --- | --- |
| What framework does the current application use? | None — no application exists (Observed) |
| What backend currently exists? | None |
| What database currently exists? | None |
| What authentication exists? | None |
| What object storage exists? | None |
| Is there currently a queue/job system? | None |
| What parts of the creation journey already work? | None as code; the journey is defined only in `project-spec-initial.md` |
| What parts are prototypes? | None |
| What currently handles checkout? | None |
| Is there an existing print integration? | None |

**Implication:** every system becomes **ADD/BUILD** on a greenfield foundation. The remaining questions below are therefore *forward-design decisions*, not reverse-engineering questions.

---

## Book Model

- What currently represents a book?
- Are pages stored structurally or as rendered output?
- How are generated assets referenced?
- Is revision history currently possible?
- How difficult would introducing a canonical Book schema be?

---

## Character Consistency

- What approach is currently used?
- Which image provider/model is currently used?
- Can it accept multiple references?
- Is character identity persisted across pages?
- Is there currently QA or reranking?

---

## Editor

- Is there an existing page editor?
- What capabilities does it have?
- Would OpenPolotno replace it or merely supply missing primitives?
- Can OpenPolotno support the required book dimensions and spread behaviour?
- Should we fork it or consume it as a dependency?

---

## Commerce

- What commerce functionality already exists?
- What would Medusa replace?
- Can migration be incremental?
- Can a Medusa line item reference an immutable approved book revision?
- How should personalised-product configuration be represented?

---

## Generation Jobs

- How does generation run currently?
- What happens when the browser closes?
- What happens if one page fails?
- What happens if the worker/process crashes?
- What retries exist?
- Do we need a full workflow engine, or is a simpler durable execution substrate sufficient? (candidate classes PostgreSQL-backed vs Redis-backed/BullMQ-class; decided after the D014 spike — D019)

---

## Printing

- Which printer/provider is currently intended?
- What file format do they require?
- What DPI, bleed and colour requirements exist?
- How are covers/spines calculated?
- How do print failures surface to operations?

---

## Privacy

- Where are child photos currently uploaded?
- Which external providers receive them?
- How long are they retained?
- Are public URLs currently used?
- Can parents delete source photos?
- What generated identity information persists?

---

## Product

- How much customisation should happen before generation?
- How much editing should be available after generation?
- Should preview show the entire book before payment?
- At which step should account creation become necessary?
- What is launch P0 versus later differentiation?