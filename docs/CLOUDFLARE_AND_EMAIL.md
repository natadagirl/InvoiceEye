# Cloudflare Pages and authentication email

## Frontend

Use the existing GitHub-connected Cloudflare Pages project for `natadagirl/InvoiceEye`, production branch `main`, repository root, build command `npm run build`, output `dist`, and Node 22.12 or later. Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` as public build variables. Supabase hosts the database, private files and Edge Functions. The Gemini and SMTP secrets belong on their respective servers. Pages serves the SPA entry for unknown routes when the output has no top-level 404.html.

In Pages → Custom domains, connect `invoiceeyeyyc.site` to the existing site. Follow Cloudflare's domain validation and certificate status. Verify HTTPS and direct reloads at `/settings/account`, `/auth/callback` and `/reset-password` on the Pages hostname and custom domain. Change the Supabase Site URL to `https://invoiceeyeyyc.site` once the custom domain serves the application. Allow these explicit redirect URLs during transition:

- `https://invoiceeyeyyc.site/auth/callback`
- `https://invoiceeyeyyc.site/reset-password`
- `https://invoiceeye.pages.dev/auth/callback`
- `https://invoiceeye.pages.dev/reset-password`

Keep the existing root confirmation callback during the lifetime of previously issued links. For local testing, allow only the exact local origin and the same two paths. Preserve any other currently needed allowlist entries. The frontend builds callbacks from its own origin and uses fixed destinations. Recovery links contain a one-time hash. The callback removes it from the URL and verifies it with Supabase after the user chooses Continue.

## Resend activation (owner configuration)

1. Add the sending domain `invoiceeyeyyc.site` in the existing Resend account and choose its sending region.
2. In Cloudflare DNS for that zone, copy **each sending record shown for this domain by Resend**, including the DKIM TXT name/value and the return-path MX (including priority) and SPF TXT records, normally at `send`. Use the exact region-specific MX target and selector shown by Resend. Set these records to DNS only where applicable and allow DNS propagation. Retain existing website and mailbox MX records. Review existing DMARC before adding a policy. Recheck until Resend marks sending verified. [Resend’s Cloudflare DNS guide](https://resend.com/docs/guides/dns/cloudflare)
3. In Resend, create a sending-only API key restricted to the verified domain. Enter it directly into the Supabase Auth email SMTP settings. Sender **InvoiceEye** <noreply@invoiceeyeyyc.site>, host `smtp.resend.com`, port **465** (TLS), username `resend`, password the Resend sending key. Store a recovery copy in the owner's password manager. [Resend’s Supabase SMTP guide](https://resend.com/docs/send-with-supabase-smtp)
4. In Supabase Auth email templates, set Confirm signup to the contents of `supabase/templates/confirmation.html` and Reset password to `supabase/templates/recovery.html`. Suggested subjects are “Confirm your InvoiceEye email” and “Reset your InvoiceEye password”. Both templates use the allowed redirect URL and one-time token hash. Disable email click tracking that rewrites verification links. [Supabase email templates](https://supabase.com/docs/guides/auth/auth-email-templates)
5. Once domain, HTTPS, redirects and sender are ready, test recovery to an owner-controlled mailbox. Verify delivery, sender, valid link, password update and expired-link handling. Test a confirmation invitation/link with a controlled account before enforcing confirmation on new registrations. After activation, verify a new signup cannot sign in before confirming, completes onboarding after confirming, and can request another link after cooldown. Existing verified fixtures use their current credentials.

Production email delivery and the confirmation requirement depend on hosted Auth settings. With auto-confirm enabled, Supabase can return a confirmed session immediately after signup. The app preserves that behavior until the owner completes rollout. Price notifications use database-backed read receipts and stay entirely inside the workspace.
