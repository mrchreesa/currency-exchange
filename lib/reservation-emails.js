import { currencyName } from './currencies.js';
import { notifyAddress } from './email.js';
import { escapeHtml } from './http.js';

const SITE = 'https://quickcurrencyexchange.uk';
const SHOP_PHONE = '020 8951 1500';

// Email adapter for css/styles.css :root. Inline colours and system-font
// fallbacks keep the website's identity when inboxes strip styles or web fonts.
const brand = {
  paper: '#f7f5ee', light: '#fbfaf6', stone: '#efeadb', black: '#161512',
  ink: '#121210', text: '#2b2a26', brass: '#7a5c12', line: '#c9a13a',
  gold: '#e8c35a', rule: '#e4dcc6',
  serif: "Georgia, 'Times New Roman', serif", sans: 'Arial, Helvetica, sans-serif',
};

const money = (n, currency = 'GBP') =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency, currencyDisplay: 'narrowSymbol' }).format(n);
const longDate = (iso) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

function describe(r) {
  const pays = r.side === 'buy' ? money(r.amount) : money(r.amount, r.currency);
  const receives = r.estimate == null ? null : money(r.estimate, r.side === 'buy' ? r.currency : 'GBP');
  return {
    action: `${r.side === 'buy' ? 'Buy' : 'Sell'} ${currencyName(r.currency)} (${r.currency})`,
    pays, receives,
    gets: receives ? `about ${receives} at ${r.rate} per £1` : 'ask for today’s rate',
    collect: longDate(r.date),
  };
}

function contactRow(label, content) {
  return `<tr><th scope="row" valign="top" align="left" width="80" class="email-secondary email-rule" style="padding:12px 12px 12px 0;border-bottom:1px solid ${brand.rule};font:normal 14px/22px ${brand.sans};color:${brand.brass}">${label}</th><td valign="top" class="email-text email-rule" style="padding:12px 0;border-bottom:1px solid ${brand.rule};font:16px/22px ${brand.sans};color:${brand.text};overflow-wrap:anywhere;word-break:break-word">${content}</td></tr>`;
}

export function shopEmail(r) {
  const d = describe(r);
  const subject = `${r.ref}: ${r.side === 'buy' ? 'Buy' : 'Sell'} ${r.currency} ${d.pays}, ${d.collect}, ${r.name}`;
  const preheader = `${r.ref} · ${d.pays} · Collect ${d.collect}. Call to confirm.`;
  const phone = escapeHtml(r.phone);
  const linkStyle = `color:${brand.ink};text-decoration:underline;text-underline-offset:3px;`;
  const rows = [
    contactRow('Name', `<strong>${escapeHtml(r.name)}</strong>`),
    contactRow('Phone', `<a class="email-text" href="tel:${phone}" style="${linkStyle}">${phone}</a>`),
    contactRow('Email', r.email
      ? `<a class="email-text" href="mailto:${escapeHtml(r.email)}" style="${linkStyle}word-break:break-all">${escapeHtml(r.email)}</a>`
      : 'Not provided'),
  ].join('');

  const html = `<!doctype html>
<html lang="en-GB" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(subject)}</title>
<style>
  body, table, td, th { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  table { border-collapse:collapse; mso-table-lspace:0pt; mso-table-rspace:0pt; }
  a:focus-visible { outline:2px solid ${brand.line}; outline-offset:4px; }
  @media only screen and (max-width:480px) {
    .email-outer { padding:12px 8px !important; }
    .email-pad { padding-left:20px !important; padding-right:20px !important; }
    .brand-name { font-size:23px !important; line-height:28px !important; }
    .email-title { font-size:29px !important; line-height:35px !important; }
    .amount { font-size:26px !important; line-height:34px !important; }
    .amount-table, .amount-table tbody, .amount-table tr, .amount-table td { display:block !important; width:100% !important; box-sizing:border-box; }
    .amount-col { padding-top:14px !important; padding-bottom:8px !important; }
  }
  @media (prefers-color-scheme:dark) {
    .email-bg { background-color:${brand.black} !important; }
    .email-surface { background-color:${brand.text} !important; }
    .email-panel { background-color:${brand.black} !important; }
    .email-text { color:${brand.paper} !important; }
    .email-secondary { color:${brand.stone} !important; }
    .email-rule { border-color:${brand.brass} !important; }
  }
</style>
<!--[if mso]><style>body,table,td,th,p,a { font-family:Arial,Helvetica,sans-serif; }</style><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:${brand.stone}">
<div lang="en-GB" dir="ltr" style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${escapeHtml(preheader)}</div>
<table role="presentation" lang="en-GB" dir="ltr" class="email-bg" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${brand.stone}" style="width:100%;background-color:${brand.stone}">
<tr><td align="center" class="email-outer" style="padding:32px 16px">
<!--[if mso]><table role="presentation" width="600" align="center"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="email-surface" bgcolor="${brand.light}" style="width:100%;max-width:600px;background-color:${brand.light}">
  <tr><td class="email-pad" bgcolor="${brand.light}" style="padding:26px 32px;border-top:4px solid ${brand.line};background-color:${brand.light}">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td width="52" valign="middle"><img src="${SITE}/assets/img/qce-email-mark.png" alt="" width="40" height="34" style="display:block;width:40px;height:34px;border:0;background-color:${brand.light}"></td>
      <td valign="middle"><p class="brand-name" style="margin:0;font:26px/30px ${brand.serif};color:${brand.ink}">Quick Currency Exchange</p><p style="margin:6px 0 0;font:11px/16px ${brand.sans};letter-spacing:1.6px;color:${brand.brass}">BUREAU DE CHANGE · EDGWARE</p></td>
    </tr></table>
  </td></tr>
  <tr><td class="email-pad" bgcolor="${brand.black}" style="padding:28px 32px;background-color:${brand.black}">
    <p style="margin:0 0 10px;font:12px/18px ${brand.sans};letter-spacing:1.6px;color:${brand.gold}">REQUEST · ${escapeHtml(r.ref)}</p>
    <h1 class="email-title" style="margin:0;font:normal 34px/40px ${brand.serif};color:${brand.light}">New reservation request.</h1>
    <p style="margin:14px 0 0;font:16px/25px ${brand.sans};color:${brand.stone}">Call the customer to confirm the rate and collection time. Nothing is reserved until you do.</p>
  </td></tr>
  <tr><td class="email-pad" style="padding:28px 32px 0">
    <h2 class="email-text" style="margin:0 0 16px;font:normal 23px/29px ${brand.serif};color:${brand.ink}">${escapeHtml(d.action)}</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="email-panel amount-table" bgcolor="${brand.paper}" style="width:100%;table-layout:fixed;background-color:${brand.paper};border-top:2px solid ${brand.line}">
      <tr>
        <td class="amount-col" width="50%" valign="top" style="padding:18px 16px 12px"><p class="email-secondary" style="margin:0 0 6px;font:12px/18px ${brand.sans};color:${brand.brass}">${r.side === 'buy' ? 'PAYING' : 'BRINGING'}</p><p class="amount email-text" style="margin:0;font:normal 32px/38px ${brand.serif};color:${brand.ink};overflow-wrap:anywhere">${escapeHtml(d.pays)}</p></td>
        <td class="amount-col" width="50%" valign="top" style="padding:18px 16px 12px"><p class="email-secondary" style="margin:0 0 6px;font:12px/18px ${brand.sans};color:${brand.brass}">RECEIVES</p><p class="amount email-text" style="margin:0;font:normal 32px/38px ${brand.serif};color:${brand.ink};overflow-wrap:anywhere">${escapeHtml(d.receives || 'To confirm')}</p></td>
      </tr>
      <tr><td colspan="2" class="email-secondary" style="padding:0 16px 18px;font:13px/20px ${brand.sans};color:${brand.brass}">${d.receives ? `Estimate at ${escapeHtml(r.rate)} ${escapeHtml(r.currency)} per £1. Confirm before collection.` : 'Confirm today’s rate with the customer.'}</td></tr>
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="email-rule" style="padding:18px 0;border-bottom:1px solid ${brand.rule}"><p class="email-secondary" style="margin:0 0 5px;font:12px/18px ${brand.sans};letter-spacing:1px;color:${brand.brass}">COLLECTION DAY</p><p class="email-text" style="margin:0;font:18px/26px ${brand.serif};color:${brand.ink}">${escapeHtml(d.collect)}</p></td></tr></table>
  </td></tr>
  <tr><td class="email-pad" style="padding:24px 32px 0">
    <h2 class="email-text" style="margin:0 0 4px;font:normal 23px/29px ${brand.serif};color:${brand.ink}">Customer details</h2>
    <table aria-label="Customer details" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed">${rows}</table>
  </td></tr>
  <tr><td class="email-pad" style="padding:24px 32px 28px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="${brand.gold}" style="background-color:${brand.gold};border:1px solid ${brand.line};border-radius:3px;mso-padding-alt:15px 24px"><a href="tel:${phone}" style="display:block;padding:15px 24px;border-radius:3px;font:bold 16px/22px ${brand.sans};color:${brand.black};text-decoration:none">Call customer</a></td></tr></table>
    <p style="margin:18px 0 0;text-align:center;font:14px/22px ${brand.sans}"><a class="email-text" href="${SITE}/admin" style="${linkStyle}">View reservation requests</a></p>
  </td></tr>
  <tr><td class="email-pad email-panel email-rule" bgcolor="${brand.paper}" style="padding:22px 32px;border-top:1px solid ${brand.rule};background-color:${brand.paper}">
    <p class="email-text" style="margin:0 0 5px;font:17px/24px ${brand.serif};color:${brand.ink}">Quick Currency Exchange</p>
    <p class="email-secondary" style="margin:0;font:13px/21px ${brand.sans};color:${brand.brass}">140 Station Rd, Edgware HA8 7AA<br>Sent from your website’s reservation form.</p>
  </td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body></html>`;

  const text = [
    'Quick Currency Exchange', `New reservation request ${r.ref}`, '',
    'Call the customer to confirm the rate and collection time. Nothing is reserved until you do.', '',
    `Wants to: ${d.action}`, `${r.side === 'buy' ? 'Paying' : 'Bringing'}: ${d.pays}`,
    `Gets: ${d.gets}`, `Collection: ${d.collect}`, '', `Name: ${r.name}`,
    `Phone: ${r.phone}`, `Email: ${r.email || 'Not provided'}`, '',
    `View reservation requests: ${SITE}/admin`, '',
    'Quick Currency Exchange · 140 Station Rd, Edgware HA8 7AA',
  ].join('\n');
  return { to: notifyAddress(), replyTo: r.email ?? undefined, subject, html, text };
}

// Customer confirmations remain unchanged and are only sent once RESEND_FROM is configured.
export function customerEmail(r) {
  const d = describe(r);
  const html = `<div style="font-family:Georgia,serif;font-size:16px;color:#121210;line-height:1.5">
<p>Hi ${escapeHtml(r.name)},</p>
<p>Thanks for your request. Your reference is <strong>${r.ref}</strong>.</p>
<p><strong>${escapeHtml(d.action)}</strong>, ${escapeHtml(d.pays)}, ${escapeHtml(d.gets)}.<br>Collection: ${escapeHtml(d.collect)}.</p>
<p>We’ll call you on ${r.phone} to confirm the rate and a collection time. Nothing is reserved until we do.</p>
<p>Quick Currency Exchange<br>140 Station Rd, Edgware HA8 7AA<br>${SHOP_PHONE}</p></div>`;
  const text = `Hi ${r.name},\n\nThanks for your request. Your reference is ${r.ref}.\n\n${d.action}, ${d.pays}, ${d.gets}.\nCollection: ${d.collect}.\n\nWe’ll call you on ${r.phone} to confirm the rate and a collection time. Nothing is reserved until we do.\n\nQuick Currency Exchange\n140 Station Rd, Edgware HA8 7AA\n${SHOP_PHONE}`;
  return { to: r.email, subject: `We’ve got your request ${r.ref}`, html, text };
}
