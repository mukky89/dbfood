(function () {
  'use strict';
  // Christmas Eve starts at midnight in Slovakia (CET), regardless of viewer timezone.
  function christmasRemaining(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Bratislava', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(now);
    const date = Object.fromEntries(parts.map(part => [part.type, part.value]));
    const festive = date.month === '12' && +date.day >= 24 && +date.day <= 26;
    const year = +date.year + (date.month === '12' && +date.day > 26 ? 1 : 0);
    const target = new Date(`${year}-12-24T00:00:00+01:00`);
    const seconds = Math.max(0, Math.ceil((target - now) / 1000));
    return { festive, days: Math.floor(seconds / 86400), hours: Math.floor(seconds / 3600) % 24,
      minutes: Math.floor(seconds / 60) % 60, seconds: seconds % 60 };
  }
  if (typeof module === 'object' && module.exports) module.exports = christmasRemaining;
  if (typeof document === 'undefined') return;
  const panel = document.getElementById('christmas-countdown');
  if (!panel) return;
  function render() {
    const value = christmasRemaining();
    panel.hidden = false;
    document.getElementById('christmas-label').textContent = value.festive ? 'Krásne Vianoce!' : 'Do Štedrého dňa';
    panel.querySelector('.christmas-units').hidden = value.festive;
    panel.setAttribute('aria-label', value.festive ? 'Krásne Vianoce!' :
      `Do Štedrého dňa: ${value.days} dní, ${value.hours} hodín, ${value.minutes} minút, ${value.seconds} sekúnd`);
    for (const unit of ['days', 'hours', 'minutes', 'seconds']) {
      document.getElementById('christmas-' + unit).textContent = String(value[unit]).padStart(2, '0');
    }
  }
  let timer;
  function resume() {
    clearInterval(timer);
    if (!document.hidden) { render(); timer = setInterval(render, 1000); }
  }
  document.addEventListener('visibilitychange', resume);
  window.addEventListener('pageshow', resume);
  window.addEventListener('pagehide', () => clearInterval(timer));
  resume();
})();
