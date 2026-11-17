(() => {
  'use strict';

  const CURRENCIES = [
    ['EUR', 'Euro'], ['USD', 'US Dollar'], ['AED', 'UAE Dirham'], ['AUD', 'Australian Dollar'],
    ['CAD', 'Canadian Dollar'], ['ILS', 'Israeli Shekel'], ['CHF', 'Swiss Franc'], ['SAR', 'Saudi Riyal'],
    ['QAR', 'Qatari Riyal'],
  ];
  const FAR_FROM_NO1 = 0.1; // warn when a price is more than 10% away from No1's

  const $ = (id) => document.getElementById(id);
  const rows = $('rows');
  let state = null;
  let edits = {}; // code -> { sell, buy } as typed

  /* ---------- Helpers ---------- */

  const londonDay = (date) => date.toLocaleDateString('en-GB', { timeZone: 'Europe/London' });

  function when(iso) {
    const date = new Date(iso);
    const time = date.toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: 'numeric', minute: '2-digit', hour12: true }).replace(' ', '');
    const day = londonDay(date);
    if (day === londonDay(new Date())) return `${time} today`;
    if (day === londonDay(new Date(Date.now() + 864e5))) return `${time} tomorrow`;
    if (day === londonDay(new Date(Date.now() - 864e5))) return `${time} yesterday`;
    return `${time} ${date.toLocaleDateString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short' })}`;
  }

  const fmt = (n) => (typeof n === 'number' ? n.toFixed(4) : '');
  const isRate = (text) => /^\d{1,5}(\.\d{1,4})?$/.test(String(text).trim()) && Number(text) > 0;
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

  let toastTimer;
  function toast(message) {
    const el = $('toast');
    el.textContent = message;
    el.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-on'), 4000);
  }

  async function api(path, body) {
    const response = await fetch(path, body
      ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 && path !== '/api/admin/login') {
      showLogin();
      throw new Error(data.error || 'Please sign in again.');
    }
    if (!response.ok || data.ok === false) throw new Error(data.error || 'Something went wrong. Try again.');
    return data;
  }

  /* ---------- Views ---------- */

  function showLogin() {
    state = null;
    edits = {};
    $('admin').hidden = true;
    $('savebar').hidden = true;
    $('sign-out').hidden = true;
    $('login').hidden = false;
    $('password').focus();
  }

  function showAdmin(next) {
    state = next;
    $('login').hidden = true;
    $('admin').hidden = false;
    $('sign-out').hidden = false;
    render();
  }

  function renderSetup() {
    const s = state.setup;
    const items = [];
    if (!s.storage) items.push('Saved prices and requests may be unavailable. Please contact WebM8 for help.');
    if (!s.email) items.push('Email notifications are unavailable. Check requests below and contact WebM8 for help.');
    if (!s.turnstile) items.push('Online reservations are temporarily unavailable. Customers are being asked to call the shop. Please contact WebM8 for help.');
    $('setup').hidden = !items.length;
    $('setup-list').innerHTML = items.map((item) => `<li>${item}</li>`).join('');
  }

  function renderNotes() {
    const board = state.board;
    $('rates-updated').textContent = board.updated
      ? `Rates updated ${when(board.updated)}.`
      : 'Rates have not loaded yet.';
    $('rates-note').textContent = board.autoUpdatedAt
      ? `Showing No1’s rates from ${when(board.autoUpdatedAt)}. Next update at ${when(board.nextUpdate)}.`
      : 'No1’s rates haven’t loaded yet. Try “Pull No1’s rates now”.';

    $('manual-banner').hidden = !board.manualUntil;
    if (board.manualUntil) $('manual-text').textContent = `Your prices are live until ${when(board.manualUntil)}.`;

    const error = state.feedError;
    $('feed-warning').hidden = !error;
    if (error) $('feed-warning').textContent = `Couldn’t reach No1’s rates at ${when(error.at)}. The board is showing the last rates it got. It will try again in a few minutes.`;
  }

  function renderRows() {
    const { rates, auto } = state.board;
    rows.innerHTML = CURRENCIES.map(([code, name]) => {
      const current = rates[code] ?? {};
      const no1 = auto[code];
      const edit = edits[code];
      const input = (side, label) => `
        <div>
          <label class="label" for="${code}-${side}">${label}</label>
          <input class="input" id="${code}-${side}" data-code="${code}" data-side="${side}" type="text" inputmode="decimal"
            autocomplete="off" value="${escape(edit ? edit[side] : fmt(current[side]))}">
          <p class="row__no1">${no1 ? `No1: ${fmt(no1[side])}` : 'No1: not available'}</p>
        </div>`;
      return `
        <div class="row" role="listitem" data-code="${code}">
          <div class="row__name">
            <span class="row__code">${code}</span>
            <span class="row__full">${name}</span>
            <span class="chip chip--edited" data-chip="edited" hidden>Not saved</span>
            ${current.manual ? `<span class="chip">Your price</span>
            <button class="link row__use" type="button" data-use="${code}">Use No1’s rate</button>` : ''}
          </div>
          ${input('sell', 'We sell')}
          ${input('buy', 'We buy')}
          <p class="row__warn" id="${code}-warn" aria-live="polite"></p>
        </div>`;
    }).join('');
    CURRENCIES.forEach(([code]) => checkRow(code));
    updateSavebar();
  }

  function renderRequests() {
    const list = state.reservations;
    const summary = state.delivery;
    $('delivery-summary').textContent = summary ? `${summary.shopStatus === 'healthy' ? 'No email notification issues' : summary.shopStatus === 'setup_required' ? 'Email notifications need support — contact WebM8' : 'Some email notifications need attention'}. ${summary.counts.delivered} delivered · ${summary.counts.awaitingDelivery} awaiting confirmation · ${summary.counts.emailAttention} need attention. Checked ${when(summary.checkedAt)}.` : 'Email status is temporarily unavailable. Your saved requests are listed below.';
    $('requests-count').textContent = list.length >= 50 ? 'Latest 50'
      : list.length ? `${list.length} ${list.length === 1 ? 'request' : 'requests'}` : '';
    if (!list.length) {
      $('requests').innerHTML = '<li class="empty">No requests yet. New ones are emailed to the shop and listed here.</li>';
      return;
    }
    const money = (n, currency) => new Intl.NumberFormat('en-GB', { style: 'currency', currency, currencyDisplay: 'narrowSymbol' }).format(n);
    $('requests').innerHTML = list.map((r) => {
      const pays = r.side === 'buy' ? money(r.amount, 'GBP') : money(r.amount, r.currency);
      const gets = r.estimate == null ? '' : ` for about ${r.side === 'buy' ? money(r.estimate, r.currency) : money(r.estimate, 'GBP')}`;
      const collect = new Date(`${r.date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
      return `
        <li class="request">
          <div class="request__top"><span class="request__ref">${escape(r.ref)}</span><span>Received ${when(r.at)}</span></div>
          <p class="request__what">${r.side === 'buy' ? 'Buy' : 'Sell'} ${escape(r.currency)}: ${escape(pays)}${escape(gets)}</p>
          <p>Collect ${escape(collect)}</p>
          ${r.delivery ? `<p class="request__delivery"><strong>Shop email: ${escape(({queued:'Waiting to send',retrying:'Not sent yet — retrying automatically',accepted:'Sent — awaiting delivery confirmation',delivered:'Delivered to the shop’s email provider',delayed:'Delivery delayed',failed:'Could not be sent — contact WebM8',bounced:'Rejected by the shop’s email provider',complained:'Reported as spam',suppressed:'Notification blocked — contact WebM8',manual_review:'Could not confirm sending — contact WebM8'})[r.delivery.status] || 'Status unavailable')}</strong>${r.delivery.deliveredAt ? ` · ${escape(when(r.delivery.deliveredAt))}` : ''}${r.delivery.handledAt ? `<br>Customer contacted ${escape(when(r.delivery.handledAt))}` : ''}</p>
          <div class="request__actions">${['queued','retrying'].includes(r.delivery.status) ? `<button class="button button--small" type="button" data-delivery-action="retry" data-request-id="${escape(r.id)}">Retry email notification</button>` : ''}${!r.delivery.handledAt && r.delivery.status !== 'delivered' ? `<button class="button button--small" type="button" data-delivery-action="handled" data-request-id="${escape(r.id)}">Mark customer contacted</button>` : ''}</div>` : '<p class="note">Email tracking is not available for this older request.</p>'}
          <p class="request__who">
            <span>${escape(r.name)}</span>
            <a href="tel:${escape(r.phone)}">${escape(r.phone)}</a>
            ${r.email ? `<a href="mailto:${escape(r.email)}">${escape(r.email)}</a>` : ''}
          </p>
        </li>`;
    }).join('');
  }

  function render() {
    renderSetup();
    renderNotes();
    renderRows();
    renderRequests();
  }

  /* ---------- Editing ---------- */

  function checkRow(code) {
    const row = rows.querySelector(`[data-code="${code}"]`);
    const edit = edits[code];
    row.classList.toggle('is-changed', Boolean(edit));
    row.querySelector('[data-chip="edited"]').hidden = !edit;

    const warn = $(`${code}-warn`);
    if (!edit) {
      warn.textContent = '';
      return { ok: true, far: false };
    }
    if (!isRate(edit.sell) || !isRate(edit.buy)) {
      warn.textContent = 'Enter both rates as numbers, like 1.1732.';
      return { ok: false, far: false };
    }
    const sell = Number(edit.sell);
    const buy = Number(edit.buy);
    const no1 = state.board.auto[code];
    const far = no1 && ['sell', 'buy'].some((side) => Math.abs(Number(edit[side]) / no1[side] - 1) > FAR_FROM_NO1);
    const notes = [];
    if (far) notes.push('More than 10% away from No1’s rate. Check it’s right.');
    if (sell >= buy) notes.push('We sell is usually lower than We buy, otherwise you lose on each exchange.');
    warn.textContent = notes.join(' ');
    return { ok: true, far };
  }

  function updateSavebar() {
    const codes = Object.keys(edits);
    $('savebar').hidden = !codes.length;
    if (!codes.length) return;
    const invalid = codes.some((code) => !checkRow(code).ok);
    $('savebar-text').textContent = invalid
      ? 'Fix the highlighted rates to save.'
      : `${codes.length} ${codes.length === 1 ? 'currency' : 'currencies'} changed: ${codes.join(', ')}`;
    $('save').disabled = invalid;
  }

  rows.addEventListener('input', (event) => {
    const input = event.target.closest('input[data-code]');
    if (!input) return;
    const code = input.dataset.code;
    const current = state.board.rates[code] ?? {};
    const sell = $(`${code}-sell`).value.trim();
    const buy = $(`${code}-buy`).value.trim();
    const unchanged = sell === fmt(current.sell) && buy === fmt(current.buy);
    if (unchanged) delete edits[code];
    else edits[code] = { sell, buy };
    checkRow(code);
    updateSavebar();
  });

  rows.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-use]');
    if (!button) return;
    const code = button.dataset.use;
    button.disabled = true;
    try {
      delete edits[code];
      showAdmin(await api('/api/admin/rates', { action: 'reset', codes: [code] }));
      toast(`${code} is back on No1’s rate.`);
    } catch (error) {
      toast(error.message);
      button.disabled = false;
    }
  });

  $('save').addEventListener('click', async () => {
    const codes = Object.keys(edits);
    if (codes.some((code) => checkRow(code).far)
      && !window.confirm('Some prices are more than 10% away from No1’s. Save them anyway?')) return;

    const payload = Object.fromEntries(codes.map((code) => [code, { sell: Number(edits[code].sell), buy: Number(edits[code].buy) }]));
    $('save').disabled = true;
    try {
      const next = await api('/api/admin/rates', { action: 'save', rates: payload });
      edits = {};
      showAdmin(next);
      toast('Saved. The website shows your prices within a minute.');
    } catch (error) {
      toast(error.message);
    } finally {
      $('save').disabled = false;
    }
  });

  $('discard').addEventListener('click', () => {
    edits = {};
    renderRows();
  });

  $('reset-all').addEventListener('click', async () => {
    if (!window.confirm('Put every currency back on No1’s rates now?')) return;
    try {
      edits = {};
      showAdmin(await api('/api/admin/rates', { action: 'reset' }));
      toast('All currencies are back on No1’s rates.');
    } catch (error) {
      toast(error.message);
    }
  });

  $('refresh').addEventListener('click', async (event) => {
    event.target.disabled = true;
    try {
      const next = await api('/api/admin/rates', { action: 'refresh' });
      showAdmin(next);
      toast('Pulled No1’s latest rates. Your own prices stay until 9:00am.');
    } catch (error) {
      toast(error.message);
    } finally {
      event.target.disabled = false;
    }
  });

  /* ---------- Sign in and out ---------- */

  $('login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.target.querySelector('button');
    $('login-error').textContent = '';
    button.disabled = true;
    try {
      await api('/api/admin/login', { password: $('password').value });
      $('password').value = '';
      showAdmin(await api('/api/admin/state'));
    } catch (error) {
      $('login-error').textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });

  $('sign-out').addEventListener('click', async () => {
    await api('/api/admin/logout', {}).catch(() => {});
    showLogin();
  });

  window.addEventListener('beforeunload', (event) => {
    if (Object.keys(edits).length) event.preventDefault();
  });

  $('refresh-requests').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const next = await api('/api/admin/state');
      state.reservations = next.reservations; state.delivery = next.delivery;
      renderRequests();
    } catch (error) { $('delivery-action-status').textContent = error.message; }
    finally { button.disabled = false; }
  });
  $('requests').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-delivery-action]');
    if (!button || button.disabled) return;
    button.disabled = true;
    $('delivery-action-status').textContent = 'Updating delivery…';
    try {
      const result = await api('/api/admin/delivery', { id: button.dataset.requestId, action: button.dataset.deliveryAction });
      const record = state.reservations.find(r => r.id === button.dataset.requestId);
      if (record) record.delivery = result.delivery;
      const next = await api('/api/admin/state');
      state.reservations = next.reservations; state.delivery = next.delivery;
      renderRequests();
      $('delivery-action-status').textContent = button.dataset.deliveryAction === 'handled'
        ? 'Recorded that the customer was contacted. Email delivery status is unchanged.'
        : 'Delivery checked. See the current status on the request.';
    } catch (error) { $('delivery-action-status').textContent = error.message; }
    finally { if (button.isConnected) button.disabled = false; }
  });

  api('/api/admin/state').then(showAdmin).catch(() => showLogin());
})();
