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