(() => {
  'use strict';

  /* ---------- Header: shadow once the page scrolls ---------- */
  const header = document.querySelector('.site-header');
  const updateHeader = () => header.classList.toggle('is-scrolled', window.scrollY > 4);
  updateHeader();
  window.addEventListener('scroll', updateHeader, { passive: true });

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
})();
