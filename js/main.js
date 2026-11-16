(() => {
  'use strict';

  const root = document.documentElement;
  root.classList.add('js');

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
     Reads data/rates.json. If the file is missing or more than MAX_AGE_DAYS old the
     board keeps its "Ask us" cells, so an out-of-date rate is never shown. */
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
    const updated = new Date(data.updated);
    const age = (Date.now() - updated.getTime()) / 864e5;
    if (!(age <= MAX_AGE_DAYS)) return;

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

  /* ---------- Reserve form: writes the WhatsApp message ---------- */
  const WHATSAPP = '447933700410';
  const form = document.getElementById('reserve-form');
  const unit = document.getElementById('r-unit');
  const estimate = document.getElementById('r-estimate');
  const dateInput = document.getElementById('r-date');
  const money = (n) => n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const today = new Date();
  dateInput.min = new Date(today.getTime() - today.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);

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
      ? `About ${money(amount * rate.sell)} ${code} at today’s guide rate.`
      : `About £${money(amount / rate.buy)} at today’s guide rate.`;
  }

  form.addEventListener('input', updateEstimate);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const side = form.elements.side.value;
    const code = form.elements.currency.value;
    const amount = form.elements.amount.value;
    const date = new Date(`${dateInput.value}T12:00`).toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long',
    });
    const message = [
      'Hi Quick Stop, I’d like to reserve currency for collection.',
      `${side === 'buy' ? 'Buying' : 'Selling'}: ${code}`,
      `Amount: ${side === 'buy' ? `£${amount}` : `${amount} ${code}`}`,
      `Collection: ${date}`,
      `Name: ${form.elements.name.value.trim()}`,
    ].join('\n');
    window.open(`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
  });

  revealer.observe(board);
  fetch('data/rates.json', { cache: 'no-cache' })
    .then((response) => (response.ok ? response.json() : Promise.reject()))
    .then(showRates)
    .catch(() => {});
})();
