# WebM8 verification — 17 November 2026

## Verified live

- Production site: https://quickcurrencyexchange.uk/. CRM customer and analytics registration are linked under Quick Currency Exchange.
- The single public reservation form saves edited answers privately before submission. Visit `614565bb-efb9-41e4-9947-5d08c5b84159` displayed all seven fields in Form progress → Last observed state: side, currency, amount, collection date, name, phone and optional email.
- The edited synthetic name replaced the initial name. Clearing email displayed Empty. Website enquiry remained Not recorded. Synthetic drafts were subsequently cleared through the measurement opt-out and Saved drafts returned to zero.
- Desktop navigation and the mobile menu/currency sheet were exercised. The report showed descriptive header, hero, rates, footer, currency-open, USD-choice, currency-close/dismiss and submission labels. A separate validation test recorded Submission attempted and Submission failed with code invalid; it did not send a reservation.
- Every authored public action and currency option has an explicit stable analytics label. Desktop layout and a 390px phone viewport were reviewed; these were desktop browsers, not physical phones.
- Brave's privacy signal disabled analytics and private draft capture. The added footer measurement panel was removed at the owner's request. No privacy pop-up or dialog remains. Existing opt-outs and browser privacy signals remain honoured.
- The authenticated admin request list loads. Requests predating monitoring are explicitly labelled as having unknown email status.
- The public health endpoint reports storage, CRM configuration, email configuration and webhook configuration ready without exposing customer details. An unsigned live webhook returned 401 Invalid signature.
- Codex automation `quick-currency-delivery-watch` is active at five-minute intervals. This is scheduled monitoring, not instantaneous push delivery.

## Automated checks

71 website/backend tests and 100 platform tests passed. The platform production build and TypeScript check passed. Coverage includes signed CRM requests, durable outbox acceptance, transient/permanent send failures, unchanged retry payload and idempotency key, the bounded retry window, verified/replayed/out-of-order webhook events and public-health privacy. These outage scenarios use isolated fake providers; production services were not deliberately interrupted. The dependency audit reported zero vulnerabilities after the Next.js patch update.

## Remaining live checks and limits

- The prepared Delivery Monitor Test reservation still needs the owner's bot check and submission. Its named CRM record, signed Resend delivery event and receiving mailbox are not yet verified under the new monitoring flow.
- An actual production outage, automatic retry job execution and a failure notification arriving in Codex have not been induced. Local recovery and signature tests passed; the scheduled health read was checked against production.
- Call, WhatsApp, email and directions link labels/destinations were inspected, but external calls/messages/navigation were not completed. The success-only Make another request control and EUR/AED/AUD/CAD/ILS/CHF/SAR/QAR click labels have not all been confirmed individually in the live report. Footer Find us, header Home and Skip to content likewise have label coverage but no individually confirmed report event.
- `/index.html`, `www.quickcurrencyexchange.uk` and the previous Vercel alias share the reviewed registration but were not separately exercised through a full form flow.
- No draft-only field occurred in this test because each saved answer also had a field observation. The existing report supports Draft only rows in the same table; this edge case was not manufactured in production.
- Admin/password fields, Turnstile, hidden security fields and the embedded Google Maps frame are excluded. No additional public signup, quote or booking forms were found. Visual session recordings are not installed.

## Static audit note

The design audit has one pre-existing false positive: the Use No1's rate template button uses a delegated JavaScript handler that the auditor does not detect. No new actionless controls were introduced.
