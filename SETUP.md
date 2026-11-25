# Going live

The site runs on Vercel: static pages plus small functions in `api/`. Each service below is set up once, then its keys
go into **Vercel → Project → Settings → Environment Variables** (Production). Redeploy after adding them.

Until a step is done, the site stays safe: the rates board still works, the form asks people to call, and `/admin`
lists what is missing.

## 1. Storage: Upstash Redis (free)

Vercel → **Storage** → Create → **Upstash for Redis** → connect it to this project.
This adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically. It holds today's rates, the owner's prices,
the request list and the spam counters.

## 2. Owner sign-in

| Variable | Value |
| --- | --- |
| `ADMIN_PASSWORD` | A long password for the owner |

The owner signs in at `/admin`. Changing the password signs out every device.

## 3. Email: Resend (free, 3,000 a month, 100 a day)

1. Sign up at resend.com **with quickcurrencyedgware@gmail.com** and confirm the email.
2. API Keys → Create (Sending access).

| Variable | Value |
| --- | --- |
| `RESEND_API_KEY` | The key from Resend |
| `NOTIFY_EMAIL` | Optional. Where requests go; defaults to quickcurrencyedgware@gmail.com |
| `RESEND_FROM` | Optional, see below |

Without a domain of your own, Resend only delivers to the account's own address, so the shop gets every request but
customers get no confirmation. To switch confirmations on, verify a domain in Resend (Domains → Add) and set
`RESEND_FROM` to something like `Quick Currency Exchange <hello@your-domain.co.uk>`.

## 4. Bot check: Cloudflare Turnstile (free)

Cloudflare dashboard → **Turnstile** → Add widget.

- Hostnames: `quickcurrencyexchange.uk` and `currency-exchange-quick-stop.vercel.app`. The apex entry also covers `www` in Cloudflare. Vercel preview links won't pass.
- Widget mode: Managed

| Variable | Value |
| --- | --- |
| `TURNSTILE_SITE_KEY` | Site key |
| `TURNSTILE_SECRET_KEY` | Secret key |
| `TURNSTILE_HOSTNAMES` | Production: `quickcurrencyexchange.uk,www.quickcurrencyexchange.uk,currency-exchange-quick-stop.vercel.app`. Update this and the Cloudflare widget together when changing domains. |

## Website domain

`https://quickcurrencyexchange.uk` is the canonical website. Vercel redirects `www.quickcurrencyexchange.uk`
to the apex domain with a permanent redirect. Cloudflare manages DNS in DNS-only mode; Vercel serves the
website and HTTPS certificate. Keep the records aligned with the recommendations in Vercel's Domains settings.

## How the rates work

- At 9:00am London time each day the board copies No1 Currency's rates. The first visit after 9:00am pulls them,
  so there is no scheduler to look after. If No1 can't be reached, the board keeps the last rates and tries again
  every 5 minutes.
- Prices saved in `/admin` replace No1's for those currencies until the next 9:00am, then the board goes back to No1.
- The board hides rates more than 3 days old and shows "Ask us" instead.

## Spam protection on the form

The server enforces every check, including for direct calls to `/api/reserve`:

- Hidden honeypot and at least 3 seconds on the form.
- 3 attempts per IP address per 10 minutes and 8 per day, including malformed fields and failed bot checks.
- Turnstile Siteverify must return success for the `reserve` action and an allowed hostname.
- After the bot check: 3 requests per normalized phone number per day and 40 across the site per day.
- The same normalized phone, currency, buy/sell choice and collection date shares one reference and sends
  no further email for 24 hours, even if the amount changes. Repeated submissions still count toward limits.
- Names must contain letters; phone numbers must have a plausible format; amounts must be positive decimals
  with at most two decimal places and a maximum £10,000 equivalent. Collection dates must be real calendar
  dates between today and 30 days ahead. Larger requests are asked to call.

Rate limits use fixed windows: ten-minute clock intervals and days starting at midnight UTC. Duplicate suppression
lasts a full 24 hours from the original request. Redis keeps counters shared across Vercel instances; requests
are refused if Redis is missing in Vercel or fails. Local development can use memory.

Limits live at the top of `lib/reservations.js`. Run `npm test` to exercise the API with fake Redis, Cloudflare
and email services; these tests never send real requests or emails. These checks reduce spam but do not prove
that a phone number belongs to the person submitting it.

## Google search

The site is ready for Google: page title and description, an icon Google can show beside results
(`/favicon.ico`, `/favicon-96x96.png`), business details as structured data (address, hours, services, FAQ),
`/robots.txt` and `/sitemap.xml`. The old `currency-exchange-quick-stop.vercel.app` pages redirect to
quickcurrencyexchange.uk; `/api/` still answers on both addresses.

These need the owner's Google accounts:

1. **Search Console** (search.google.com/search-console): add a Domain property for `quickcurrencyexchange.uk`
   (verify with the DNS record it gives), submit `https://quickcurrencyexchange.uk/sitemap.xml`, then use
   URL Inspection on the home page and press Request indexing. The icon and new title appear after Google
   re-crawls, usually within days to a few weeks.
2. **Google Business Profile**: the Maps listing is still called "Quick Stop". Set the website to
   `https://quickcurrencyexchange.uk`, primary category "Currency exchange service", add "Money transfer service",
   and check the hours match the site (Mon to Sat 9am to 8pm, Sun 10am to 6pm). Only rename the listing to
   Quick Currency Exchange if the shop sign says so; Google checks names against signage.
3. **Bing Webmaster Tools**: import the site from Search Console.

If the opening hours, phone or address change, update them in the page text and in the structured data in the
`<head>` of `index.html`, and change `<lastmod>` in `sitemap.xml`.
