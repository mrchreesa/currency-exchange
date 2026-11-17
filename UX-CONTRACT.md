# Quick Currency interaction contract

The public reservation page and owner request list retain the gold, ink and cream palette in DESIGN.md. Production recovery controls reuse existing buttons, labelled fields, cards and inline status messages.

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
| --- | --- | --- | --- | --- |
| Navigation | index.html and js/main.js | Public page anchors | Desktop links and mobile menu | Live click report and mobile check |
| Select/Listbox | js/main.js currency picker | CURRENCIES and native select value | Authored picker, native no-JS fallback | Live currency selection and saved draft |
| Date | Native date input | Reservation validation in lib/reservations.js | Native platform popup | Draft capture and date validation tests |
| Forms | js/main.js | Server reservation validation | Inline errors, pending and success states | Reservation tests and live signed CRM submission |
| Delivery status | js/admin.js | lib/delivery.js and verified webhook | Unknown, queued, retrying, accepted, delivered, failed and manually handled | Delivery tests and live webhook |
| Recovery actions | js/admin.js | api/admin/delivery.js | Explicit refresh, safe retry, customer contacted | Authenticated admin review |

## Delivery and recovery

Refresh never discards unsaved rate edits. Requests are retained before sending. Accepted is distinct from delivered; manual contact does not change provider delivery status. Pending and error messages remain visible and use live status regions. No timer refresh is introduced. Rates editing and its existing confirmation behaviour are outside this change.

The rate-update timestamp belongs in the admin rates card and uses London time. It includes the latest feed or owner price change. Public rates retain the freshness check without exposing the update timestamp. Optional customer confirmation email configuration is not a setup warning; missing core storage, shop email or bot protection still requires attention.

The shop client operates this admin panel; Kris at WebM8 operates the CRM. Client screens show rates, saved requests, per-request shop email status and customer contact actions. CRM links, sync labels, the aggregate email statistics banner and developer setup instructions stay out of the client interface. Agency monitoring still flags CRM failures independently.

Currency rows reuse the public site's pinned 4:3 flag assets and retain visible currency codes and names. A persistent note explains that typed price edits require Save prices; the existing unsaved marker and Discard action remain the editing feedback. These changes do not enable autosave.

The save bar stays visible while signed in. With no unsaved changes it says No unsaved changes and disables Save prices and Discard. Valid edits enable saving; invalid edits keep Save prices disabled. Both actions are disabled while a save is in progress. Discarding, restoring the original values or completing a save returns the bar to its visible disabled state.

## Measurement

All public actions have stable analytics IDs. Actual answers travel through private draft capture, separate from anonymous events; credentials, anti-bot inputs and the admin page are excluded. Browser privacy signals and previously saved opt-outs are honoured. The owner requested no added privacy pop-ups, dialogs or footer measurement panel.

## Static review limitation

The design auditor reports the pre-existing “Use No1’s rate” template button as actionless. Its delegated data-use handler in js/admin.js implements the action. No placeholder handler or rule suppression is added.
