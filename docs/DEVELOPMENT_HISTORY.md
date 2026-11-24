# InvoiceEye development history

InvoiceEye was implemented for ENTI 333 before its project folder was initialized as a Git repository. Git was initialized after Phase 4 and the subsequent branding work. The first five commits are **retrospective reconstructions** assembled on November 23, 2026, using their actual assembly timestamps. The dates below describe implementation in Edmonton local time. Commit timestamps record when the reconstructed trees were committed.

## Evidence and reconstruction method

The project audit found an uninitialized workspace and an empty GitHub repository. Retained editing commands established the order of source changes. Numbered SQL migrations, surviving sample documents, tests, and the final source provided additional evidence. Reconstruction took place in a temporary local checkout from a checksum-verified backup. Only source-writing edits and local verification were used. Historical deployments and live integration tests were not replayed.

The Phase 1 dependency lock was regenerated offline from the surviving dependency resolution and original manifest. Later checkpoints used surviving lock metadata and the scripts applicable to that milestone. Files without intervening changes were recovered from the preserved final implementation. These are feature-complete milestone reconstructions; they do not recover a sequence of original Git objects, individual editing sessions, or original commit authorship.

## Implementation milestones

| Implementation date | Reconstructed commit | Outcome and rationale |
|---|---|---|
| Nov 22, 2026 | c7354cb · Demo frontend | React, TypeScript, Vite, Tailwind, React Router and Recharts. Synthetic invoices made the dashboard, invoice register and ingredient trends demonstrable before backend integration. Price changes were derived from line items. |
| Nov 23, 2026 | afe8b4f · Supabase backend | Added authentication, onboarding, a restaurant-scoped purchasing schema, private invoice storage, deterministic seed and database-backed pages. Composite tenant keys and row-level security restricted access. |
| Nov 23, 2026 | 38b2a2e · Extraction and review | Added authenticated Gemini PDF/image extraction, editable drafts, file hashes, review warnings and atomic confirmation. Only confirmed purchases enter financial calculations. A lease-bound completion RPC gave the worker limited write access after a live test exposed a missing completion permission. |
| Nov 23, 2026 | 21a8512 · Analysis and review UX | Added deterministic purchasing metrics, historical report snapshots, rate-limited generation and evidence-linked recommendations. The UI distinguishes price from volume effects and identifies partial and future periods. The responsive editor keeps matching and confirmation controls accessible. |
| Nov 23, 2026 | a0b5f4f · Brand refinement | Applied the supplied forest-green, navy, orange and ivory palette and used the telescope mark in the application shell, sign-in flow and browser tab. |

## Migration trail

All filenames below are under `supabase/migrations/`.

- Phase 2 — `20261123000100_purchasing.sql` and `20261123000200_invoice_storage.sql`
- Phase 3 — `20261123000300_invoice_review.sql` and `20261123000400_finish_extraction.sql`
- Phase 4 — `20261123000500_analysis_reports.sql`

## Verification

During original development, two separate synthetic accounts verified tenant isolation and private file operations. Live Gemini extraction returned the printed sample totals of CAD 103.80, CAD 150.50 and CAD 157.14. The incomplete sample preserved a missing package size for review. The Phase 4 saved analysis reconciled 91 confirmed CAD invoices to CAD 71,290.57. The confirmed price-increase sample contributed unit-price increases of 46.4% for carrots and 43.9% for Roma tomatoes.

During reconstruction, all five application checkpoints passed the TypeScript and Vite production build. Phase 1 provided no lint or automated test script. Phases 2–4 and the branding checkpoint passed their available npm lint and test scripts. Phase 3 and Phase 4 also passed their offline Deno worker tests using simulated provider failures. Production services were outside the reconstruction test path.

The final application tree was checked against the pre-reconstruction SHA-256 inventory. Future milestones will be committed on main after implementation and testing. The later documentation and hosting-configuration commits are repository preparation performed after the reconstruction.
