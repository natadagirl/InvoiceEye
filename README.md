# InvoiceEye

InvoiceEye is a restaurant purchasing prototype built with React, TypeScript, Vite, Tailwind CSS, React Router, Recharts and Supabase. It uses the linked InvoiceEye production project `zvvhoamgmkvgzuccufmk`. Local development serves the frontend and connects to that same backend.

## Start the application

Use Node.js 22.12 or later. Install dependencies with `npm install`. Copy `.env.example` to `.env.local` if the latter is missing, then set the project URL and **publishable** key. All VITE-prefixed variables are browser-visible. Keep privileged keys and database connection strings out of Vite configuration.

Run `npm run dev` and open the URL printed by Vite. Run `npm run lint`, `npm test`, and `npm run build` for local verification. The built SPA uses browser history routing, so any future static host must serve index.html for application routes.

In the hosted project's Auth settings, enable the Email provider and configure the Site URL and allowed redirects for the exact frontend origin, including the root confirmation callback and `/reset-password`. For local development use a consistent hostname and port. Configure SMTP for sign-up confirmations and recovery messages to real users. The linked CLI configuration does not automatically change hosted Auth settings.

## Data and access

The browser uses `src/services/supabase.ts`. The Access component restores sessions, handles login, signup and password recovery, and loads RLS-filtered restaurant memberships. New users create a restaurant through an atomic onboarding RPC. Users with multiple restaurants can switch workspaces. Only owners can save alert thresholds.

The purchasing service pages through invoices and items in the selected restaurant. The dashboard totals ready CAD invoices including tax. Price analysis uses only standardized ready CAD lines, grouped by supplier and ingredient identity. Ingredient identity includes specification and base unit. Package size means base units per purchased unit. The tracker weights normalized unit prices by purchased base quantity, and compares consecutive calendar months. Missing or zero baselines yield no percentage. Other currencies remain visible on invoices, outside CAD analytics.

## Migrations and Storage

1. `supabase/migrations/20261123000100_purchasing.sql` creates profiles, restaurants, memberships, suppliers, standardized ingredients, invoices, invoice items, price alerts and AI reports. Composite keys enforce same-restaurant references. Membership checks use a private schema and fixed function search paths. Tenant members can read purchasing data, profile reads are self-only, and the settings grant covers only the threshold column.
2. `supabase/migrations/20261123000200_invoice_storage.sql` creates the private invoices bucket. It accepts PDF, JPEG and PNG up to 10 MiB. Object paths follow `restaurant-uuid/invoice-uuid.extension`. Members can upload, download or delete within that restaurant. Storage triggers register an uploaded invoice or clear its attachment path after deletion. Deleting a file retains its financial record.

Use the linked CLI's explicit remote target for inspection: `supabase migration list --remote` and `supabase db push --remote --dry-run`. Apply reviewed pending migrations with `supabase db push --remote` after approval. The dry run lists pending files; it does not execute their SQL.

## Synthetic demo setup

The seed creates Juniper Kitchen, five fictional suppliers, thirty standardized ingredients, ninety invoices and 630 lines from June through November 2026. Some suppliers sell matching specifications, some prices increase and others fall. The demo is private to its authorized members.

An operator with an existing confirmed demo user's UUID can run `node scripts/seed-demo.mjs USER_UUID` from the project root. Set SUPABASE_CLI to the CLI executable if it is outside PATH. The seed uses the linked project, a single transaction and a fixed restaurant ID. Re-running it for the same owner preserves existing records. For psql, use `psql -v ON_ERROR_STOP=1 -v demo_user=USER_UUID -f supabase/demo.sql` with a securely configured connection.

For the dedicated test accounts, `.env.fixtures` contains the local login details. Use DEMO_EMAIL and DEMO_PASSWORD at the login screen. The file is Git-ignored and owner-readable. The operator-only provisioning script uses the CLI to obtain the admin credential in memory, creates two confirmed synthetic accounts, and refuses to overwrite that file. These scripts are outside the frontend import tree.

## Live verification

After seeding, run `node --env-file=.env.local --env-file=.env.fixtures scripts/check-backend.mjs`. This checks password login, refreshed sessions, onboarding, database queries, tenant isolation, Storage access and logout using the publishable key and two ordinary accounts. It creates a small temporary file in the QA tenant, deletes that file, and retains its invoice record to match application behavior.

## Current limits

Invoice extraction runs on demand. The separate AI Insights reporting page is reserved for a later phase. Current alerts are derived on demand from invoice lines and the restaurant threshold; the alerts and reports tables reserve storage for future persisted results. Email delivery requires a working hosted mail configuration. The workspace reads the selected restaurant's invoice history into browser memory, suitable for prototype-scale datasets.

To exercise the exact paginated data mapper used by the browser, run `node --env-file=.env.local --env-file=.env.fixtures scripts/check-workspace.mjs`. It verifies six months of purchasing data, increasing and decreasing normalized prices, and positive November spend. The dashboard shows the largest alerts and links to the full threshold-filtered list in Price Tracker.

## AI invoice extraction

Open Invoices, choose a file or drop it onto the upload area, preview the original, then select **Extract with Gemini**. The signed-in browser sends only the invoice ID to the Edge Function. The function verifies the access token with Supabase Auth, checks membership, resolves the stored path from the invoice record and downloads the private file under the caller's RLS context. The file bytes are sent to Google Gemini for extraction. The Edge Function reads the server-side secret `geminiapi`. Errors returned to users omit credentials, document text and provider response bodies.

The default model policy checks the Google model endpoint for stable Flash-Lite candidates and verifies generateContent support before sending content. Set the optional Edge Function secret `GEMINI_MODEL` to pin a compatible model. Gemini receives a structured output schema and instructions to transcribe evidence, treat document text as untrusted and preserve nulls for missing data. Model lookup and generation use bounded timeouts. The database permits 20 extraction claims per restaurant per UTC hour. Interrupted claims can be retried after two minutes. Stale workers cannot overwrite a newer claim or discarded draft.

### Review and accounting

Uploads progress through Uploaded, Processing and Awaiting review. Failures can be retried. After an attempted extraction that records a file hash, users can also manually complete a failed draft. Close cancels unsaved edits. Discard marks the draft inactive while retaining its original attachment. Only explicit confirmation changes the accounting state to Confirmed (internally `ready` for compatibility). A ready invoice is immutable through the review API.

Review each header, add or remove lines and correct uncertain values against the preview. Choose an existing supplier from suggestions or enter a new name. For each purchased pack, enter the quantity of a standardized ingredient's base unit (kg, L or each) and explicitly select the ingredient. An unmatched line contributes to invoice spend but stays outside ingredient price trends. Historical, pre-extraction uploads acquire hashes when first processed.

PostgreSQL locks the invoice and commits the supplier, header and all line items in one transaction. It checks line totals, their sum against the **pre-discount** subtotal, and subtotal less discounts plus tax against the total. It derives normalized unit prices and enforces tenant-specific file content and supplier/invoice identity uniqueness. Failed saves leave the draft available for correction. The prototype supports nonnegative purchases and one header discount; credit notes and more complex tax/discount structures need further modeling. Edited values are saved on confirmation; closing the editor retains the original extracted draft.

The sample downloads on Invoices are fictional Cedar Valley Produce deliveries to Juniper Kitchen: a normal PDF (CAD 103.80), a price-increase PNG (CAD 150.50) and an incomplete JPEG (CAD 157.14) with an unspecified pack and ambiguous tomato variety.

### Operations and checks

The review migration adds extraction state, discounts, descriptions, duplicate indexes, a private hourly budget and constrained RPCs. The completion migration permits only the worker to complete a leased extraction. Keep Supabase Auth verification inside the handler when using the configured gateway JWT setting. Deploy from the linked workspace with `supabase functions deploy extract-invoice --remote=zvvhoamgmkvgzuccufmk --use-api`.

Run `npm run lint`, `npm test` and `npm run build`. Run `deno check supabase/functions/extract-invoice/index.ts` for Edge TypeScript. The opt-in live check, `node --env-file=.env.local --env-file=.env.fixtures scripts/check-extraction.mjs`, uses both synthetic accounts, exercises the deployed provider, and confirms synthetic records only in the QA restaurant. Previously extracted files are reused on subsequent runs. A new model deployment or a provider quota change can affect future results. Real invoice files should be submitted only by a restaurant authorized to share them with its configured AI provider.

For an isolated provider-failure test, run `deno test --allow-env scripts/extraction-recovery_test.ts`. Its synthetic transport returns HTTP 429, verifies that the worker records a failed attempt, then returns a successful response and checks that a retry reaches review. It consumes no provider quota.

Verified in the linked project with `gemini-3.1-flash-lite`: PDF and PNG each returned two items and the printed total. The live test checks a human-corrected description, price normalization, tenant denial, duplicate file content, supplier/invoice identity, repeated confirmation and the change in confirmed CAD spending. The transaction-only check in `supabase/tests/confirm_demo_rollback.sql` exercises matching against the seeded restaurant, header discounts and a price increase above its default alert threshold, then rolls back. An incomplete JPEG test verifies that the missing pack size remains null and is flagged for correction.
