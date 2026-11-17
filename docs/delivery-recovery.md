# Reservation delivery and WebM8

## Connections

- CRM customer: Quick Currency Exchange. Analytics workspace: `quick-currency-exchange`.
- Public site registration: `b135d664-b0e2-4c0b-813f-97705db8f4ec`.
- Production `WEBM8_LEAD_SETUP_FILE`: entire private .mjs file from WebM8, or its JSON config. Parsed as JSON, never executed. Keep outside Git and public files.
- Production `RESEND_WEBHOOK_SECRET`: signing secret for `https://quickcurrencyexchange.uk/api/webhooks/resend`.
- Subscribe only to email.sent, email.delivered, email.delivery_delayed, email.failed, email.bounced, email.complained and email.suppressed.
- Vercel queue topic `reservation-delivery`, London region, only opaque request IDs. Queue is optional in local tests and active in Production.

## What happens

Spam checks run before acceptance. A Redis transaction atomically saves the request, stable UUID, duplicate pointer and email outbox. The same ID/time are used for every signed CRM retry. Confirmation is shown only after WebM8 acknowledges storage; a local request remains available if CRM is unavailable.

The shop email payload is persisted before sending. Resend's deterministic idempotency key prevents repeated emails after ambiguous timeouts. Transient sending failures retry through Vercel Queues with bounded backoff for up to 23 hours, inside Resend's 24-hour idempotency window. Permanent API rejections require review. Accepted messages are never resent just because delivery is delayed. Missing delivery confirmation after 15 minutes raises attention.

Signed webhook events update state atomically; repeats and out-of-order events cannot downgrade a delivered message to sent/delayed. Invalid signatures are rejected and storage failures return non-2xx for replay. Delivery detail is retained for 30 days. The existing owner request list retains its latest 200 requests and displays 50.

`/api/delivery-health` contains only operational status, configuration booleans, reason codes and check time. It exposes no contacts, request IDs or business volumes. WebM8's authenticated report checks this reviewed fixed URL on open/Refresh. Per-request details and safe retry controls stay behind the shop admin login.

## Temporary fallback

Open `/admin#request-section` or WebM8's submitted enquiries. Contact the customer from the saved record and mark customer contacted after doing so. This records handling; it does not pretend that email was delivered. Retry pending delivery safely with its existing ID. Never manually resend a message already accepted by Resend solely because a webhook is missing. Check Resend's delivery log and replay the relevant event instead.

For expired uncertain sends, inspect provider logs before any new send. Repair revoked keys/domain/quota problems directly; do not rotate credentials or change recipients automatically. If Redis is unavailable the form fails closed and offers the shop phone number.

If queue publishing itself fails, the saved outbox remains in admin and the health check flags stalled work; the operator can run the safe retry action. Scheduled Codex checks are a backstop, not instant push notification or an always-on external monitor.

## Public coverage

Homepage `/` (and `/index.html` alias): the one public reservation form (side, currency, amount, date, name, phone, optional email), all navigation/contact/CTA controls, currency picker options, mobile menu. Private drafts keep the last explicitly edited permitted answers for 24 hours, including cleared answers; they are separate from anonymous activity and confirmed CRM enquiries. No public signup, quote or additional booking forms were found. Browser privacy signals and existing opt-outs are honoured; no additional privacy pop-ups or dialogs are installed. Admin/password, Turnstile, hidden company trap and security timestamps are excluded.
