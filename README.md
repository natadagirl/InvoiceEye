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

Uploads await a future extraction or review process. AI Insights is pending Gemini integration. No background processor runs. Current alerts are derived on demand from invoice lines and the restaurant threshold; the alerts and reports tables reserve storage for future persisted results. Email delivery requires a working hosted mail configuration. The workspace reads the selected restaurant's invoice history into browser memory, suitable for prototype-scale datasets.

To exercise the exact paginated data mapper used by the browser, run `node --env-file=.env.local --env-file=.env.fixtures scripts/check-workspace.mjs`. It verifies six months of purchasing data, increasing and decreasing normalized prices, and positive November spend. The dashboard shows the largest alerts and links to the full threshold-filtered list in Price Tracker.
