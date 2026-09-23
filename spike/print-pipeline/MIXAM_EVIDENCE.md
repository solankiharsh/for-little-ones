# Spike D — Mixam print requirements evidence digest (live specs, 22 Sep 2026)

Transcribed from Mixam's live support pages + Blurb cross-check. Every fact is **Documented** (their
spec page) or **Inferred**. URLs shortened to domains/paths; full pages were fetched on 2026-09-22.

## Trim sizes & page counts — Documented
- Square/art-book trims offered: 120×120, 148×148, 210×210, 300×300 mm (+ A5/A4 family).
  `mixam.co.uk/childrensbooks`
- Hardcover bounds (paper-dependent): e.g. Silk 90 gsm **28–1224 pp**, Silk 200 gsm **20–500 pp**,
  Gloss 90 gsm **32–1508 pp**. A 20–48 pp book sits at the low end. `mixam.co.uk/childrensbooks`
- Cross-check (Blurb, Documented, updated 21 Jul 2026): children's 7.5×7.5 in square / Small Square
  hardcover trim 6.75×6.63 in. `blurb.com/book-dimensions`

## Bleed & safe margins — Documented
- Interiors: **3 mm bleed all edges**; hardcover covers: **20 mm bleed** all four edges; spine
  **20 mm** top/bottom (inner bleed used 5 mm at hinge).
- Quiet/safe area: **5 mm general** from trim; **hardcover/PUR binding edge 12 mm**, 5 mm other edges;
  cover art 10 mm binding / 5 mm other edges; Wiro 15 mm.
  `mixam.co.uk/support/bleed`, `mixam.co.uk/support/binding`
- Blurb: bleed 0.125 in (3.175 mm); critical content ≥ 0.25 in (6.35 mm) from trim.

## PDF requirements — Documented
- Multi-page **PDF** preferred (JPG/PNG/DOC auto-converted). **CMYK**, profile
  **GRACoL2006_Coated1v2**, total ink 150–250 %. **300 dpi**, reject < 100 dpi, > 400 dpi pointless.
  **No crop marks** ("Mixam's system adds its own crop marks"); page/crop box = finished size;
  interior spreads OK; cover = one spread PDF (spine + front + back) at 300 dpi. No PDF/X version
  mandated. `mixam.co.uk/support/design-and-file-preparation`, `/support/resolution`
- Blurb: PDF single pages (not spreads); no printer marks; CMYK or sRGB; 100%K body text; no spot
  colours; Word → PDF/X-1a.

## Hard-cover specifics — Documented
- Cover art = front + spine + back only (no inside covers); **endpapers auto-added** for casebound;
  **spine width auto-calculated**; **5 mm hinge** each side of spine; options Smyth sewing, dust
  jacket (170 gsm Silk), head/tail bands, ribbon. `mixam.co.uk/support/endpapers`, `/hardcoverbooks`

## Fonts — Documented
- **"You must embed every font on your original file."** No size penalty documented.
  `mixam.co.uk/support/proof`; Blurb: checklist implies flattened/100%K proofing.

## Image resolution — Documented
- Target 300 dpi; reject < 100 dpi; > 400 dpi pointless (Mixam). Images max 300 PPI (Blurb).

## Proofing & limits
- Mixam: thumbnails + 3D Virtual Preview + downloadable PDF proof (Overprint Preview = Always). Max
  upload size **not documented (Inferred: none published)**.
- Blurb (Documented): pages ≤ 2 GB, cover ≤ 90 MB.

## Binding & trim tolerance
- Hardcover = Adhesive Casebound / Smyth Sewn; interiors bound in **multiples of 2**; trim tolerance
  qualitative only — **no numeric mm published (Inferred)**.
  `mixam.co.uk/support/binding`

## Fulfilment payload — Documented
- CSV drop-ship fields: First Name, Last Name, Address 1–3, Town/City, County, Postcode, Country,
  Phone, Company, Email; ≤ 50 addresses; quantities per address; bespoke print-fulfilment = email
  quote; API docs exposed. `mixam.co.uk/support/shipping`

## What this means for us (Inferred)
- Our D016 `PrintSpec` is the generic contract; provider-specific deltas live in the Mixam adapter:
  3 mm interior bleed, 5 mm general / 12 mm binding-edge quiet area, offered-square trim membership,
  300 dpi target, CMYK conversion (DeviceRGB from pdf-lib must be converted in production F-017), no
  crop marks, all fonts embedded, interiors in multiples of 2 pages.
- The canonical 215.9 mm square used earlier is NOT an offered art-book trim (210/148/120/300) — the
  adapter flags that mismatch; the print spec must choose an offered size (or confirm a custom trim
  quote).

## Commercial and API qualification (first-party review, 22 Sep 2026)

### Observed
- Mixam publicly offers a Print API as a POD sales channel and says it can automate print-on-demand
  printing and fulfilment from a website/application. Its public page does not publish the API
  reference, authentication, order schema, pricing/quote calls, callbacks, rate limits, sandbox, or
  idempotency semantics. [POD](https://mixam.com/print-on-demand)
- POD requires a Mixam account and publisher registration. Products are configured, uploaded,
  confirmed by the publisher, then reviewed/approved by Mixam before they can be sold; a linked
  Stripe payout account is required to begin selling through the Publisher Hub. This proves a
  commercial POD route, but not that an API can submit a unique approved book per customer without
  that product-approval workflow. [POD introduction](https://mixam.com/support/pod-introduction)
  [Publisher Hub](https://mixam.com/support/the-publisher-hub)
- Mixam says it prints, packs and ships POD orders automatically. Delivery dates are estimates, not
  guarantees; its terms reserve product/service availability and price changes, and it may refuse
  orders. [POD](https://mixam.com/print-on-demand)
  [Terms sections 3 and 5](https://mixam.com/terms-of-use)
- Print artifacts contain child likenesses and names. Mixam's terms permit it to use submitted
  material to provide the service, including transmitting it to suppliers/vendors for production,
  packaging and shipment; Mixam may not archive material longer than needed for the final product,
  but states no fixed retention window. The privacy policy says data may be processed in the United
  States and retained to meet customer-service, legal and regulatory needs. [Terms section 8.C](https://mixam.com/terms-of-use)
  [Privacy policy sections 4-5](https://mixam.com/privacy-policy)

### Inferred
- The deterministic PDF and Mixam-adapter evidence above qualify Mixam as the **first print-format
  candidate**, not as an adopted production fulfilment provider. A public claim that an API exists
  is insufficient to implement the required `PrintProvider` boundary safely or reliably.

### Conclusion
- **PROVISIONALLY SELECTED, not ADOPTED:** retain Mixam as the first-provider candidate for
  hardcover, 210 mm art-book square. Do not bind F-019 fulfilment or customer promises to Mixam
  until the criteria below are evidenced. D016 remains generic and the Mixam adapter remains
  replaceable.

### Remaining qualification criteria
- Obtain Mixam's current API documentation and credentials, then run a sandbox/non-production
  order proving: quote, artifact upload/submission, destination/shipping options, order creation,
  status/tracking retrieval or callbacks, error taxonomy, cancellation/refund path, and stable
  idempotency under retry.
- Confirm whether API orders support a unique per-customer PDF or instead require each book to be a
  pre-approved POD product; document the required account/publisher/product approval terms,
  commercial pricing, minimums, regions/currencies, SLA and change-notice commitments.
- Execute a paid physical sample including cover/spine and image-DPI/CMYK checks; resolve the
  12 mm hardcover binding-edge safe-area requirement before approval.
- Obtain written data-processing, subprocessor/location and deletion/retention terms suitable for
  child likenesses, and verify that the handoff sends only `PrintArtifact`, delivery payload and
  quantity, never source photos or profile/story data.
