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

    updateEstimate();
    picker.refresh();

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

  /* ---------- Currency picker ----------
     Replaces the currency select with a list showing flags and today's rate. The select stays in the
     form, hidden, and holds the value. Phones get a sheet from the bottom; wider screens a dropdown. */
  const picker = (() => {
    const select = form.elements.currency;
    const label = document.getElementById('r-currency-label');
    const sheetMode = window.matchMedia('(max-width: 559px)');
    const items = [...select.options].map((o) => ({ code: o.value, name: o.dataset.name, flag: o.dataset.flag }));

    const icon = (id, cls) => `<svg class="${cls}" aria-hidden="true"><use href="#${id}" /></svg>`;
    const flag = (item) =>
      `<img class="flag" src="https://cdn.jsdelivr.net/npm/flag-icons@7.5.0/flags/4x3/${item.flag}.svg" width="24" height="18" alt="">`;

    const wrap = document.createElement('div');
    wrap.className = 'picker';
    wrap.innerHTML = `<button type="button" class="picker__button" id="r-currency-button" data-analytics-id="reservation-open-currencies" role="combobox"
      aria-haspopup="listbox" aria-expanded="false" aria-controls="r-currency-list"
      aria-labelledby="r-currency-label r-currency-button"></button>`;
    const button = wrap.firstElementChild;

    const popup = document.createElement('div');
    popup.className = 'picker__popup';
    popup.innerHTML = `
      <div class="picker__head">
        <p class="picker__title">Choose a currency</p>
        <button type="button" class="picker__close" data-analytics-id="reservation-close-currencies" aria-label="Close currency list">${icon('i-close', '')}</button>
      </div>
      <div class="picker__cols" aria-hidden="true"><span>Currency</span><span class="picker__cols-rate"></span></div>
      <ul class="picker__list" id="r-currency-list" role="listbox" aria-labelledby="r-currency-label">
        ${items.map((item) => `<li class="picker__option" id="r-currency-${item.code}" data-analytics-id="reservation-currency-${item.code.toLowerCase()}" role="option" aria-selected="false">${flag(item)}<span class="picker__code">${item.code}</span><span class="picker__name">${item.name}</span><span class="picker__rate"></span>${icon('i-check', 'picker__check')}</li>`).join('')}
      </ul>`;
    wrap.append(popup);

    const backdrop = document.createElement('div');
    backdrop.className = 'picker__backdrop';
    backdrop.dataset.analyticsId = 'reservation-dismiss-currencies';
    document.body.append(backdrop);

    select.hidden = true;
    select.dataset.control = button.id;
    label.removeAttribute('for');
    label.addEventListener('click', () => button.focus());
    select.after(wrap);

    const list = popup.querySelector('.picker__list');
    const options = [...list.children];
    const colsRate = popup.querySelector('.picker__cols-rate');
    let isOpen = false;
    let active = 0;
    let fromKey = false;
    let typed = '';
    let typedAt = 0;

    const current = () => Math.max(0, items.findIndex((item) => item.code === select.value));

    const render = () => {
      const item = items[current()];
      button.innerHTML = `${flag(item)}<span class="picker__code">${item.code}</span><span class="picker__name">${item.name}</span>${icon('i-chevron', 'picker__chevron')}`;
      options.forEach((li, i) => li.setAttribute('aria-selected', String(i === current())));
    };

    /** Shows the rate that applies to the chosen side: our sell rate when buying, our buy rate when selling. */
    const refresh = () => {
      const side = form.elements.side.value;
      popup.dataset.side = side;
      colsRate.textContent = rates ? (side === 'buy' ? 'We sell' : 'We buy') : '';
      options.forEach((li, i) => {
        const rate = rates && rates[items[i].code];
        li.querySelector('.picker__rate').textContent = rate ? rate[side === 'buy' ? 'sell' : 'buy'].toFixed(4) : '';
      });
    };

    const setActive = (index) => {
      active = Math.min(Math.max(index, 0), items.length - 1);
      options.forEach((li, i) => li.classList.toggle('is-active', i === active));
      button.setAttribute('aria-activedescendant', options[active].id);
      const li = options[active];
      if (li.offsetTop < list.scrollTop) list.scrollTop = li.offsetTop;
      else if (li.offsetTop + li.offsetHeight > list.scrollTop + list.clientHeight) {
        list.scrollTop = li.offsetTop + li.offsetHeight - list.clientHeight;
      }
    };

    const place = () => {
      const sheet = sheetMode.matches;
      popup.classList.toggle('is-sheet', sheet);
      popup.classList.remove('is-up');
      if (sheet) {
        if (popup.parentNode !== document.body) document.body.append(popup);
        return;
      }
      if (popup.parentNode !== wrap) wrap.append(popup);
      // Open upwards when the list wouldn't fit below the field but would above it.
      const box = button.getBoundingClientRect();
      const height = popup.offsetHeight;
      if (box.bottom + height + 16 > window.innerHeight && box.top - height - 16 > 0) popup.classList.add('is-up');
    };

    const open = (index = current()) => {
      if (isOpen) return;
      isOpen = true;
      place();
      void popup.offsetWidth;
      popup.classList.add('is-open');
      wrap.classList.add('is-open');
      button.setAttribute('aria-expanded', 'true');
      if (popup.classList.contains('is-sheet')) {
        backdrop.classList.add('is-open');
        root.classList.add('is-locked');
      }
      setActive(index);
    };

    const close = () => {
      if (!isOpen) return;
      isOpen = false;
      popup.classList.remove('is-open');
      wrap.classList.remove('is-open');
      backdrop.classList.remove('is-open');
      root.classList.remove('is-locked');
      button.setAttribute('aria-expanded', 'false');
      button.removeAttribute('aria-activedescendant');
    };

    const choose = (index) => {
      const changed = items[index].code !== select.value;
      select.value = items[index].code;
      render();
      close();
      if (changed) {
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    };

    // Keyboard clicks are handled on keydown, so the click that follows Enter or Space is skipped.
    button.addEventListener('click', () => {
      if (fromKey) {
        fromKey = false;
        return;
      }
      if (isOpen) close();
      else open();
    });
    button.addEventListener('keyup', () => setTimeout(() => { fromKey = false; }));

    button.addEventListener('keydown', (event) => {
      const { key } = event;
      const last = items.length - 1;
      const moves = { ArrowDown: active + 1, ArrowUp: active - 1, Home: 0, End: last, PageDown: active + 5, PageUp: active - 5 };

      if (key === 'Enter' || key === ' ') {
        event.preventDefault();
        fromKey = true;
        if (isOpen) choose(active);
        else open();
        return;
      }
      if (!isOpen) {
        if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Home' || key === 'End') {
          event.preventDefault();
          open(key === 'Home' ? 0 : key === 'End' ? last : current());
          return;
        }
      } else if (key === 'ArrowUp' && event.altKey) {
        event.preventDefault();
        choose(active);
        return;
      } else if (key in moves) {
        event.preventDefault();
        setActive(moves[key]);
        return;
      } else if (key === 'Escape') {
        event.preventDefault();
        close();
        return;
      } else if (key === 'Tab') {
        choose(active);
        return;
      }

      // Type to jump: "c" goes to CAD, "ch" to CHF, "swiss" to CHF.
      if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const now = Date.now();
        typed = now - typedAt > 800 ? key.toLowerCase() : typed + key.toLowerCase();
        typedAt = now;
        const match = items.findIndex((item) =>
          item.code.toLowerCase().startsWith(typed) || item.name.toLowerCase().startsWith(typed));
        if (match < 0) return;
        if (isOpen) setActive(match);
        else open(match);
      }
    });

    // Keep focus on the button while the list is used with a mouse.
    popup.addEventListener('mousedown', (event) => event.preventDefault());
    list.addEventListener('pointermove', (event) => {
      const li = event.target.closest('[role="option"]');
      if (li && event.pointerType === 'mouse') setActive(options.indexOf(li));
    });
    list.addEventListener('click', (event) => {
      const li = event.target.closest('[role="option"]');
      if (li) choose(options.indexOf(li));
    });
    popup.querySelector('.picker__close').addEventListener('click', close);
    document.addEventListener('pointerdown', (event) => {
      if (isOpen && !wrap.contains(event.target) && !popup.contains(event.target)) close();
    });
    sheetMode.addEventListener('change', close);

    // Drag the sheet's top edge down to dismiss it.
    const head = popup.querySelector('.picker__head');
    let dragFrom = null;
    head.addEventListener('pointerdown', (event) => {
      if (!popup.classList.contains('is-sheet') || event.target.closest('button')) return;
      dragFrom = event.clientY;
      try {
        head.setPointerCapture(event.pointerId);
      } catch {
        // The pointer is already gone; the drag still works while it stays over the header.
      }
      popup.classList.add('is-dragging');
    });
    head.addEventListener('pointermove', (event) => {
      if (dragFrom !== null) popup.style.translate = `0 ${Math.max(0, event.clientY - dragFrom)}px`;
    });
    const endDrag = (event) => {
      if (dragFrom === null) return;
      const distance = event.clientY - dragFrom;
      dragFrom = null;
      popup.classList.remove('is-dragging');
      popup.style.translate = '';
      if (distance > 70) close();
    };
    head.addEventListener('pointerup', endDrag);
    head.addEventListener('pointercancel', endDrag);

    form.addEventListener('change', (event) => {
      if (event.target.name === 'side') refresh();
    });
    form.addEventListener('reset', () => setTimeout(() => {
      render();
      refresh();
    }));

    render();
    refresh();
    return { refresh };
  })();

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
    // The currency select is hidden; its picker button carries the error instead.
    const control = document.getElementById(input.dataset.control) || input;
    const field = input.closest('.field');
    let note = field.querySelector('.field__error');
    if (!message) {
      control.removeAttribute('aria-invalid');
      control.removeAttribute('aria-describedby');
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
    control.setAttribute('aria-invalid', 'true');
    control.setAttribute('aria-describedby', note.id);
  };

  const clearErrors = () => {
    Object.keys(fieldMessages).forEach((name) => setFieldError(name, ''));
    status.textContent = '';
  };

  form.addEventListener('input', (event) => {
    const { name, dataset } = event.target;
    const control = document.getElementById(dataset.control) || event.target;
    if (control.getAttribute('aria-invalid')) setFieldError(name, '');
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
    if (submit.disabled) return;
    window.WebM8Analytics?.form('currency_reservation', 'submit', { step: 1, steps: 1 });
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
      window.WebM8Analytics?.form('currency_reservation', 'submission_error', { code: 'invalid' });
      firstBad.focus();
      return;
    }

    setBusy(true);
    try {
      const token = await getToken();
      if (check.siteKey && !token) {
        window.WebM8Analytics?.form('currency_reservation', 'submission_error', { code: 'unavailable' });
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
        window.WebM8Analytics?.form('currency_reservation', 'submission_error', { code: response.status === 429 ? 'unavailable' : 'server' });
        resetCheck();
        if (result.errors) {
          Object.entries(result.errors).forEach(([name, message]) => setFieldError(name, message));
          const bad = form.querySelector('[aria-invalid="true"]');
          if (bad) bad.focus();
        }
        status.textContent = result.error || 'We couldn’t send your request. Please try again, or call us on 020 8951 1500.';
        return;
      }

      window.WebM8Analytics?.form('currency_reservation', 'success', { step: 1, steps: 1 });
      document.getElementById('r-ref').textContent = result.ref;
      const phone = form.elements.phone.value.trim();
      document.getElementById('r-next').textContent = result.customerEmailed
        ? `We’ll call you on ${phone} to confirm, and we’ve emailed you a copy.`
        : `We’ll call you on ${phone} to confirm the rate and collection time.`;
      if (result.emailPending) document.getElementById('r-next').textContent += ' The shop’s email alert is delayed. For urgent collection, please call 020 8951 1500.';
      form.hidden = true;
      done.hidden = false;
      done.focus();
    } catch {
      resetCheck();
      window.WebM8Analytics?.form('currency_reservation', 'submission_error', { code: 'network' });
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
