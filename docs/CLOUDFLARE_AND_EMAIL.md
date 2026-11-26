# Cloudflare Pages and authentication email

## Frontend

Use the existing GitHub-connected Cloudflare Pages project for `natadagirl/InvoiceEye`, production branch `main`, repository root, build command `npm run build`, output `dist`, and Node 22.12 or later. Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` as public build variables. Supabase hosts the database, private files and Edge Functions. The Gemini and SMTP secrets belong on their respective servers. Pages serves the SPA entry for unknown routes when the output has no top-level 404.html.

In Pages → Custom domains, connect `invoiceeyeyyc.site` to the existing site. Follow Cloudflare's domain validation and certificate status. Verify HTTPS and direct reloads at `/settings/account`, `/auth/callback` and `/reset-password` on the Pages hostname and custom domain. Change the Supabase Site URL to `https://invoiceeyeyyc.site` once the custom domain serves the application. Allow these explicit redirect URLs during transition:

- `https://invoiceeyeyyc.site/auth/callback`
- `https://invoiceeyeyyc.site/reset-password`
- `https://invoiceeye.pages.dev/auth/callback`
- `https://invoiceeye.pages.dev/reset-password`

Keep the existing root confirmation callback during the lifetime of previously issued links. For local testing, allow only the exact local origin and the same two paths. Preserve any other currently needed allowlist entries. The frontend builds callbacks from its own origin and uses fixed destinations. Recovery links contain a one-time hash. The callback removes it from the URL and verifies it with Supabase after the user chooses Continue.

## Production Resend configuration

The project owner verified the sending domain and configured Supabase custom SMTP for **InvoiceEye** <noreply@invoiceeyeyyc.site>. The owner manually confirmed signup email delivery, confirmation links, recovery delivery, password reset and logo rendering in Gmail.

Hosted confirmation and recovery templates use `{{ .ConfirmationURL }}`. Their logo is [the approved transparent PNG](https://invoiceeyeyyc.site/invoiceeye-email-logo-v2.png?v=3). Keep the query parameter for existing Gmail caches. Business notifications remain in-app.

For reference, Resend uses `smtp.resend.com`, port 465 and username `resend`. The sending key is kept in Supabase's private SMTP settings. Cloudflare DNS should retain the domain-verification and sending records issued by Resend. [Resend's Cloudflare DNS guide](https://resend.com/docs/guides/dns/cloudflare) · [Resend's Supabase SMTP guide](https://resend.com/docs/send-with-supabase-smtp)

The repository copies match the production markup supplied by the owner. Use `supabase/templates/confirmation.html` for Confirm signup and `supabase/templates/recovery.html` for Reset password. The signup template intentionally uses `#20754E` for its button and `#DFE8E1` for its border and divider. The recovery template uses `#1E754D` and `#DCE5DE`.
