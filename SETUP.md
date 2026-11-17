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

- Hostnames: `currency-exchange-quick-stop.vercel.app` (add any custom domain later; Vercel preview links won't pass)
- Widget mode: Managed

| Variable | Value |
| --- | --- |
| `TURNSTILE_SITE_KEY` | Site key |
| `TURNSTILE_SECRET_KEY` | Secret key |

## How the rates work

- At 9:00am London time each day the board copies No1 Currency's rates. The first visit after 9:00am pulls them,
  so there is no scheduler to look after. If No1 can't be reached, the board keeps the last rates and tries again
  every 5 minutes.
- Prices saved in `/admin` replace No1's for those currencies until the next 9:00am, then the board goes back to No1.
- The board hides rates more than 3 days old and shows "Ask us" instead.

## Spam protection on the form

Hidden honeypot field, a minimum time on the page, strict field checks, Cloudflare Turnstile, and limits of
3 requests per connection per 10 minutes, 8 per day, 3 per phone number per day and 40 site-wide per day.
The same request twice in a day is acknowledged but not sent again. Amounts are capped at £10,000; bigger ones are
asked to call. Limits live at the top of `lib/reservations.js`.
