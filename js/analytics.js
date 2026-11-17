(() => {
  'use strict';
  const site = 'b135d664-b0e2-4c0b-813f-97705db8f4ec';
  const key = `webm8_consent_${site}`;
  let allowed = true;
  try { allowed = JSON.parse(localStorage.getItem(key) || 'null')?.allowed !== false; } catch {}
  const privacySignal = () => navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true;
  const enabled = () => allowed && !privacySignal();
  let loading = false;
  window.WebM8Privacy = { isAllowed: enabled };
  function sync() {
    window.WebM8Analytics?.consent(enabled());
    window.dispatchEvent(new Event('webm8:privacy'));
    const button = document.getElementById('privacy-toggle');
    button.disabled = privacySignal();
    button.setAttribute('aria-pressed', String(!enabled()));
    button.textContent = enabled() ? 'Turn off measurement & draft saving' : 'Turn on measurement & draft saving';
    document.getElementById('privacy-state').textContent = privacySignal()
      ? 'Measurement and draft saving are off because your browser requests privacy.'
      : enabled() ? 'Measurement and draft saving are on.' : 'Measurement and draft saving are off.';
    if (!enabled()) return;
    if (!window.WebM8Analytics && !loading) {
      loading = true;
      const script = document.createElement('script');
      script.src = 'https://webm8-platform.vercel.app/tracker.js';
      script.dataset.site = site;
      script.dataset.paths = '/,/index.html';
      script.onload = () => { loading = false; window.WebM8Analytics?.consent(enabled()); };
      script.onerror = () => { loading = false; };
      document.head.append(script);
    }
  }
  document.getElementById('privacy-toggle').addEventListener('click', () => {
    allowed = !allowed;
    try { localStorage.setItem(key, JSON.stringify({ allowed, expires: Date.now() + 180 * 86400000 })); } catch {}
    sync();
  });
  window.addEventListener('webm8:ready', sync);
  window.addEventListener('storage', event => {
    if (event.key !== key && event.key !== null) return;
    try { allowed = JSON.parse(localStorage.getItem(key) || 'null')?.allowed !== false; } catch { allowed = false; }
    sync();
  });
  sync();
})();
