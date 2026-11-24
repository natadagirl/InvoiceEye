# InvoiceEye

InvoiceEye is a university entrepreneurship prototype for small restaurant and cafe owners. The local dashboard shows supplier spend, invoice details, ingredient price trends, and month-over-month price alerts.

## Run locally

Use Node.js 22.12+ and npm. From the project root:

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. To type-check and create the production build, run `npm run build`. Use `npm run preview` to serve that build locally.

## Technology and layout

React and TypeScript power the interface. Vite builds the app, Tailwind CSS and custom CSS style it, React Router manages navigation, and Recharts renders the interactive charts.

- `src/data` generates 90 deterministic demo invoices for June–November 2026, spanning five suppliers and ten ingredients.
- `src/types` defines invoices and line items.
- `src/services` computes extended line totals, monthly spend, quantity-weighted unit prices and percentage changes.
- `src/components` contains shared charts, icons and the invoice table with line-item details.
- `src/pages` contains the dashboard, searchable invoice register, price tracker, insights and settings.
- `src/main.tsx` contains the application shell, routes and reporting-period selection.

## Phase 1 limits

All data is synthetic. Monetary values are in Canadian dollars. Invoice totals are quantity multiplied by unit price, summed across lines, before taxes and fees. Price alerts compare the selected month with the preceding month, using a configurable minimum increase (10% by default). June has no preceding comparison. The alert preference is stored locally when browser storage is available.

Insights use deterministic calculations. Supabase, Gemini, authentication, invoice uploads and multi-user persistence are deferred. This phase runs in one local development environment.
