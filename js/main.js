(() => {
  'use strict';

  const root = document.documentElement;
  root.classList.add('js');
  const startedAt = Date.now();

  /* ---------- Header: shadow, scroll progress, hero parallax ---------- */
  const header = document.querySelector('.site-header');
  const hero = document.querySelector('.hero');
  let ticking = false;

  const onScroll = () => {
    ticking = false;
    const y = window.scrollY;
    header.classList.toggle('is-scrolled', y > 4);
    const max = root.scrollHeight - window.innerHeight;
    header.style.setProperty('--progress', max > 0 ? (y / max).toFixed(4) : 0);
    hero.style.setProperty('--hero-p', Math.min(y / hero.offsetHeight, 1).toFixed(4));
  };
  onScroll();
  window.addEventListener('scroll', () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(onScroll);
    }
  }, { passive: true });

  /* ---------- Mobile menu ---------- */
  const toggle = document.querySelector('.menu-toggle');
  const nav = document.getElementById('site-nav');
  const desktop = window.matchMedia('(min-width: 880px)');

  const setMenu = (open) => {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.querySelector('.sr-only').textContent = open ? 'Close menu' : 'Menu';
    nav.classList.toggle('is-open', open);
  };

  toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
  nav.addEventListener('click', (event) => {
    if (event.target.closest('a')) setMenu(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && nav.classList.contains('is-open')) {
      setMenu(false);
      toggle.focus();
    }
  });
  document.addEventListener('click', (event) => {
    if (nav.classList.contains('is-open') && !header.contains(event.target)) setMenu(false);
  });
  desktop.addEventListener('change', (event) => {
    if (event.matches) setMenu(false);
  });

  /* ---------- Scroll reveals ---------- */
  const board = document.getElementById('board');
  const revealer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add(entry.target === board ? 'is-live' : 'is-in');
      revealer.unobserve(entry.target);
    });
  }, { threshold: 0.2, rootMargin: '0px 0px -8% 0px' });
  document.querySelectorAll('[data-reveal]').forEach((el) => revealer.observe(el));

  /* ---------- Rates board ----------
     /api/rates mirrors No1's rates from 9:00am each day, with any owner prices on top.
     If it fails, or its rates are more than MAX_AGE_DAYS old, the board keeps its "Ask us" cells. */
  const MAX_AGE_DAYS = 3;
  const stamp = document.getElementById('rates-stamp');
  let rates = null;

  const digits = (value) => {
    let i = 0;
    return value.toFixed(4).split('').map((ch) => {
      if (ch === '.') return '<span>.</span>';
      const reel = '0123456789'.split('').map((n) => `<span>${n}</span>`).join('');
      return `<span class="digit"><span class="digit__reel" style="--d: ${ch}; --i: ${i++}">${reel}</span></span>`;
    }).join('');
  };

  const showRates = (data) => {
    if (!data.updated) return;
    const updated = new Date(data.updated);
    if (!((Date.now() - updated.getTime()) / 864e5 <= MAX_AGE_DAYS)) return;

    rates = data.rates;
    board.querySelectorAll('tbody tr').forEach((row) => {
      const rate = rates[row.dataset.code];
      if (!rate) return;
      row.querySelectorAll('[data-rate]').forEach((cell) => {
        const value = rate[cell.dataset.rate];
        cell.classList.add('has-digits');
        cell.innerHTML = `<span class="sr-only">${value.toFixed(4)}</span><span aria-hidden="true">${digits(value)}</span>`;
      });
    });

    const day = updated.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    const time = updated.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(' ', '');
    stamp.textContent = `Updated ${day}, ${time}`;
    stamp.classList.add('is-live');
    updateEstimate();

    // Rates arrived after the board was already on screen: replay the roll.
    if (board.classList.contains('is-live')) {
      board.classList.remove('is-live');
      void board.offsetWidth;
      board.classList.add('is-live');
    }
  };

  /* ---------- Reserve form ---------- */
  const form = document.getElementById('reserve-form');
  const done = document.getElementById('r-done');
  const unit = document.getElementById('r-unit');
  const estimate = document.getElementById('r-estimate');
  const status = document.getElementById('r-status');
  const submit = form.querySelector('.reserve__submit');
  const submitLabel = form.querySelector('.reserve__submit-label');
  const dateInput = document.getElementById('r-date');
  const money = (n) => n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const isoDay = (date) => new Date(date.getTime() - date.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  dateInput.min = isoDay(new Date());
  dateInput.max = isoDay(new Date(Date.now() + 30 * 864e5));

  function updateEstimate() {
    const side = form.elements.side.value;
    const code = form.elements.currency.value;
    const amount = parseFloat(form.elements.amount.value);
    unit.textContent = side === 'buy' ? 'in £' : `in ${code}`;

    const rate = rates && rates[code];
    if (!rate || !(amount > 0)) {
      estimate.textContent = '';
      return;
    }
    estimate.textContent = side === 'buy'
      ? `About ${money(amount * rate.sell)} ${code} at today’s rate.`
      : `About £${money(amount / rate.buy)} at today’s rate.`;
  }
  form.addEventListener('input', updateEstimate);

  /* Field messages: one per field, linked with aria-describedby. */
  const fieldMessages = {
    amount: 'Enter an amount.',
    date: 'Pick a collection day.',
    name: 'Enter your name.',
    phone: 'Enter a phone number we can call.',
    email: 'Check the email address, or leave it empty.',
  };

  const setFieldError = (name, message) => {
    const input = form.elements[name];
    if (!input || !input.id) return;
    const field = input.closest('.field');
    let note = field.querySelector('.field__error');
    if (!message) {
      input.removeAttribute('aria-invalid');
      input.removeAttribute('aria-describedby');
      if (note) note.remove();
      return;
    }
    if (!note) {
      note = document.createElement('p');
      note.className = 'field__error';
      note.id = `${input.id}-error`;
      field.append(note);
    }
    note.textContent = message;
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', note.id);
  };

  const clearErrors = () => {
    Object.keys(fieldMessages).forEach((name) => setFieldError(name, ''));
    status.textContent = '';
  };

  form.addEventListener('input', (event) => {
    if (event.target.getAttribute('aria-invalid')) setFieldError(event.target.name, '');
  });

  /* Cloudflare Turnstile, loaded as the form comes near the screen. It stays invisible unless
     Cloudflare needs the visitor to tick a box. */
  const check = { siteKey: null, widget: null, token: null, waiting: [] };

  const settleToken = (token) => {
    check.token = token;
    check.waiting.splice(0).forEach((resolve) => resolve(token));
  };

  const renderCheck = () => {
    check.widget = window.turnstile.render('#r-check', {
      sitekey: check.siteKey,
      action: 'reserve',
      theme: 'dark',
      size: 'flexible',
      appearance: 'interaction-only',
      callback: settleToken,
      'expired-callback': () => { check.token = null; },
      'error-callback': () => settleToken(null),
    });
  };

  const loadCheck = async () => {
    try {
      const config = await (await fetch('/api/config')).json();
      check.siteKey = config.turnstileSiteKey;
    } catch {
      return;
    }
    if (!check.siteKey) return;
    window.qceTurnstileReady = renderCheck;
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=qceTurnstileReady';
    script.async = true;
    document.head.append(script);
  };

  const checkLoader = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) {
      checkLoader.disconnect();
      loadCheck();
    }
  }, { rootMargin: '600px 0px' });
  checkLoader.observe(form);

  /** Resolves with a token, waiting up to 15 seconds for the check to finish. */
  const getToken = () => {
    if (!check.siteKey) return Promise.resolve(null);
    if (check.token) return Promise.resolve(check.token);
    return new Promise((resolve) => {
      check.waiting.push(resolve);
      setTimeout(() => resolve(null), 15000);
    });
  };

  const resetCheck = () => {
    check.token = null;
    if (window.turnstile && check.widget != null) window.turnstile.reset(check.widget);
  };

  const setBusy = (busy) => {
    submit.disabled = busy;
    submit.classList.toggle('is-busy', busy);
    submitLabel.textContent = busy ? 'Sending…' : 'Send request';
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors();

    // Browser-side checks first, so people see problems without a round trip.
    let firstBad = null;
    Object.keys(fieldMessages).forEach((name) => {
      const input = form.elements[name];
      if (!input.checkValidity()) {
        setFieldError(name, fieldMessages[name]);
        firstBad = firstBad || input;
      }
    });
    if (firstBad) {
      firstBad.focus();
      return;
    }

    setBusy(true);
    try {
      const token = await getToken();
      if (check.siteKey && !token) {
        status.textContent = 'We couldn’t run the quick bot check. Please try again in a moment.';
        resetCheck();
        return;
      }

      const data = Object.fromEntries(new FormData(form));
      const response = await fetch('/api/reserve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, startedAt, token }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.ok) {
        resetCheck();
        if (result.errors) {
          Object.entries(result.errors).forEach(([name, message]) => setFieldError(name, message));
          const bad = form.querySelector('[aria-invalid="true"]');
          if (bad) bad.focus();
        }
        status.textContent = result.error || 'We couldn’t send your request. Please try again, or call us on 020 8951 1500.';
        return;
      }

      document.getElementById('r-ref').textContent = result.ref;
      const phone = form.elements.phone.value.trim();
      document.getElementById('r-next').textContent = result.customerEmailed
        ? `We’ll call you on ${phone} to confirm, and we’ve emailed you a copy.`
        : `We’ll call you on ${phone} to confirm the rate and collection time.`;
      form.hidden = true;
      done.hidden = false;
      done.focus();
    } catch {
      resetCheck();
      status.textContent = 'You seem to be offline. Please try again, or call us on 020 8951 1500.';
    } finally {
      setBusy(false);
    }
  });

  document.getElementById('r-again').addEventListener('click', () => {
    form.reset();
    resetCheck();
    updateEstimate();
    done.hidden = true;
    form.hidden = false;
    form.elements.amount.focus();
  });

  /* ---------- Load rates ---------- */
  revealer.observe(board);
  fetch('/api/rates')
    .then((response) => (response.ok ? response.json() : Promise.reject()))
    .then(showRates)
    .catch(() => {});
})();
