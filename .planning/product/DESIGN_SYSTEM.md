# Design System — For Little One

UX/design tokens and component patterns for the product. Referenced by every feature spec (§6 UI sections in `../features/`).

**Guiding feel:** warm · premium · calm · magical · trustworthy · simple.

**Explicitly avoided:** generic SaaS dashboard, AI-neon gradients, overloaded control panels, childish toy UI, Canva clone. The buyer is the adult; the book is for the child.

---

## 1. Visual principles

- **Calm surfaces, warm accents.** Cream/ivory canvas, deep plum or forest as primary ink, one warm accent (amber or peachy coral). No bright neons.
- **Magical but restrained.** Micro-interactions (page-turn, wonder burst on "wow" moments) not decoration.
- **Photography-first.** Child photos and illustrations are the hero; chrome recedes.
- **Type does the warmth.** Generous rounded-but-not-toys type; large readable text on cards.

## 2. Typography

| Token | Value (proposal) | Use |
| --- | --- | --- |
| `font-display` | Serif with warmth (e.g. Fraunces) | Headlines, book titles, "wow" moments |
| `font-body` | Humanist sans (e.g. Nunito Sans) | Body, forms, UI |
| `font-story` | Book body face w/ good line height | Story text inside book pages (must be embeddable in print) |
| Scale | `--text-xs` … `--text-4xl` | Fixed 8-pt scale; max headline ≈ 40–48px mobile, 56–64px desktop |
- Story text: ≥ 16px rendered size for early-reader comfort; line-height 1.6 reading mode.

## 3. Colour

| Token | Role |
| --- | --- |
| `--bg-canvas` | ivory/cream (#FBF7F0) page background |
| `--bg-surface` | white/soft card (#FFFFFF / #F7F1E8) |
| `--ink` | deep plum/near-black warm (#2E2237) primary text |
| `--ink-muted` | (#6B5E70) secondary text |
| `--accent` | warm amber (#E8A33D) primary CTA, highlights |
| `--accent-hover` | deepened amber |
| `--success` | moss green |
| `--warning` | amber-orange (distinct from accent usage) |
| `--danger` | brick red |
| `--outline` | soft border (#E5DCCE) |
| Theme palettes | per story-theme accent tints (Space=deep indigo, Dinosaurs=fern…) for catalogue cards only; book body stays neutral |

## 4. Spacing & radius

- Spacing scale 4-pt (`--space-1`..`--space-12`: 4/8/12/16/24/32/48/64/96).
- Radius: `--radius-sm` 8px, `--radius-md` 16px (cards), `--radius-lg` 24px (sheets/modals). Fully-round only for avatars/photo chips.
- Cards: soft hairline border + subtle shadow `0 1px 2px rgba(46,34,55,.06), 0 4px 16px rgba(46,34,55,.06)`.

## 5. Button hierarchy

| Button | Use | Style |
| --- | --- | --- |
| `primary` | "Generate", "Approve & Print", "Continue", checkout | accent fill, ink-dark text? (check contrast) or white text on amber; 48px min height |
| `secondary` | "Save", "Try another" | surface + outline |
| `ghost` | tertiary actions "Cancel", "Skip" | no fill, ink text |
| `danger` | "Delete photo", "Remove" | outline red text; confirm pattern before destructive action |
- Primary CTA is single per screen on mobile. Min touch target 44×44.

## 6. Forms

- Single column on mobile, generous fields (48px+), inline validation on blur, message under field.
- Microcopy that reassures: "Only you and our production team can see these photos." Never expose model terminology.
- Progress shown as step dots only when ≤4 steps; wizard otherwise.
- Confirmation pattern for destructive/irreversible actions ("Change hair everywhere?" → "21 pages will update").

## 7. Progress states

- **Generating:** emotional labelled checklist (from spec F-010): "Getting to know Ava → Writing the adventure → Painting the illustrations → Putting the book together → Final checks". Checkmark fade-in per step; never empty spinner for >1.5s.
- **Skeleton loading** for catalogue/preview loads; shimmer subtle, cream-based.
- **Failure surfaces:** friendly copy + one recoverable action. E.g. "We had trouble creating page 12. The rest of the book is safe." + `[Try page 12 again]`. No raw error strings, no 5xx visible.

## 8. Alerts & modals

- Toast for ephemeral (saved), inline alert for blocking, modal for confirmations with 2-button choice.
- Alert palette from colour tokens; icon + headline + optional action.
- Modals: `--radius-lg`, soft scrim, focus-trapped, ESC closes for non-destructive.

## 9. Book preview & reader components

- **Reader:** near-black/book-shadow backdrop on desktop; page spread centered; thumbnail rail left; paging via tap/swipe; read-only by default.
- **Correction surface:** "Something wrong?" opens a bottom sheet (mobile) or right rail (desktop) with intent chips (image/text/character/story groups). Not a generic properties panel.
- **Editor mode (escape hatch):** explicit "Edit book" from preview; returns to reader/approval path when done. Keeps F-014 boundaries.

## 10. Cards & catalogue

- Theme card: illustration thumbnail + title + one-line mood; selected state accent ring.
- Book card in library: cover render + title + child names + meta (paperback/hardcover, status).
- Empty states across product: friendly illustration + single primary action (e.g. library empty → "Make a story").

## 11. Motion

- Durations 150–300ms; page-turn 400ms ease; respect `prefers-reduced-motion`.
- Purposeful: joy on first guarded reveal of the generated child; calm transitions between wizard steps.

## 12. Responsive behaviour

- Breakpoints: mobile <640, tablet 640–1024, desktop >1024.
- Mobile-first: creation wizard, photo upload, browse, progress, preview, small corrections, checkout, approval, tracking all one-handed comfortable (F-001…F-020 enforce this).
- Desktop adds thumbnail rail, spread view, inspector rail only in edit mode.

## 13. Accessibility baseline

- WCAG 2.1 AA contrast; full keyboard nav in editor; labelled inputs; `aria-live` on progress; focus order sane; touch targets ≥44px.

## 14. Status

- Adopt before UI freeze on Milestone 1 (F-002, F-011 specs reference this file). Tokens live with the app design tokens once a prototype exists; this document is the contract.