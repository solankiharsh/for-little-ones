# For Little One Planning

This directory contains research, architecture decisions and feature specifications for For Little One.

The current phase is:

> Research → Feature Specification → Architecture → Implementation Roadmap

Large feature implementation should not begin until the core product journey and architecture are sufficiently understood.

---

# Sources

The initial product research currently lives at:

`../project-spec-initial.md`

Read it before making product-level decisions.

---

# Structure

## `codebase/`

Research about the current repository.

Eventually expected to contain documents such as:

- ARCHITECTURE.md
- STACK.md
- STRUCTURE.md
- INTEGRATIONS.md
- TESTING.md
- CONCERNS.md

These must describe the repository as it actually exists.

---

## `market/`

Competitor and customer research.

Primary competitors currently include:

- Magic Moon Books
- Adorabook
- TinyTales
- Diffrun

Research should distinguish:

- Observed
- Inferred
- Not verifiable

---

## `platform/`

Evaluation of reusable infrastructure and open-source primitives.

Current candidates include:

- Medusa
- OpenPolotno
- IMG.LY Photobook Starter
- Postiz as architecture reference

This directory should answer:

> What should we reuse instead of rebuilding?

---

## `product/`

Product architecture and user experience.

Eventually likely to contain:

- PRODUCT_THESIS.md
- EXPERIENCE_MAP.md
- DESIGN_SYSTEM.md
- PRODUCT_ARCHITECTURE_V2.md
- IMPLEMENTATION_ROADMAP.md

---

## `features/`

Feature-level specifications and the master feature map.

- `_SPEC_GUIDE.md` — the shared template + canonical decisions every spec follows.
- `00_FEATURE_MAP.md` — master register of all 28 features (F-001…F-028): priority, dependencies, status, file link.
- `01_*` … `28_*` — one spec per capability. Each has the identical 16-section structure (Goal … Priority). The core-creation deep set (per mission §11): 02,03,04,05,06,07,08,09,10,11,12,13,16,17,18.
- Agreement status per feature is tracked in `00_FEATURE_MAP.md` ('proposed' → 'agreed').

---

## Root-level deliverables (current phase)

| File | Purpose |
| --- | --- |
| `PRODUCT_ARCHITECTURE_V2.md` | Revised product architecture (19 sections), honest that the codebase is greenfield |
| `IMPLEMENTATION_ROADMAP.md` | Milestones 0–6 as usable vertical slices |
| `FEATURE_SPEC_SUMMARY.md` | Executive summary of the feature set + platform decisions |
| `product/DESIGN_SYSTEM.md` | UX design-system contract referenced by UI sections |
| `codebase/README.md` | RESOLVED: no application code exists (greenfield, D013) |

---

# Documentation Standard

When documenting repository behaviour include exact file paths.

Clearly distinguish:

### Observed

Directly verified.

### Inferred

Likely but not directly verified.

### Decision needed

Requires a product or architecture choice.

### Recommended experiment

Small test required to resolve uncertainty.

---

# Current Goal

Turn the existing product research into a precise specification for:

1. the customer journey;
2. the canonical domain model;
3. generation;
4. editing;
5. printing;
6. commerce;
7. fulfilment;
8. reliability;
9. privacy;
10. implementation order.

The final documentation should allow implementation without repeatedly guessing what the product is supposed to do.