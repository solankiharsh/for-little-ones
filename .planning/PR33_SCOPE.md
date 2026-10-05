# PR #33 scope and system classification

## Scope decision

**ADD — bounded story-experience prototype.** This route tests whether a parent can see a warm story journey, choose a story world, and carry those details into the existing F-007/F-008 creation flow. The route's reader and timed image sequence are curated examples, not a generated book. The visible sample labels are part of the boundary.

**MODIFY — existing creation handoff and Vercel function entry points.** Keep the five selected worlds and companion choices when the parent continues into creation; save them with the draft and pass them to story idea/story-preview prompts. The companion input is a short cast hint only: this does not implement reusable family profiles, separate identities or swap QA from proposed F-023. Export the API routes in a shape Vercel can invoke. Keep the approved-revision reference as the only cart-line metadata.

**KEEP — the existing F-007/F-008 project, moderation, entitlement and teaser boundaries; keep the existing sandbox checkout for fixture orders.** The sandbox checkout is a test order using the approved Fox/Moon fixture and system payment provider; it does not redeem a creation claim or buy the personalized preview. It does not prove a personalized book was printed or that a real payment works.

**DEFER — production photo upload and quality checks, final personalized book/format approval, real card or wallet payment, print fulfilment, and end-to-end production checkout.** F-004, F-009, F-011 and F-018 remain proposed in `.planning/features/00_FEATURE_MAP.md`; this PR does not claim those journeys are complete.

**REJECT — copy or motion that implies the sample timer generated or bound the customer's finished book.** Use sample/preview language throughout this prototype.

## Evidence and verification boundary

- The story reader composes sample text locally and uses curated art.
- The creation modal calls the existing project/concept/story-preview APIs.
- The cart uses the fixed `approved_sandbox_1` fixture. A sandbox order is explicitly a test order and does not print or charge.
- The production story route and infrastructure need fresh hosted verification after the PR preview deploys; source-level checks cannot establish service health.
