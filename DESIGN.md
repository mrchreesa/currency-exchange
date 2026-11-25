---
version: alpha
name: Quick Currency Exchange
description: A warm paper and gold currency counter, with a practical phone-friendly owner desk.
colors:
  background: '#f7f5ee'
  surface: '#fffefb'
  ink: '#121210'
  text: '#2b2a26'
  muted: '#6f6b62'
  primary: '#e8c35a'
  border: '#e4dcc6'
  warning: '#9a3412'
typography:
  body:
    fontFamily: 'Source Serif 4, Georgia, serif'
  controls:
    fontFamily: 'Figtree, system-ui, Segoe UI, sans-serif'
rounded:
  DEFAULT: '8px'
omitted:
  - section: spacing
    reason: Existing css/styles.css and css/admin.css own responsive spacing; no new scale is introduced.
---

# Quick Currency Exchange design context

## Overview

An Edgware shop counter: black ink, warm paper and restrained gold. Public pages help visitors check rates and request a collection; the private owner desk prioritises clear requests and delivery recovery on a phone. English copy uses en-GB numbers and Europe/London times. Preserve the established site rather than introducing a software-dashboard theme.

## Colors

The existing runtime stylesheets are authoritative. css/styles.css owns the public site; css/admin.css owns admin variables (--paper, --card, --ink, --text, --muted, --gold, --line, --warn). This file records their intent; it does not generate a separate theme. Warnings always include explanatory text.

## Typography

Source Serif 4 carries the counter's editorial character; Figtree supports controls and compact metadata. Preserve the existing font stacks, sizes and line heights. Long delivery messages wrap naturally.

## Layout

Public sections retain their current layout and mobile currency picker. The questions section follows the rates layout (intro column, then a ruled list of native disclosures); its answers must match the FAQPage structured data in the page head. Admin uses stacked cards, document scrolling and a bounded latest-50 request list. Delivery status lives beside each saved request. Refresh is explicit and must preserve unsaved rate edits.

## Elevation & Depth

Use the existing paper/card separation, borders and picker overlay. Do not add decorative charts, gradients or a new card system to operational status.

## Shapes

Admin controls and delivery notices inherit the 8px radius. Public buttons retain their existing geometry.

## Components

The existing .button, .button--small, .note, .request and .card classes own admin presentation. Native buttons own delivery actions; #delivery-action-status is the persistent live status for network errors. Disable repeat actions while pending. Dates and rates remain in the existing workflow; this feature does not change pricing decisions or confirmations.

The reservation form uses existing labelled fields and inline validation, an authored accessible currency list, and a native collection-date input. Tracking uses explicit stable control labels. No additional privacy pop-ups, dialogs or footer panel are added. Browser privacy signals and existing measurement preferences are honoured; draft saving has a plain explanation beside the form. Passwords, tokens, honeypots and private admin pages are excluded.

## Do's and Don'ts

- Show saved, accepted and delivered as distinct facts.
- Preserve customer details when email delivery fails; provide the phone/contact fallback.
- Keep credentials, form answers and request IDs out of public health responses and anonymous activity events.
- Do not imply Inbox delivery from a provider acceptance response.
