(() => {
  const layer = document.getElementById('spider-walkers');
  const toggle = document.getElementById('sm-sound-toggle');
  const premiereDays = document.getElementById('sm-premiere-days');
  if (!layer || !toggle) return;
  const spiderSvg = `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="#050b18" stroke-width="5" stroke-linecap="round"><path d="M25 27 11 16M22 34 6 34M25 41 11 53M39 27 53 16M42 34h16M39 41l14 12"/></g><ellipse cx="32" cy="36" rx="12" ry="16" fill="#111827"/><circle cx="32" cy="20" r="9" fill="#c1121f"/><path d="m27 19 3 3m7-3-3 3" stroke="#fff" stroke-width="2"/></svg>`;
  layer.innerHTML = Array.from({ length: 3 }, (_, i) =>
    `<button class="web-spider" type="button" aria-label="Pavúk ${i + 1} — vystreliť pavučinu">${spiderSvg}</button>`
  ).join('');
  let muted = localStorage.getItem('fob_spider_muted') === '1';
  let ctx;
  function sync() { toggle.classList.toggle('muted', muted); toggle.textContent = muted ? '🔇 MUTED' : '🔊 THWIP'; toggle.setAttribute('aria-pressed', String(muted)); }
  function thwip() {
    if (muted || !document.documentElement.classList.contains('theme-spiderman')) return;
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    const now = ctx.currentTime, osc = ctx.createOscillator(), gain = ctx.createGain(), filter = ctx.createBiquadFilter();
    osc.type = 'sawtooth'; osc.frequency.setValueAtTime(780, now); osc.frequency.exponentialRampToValueAtTime(120, now + .16);
    filter.type = 'bandpass'; filter.frequency.value = 1200; filter.Q.value = 1.8;
    gain.gain.setValueAtTime(.0001, now); gain.gain.exponentialRampToValueAtTime(.14, now + .012); gain.gain.exponentialRampToValueAtTime(.0001, now + .2);
    osc.connect(filter).connect(gain).connect(ctx.destination); osc.start(now); osc.stop(now + .21);
  }
  function shootWeb(spider) {
    const rect = spider.getBoundingClientRect();
    const sx = rect.left + rect.width / 2, sy = rect.top + rect.height / 2;
    const tx = Math.max(35, Math.min(innerWidth - 35, sx + (Math.random() * 360 - 180)));
    const ty = Math.max(35, Math.min(innerHeight - 35, sy + (Math.random() * 280 - 140)));
    const dx = tx - sx, dy = ty - sy;
    const web = document.createElement('span');
    web.className = 'spider-web-shot';
    web.style.setProperty('--sx', `${sx}px`); web.style.setProperty('--sy', `${sy}px`);
    web.style.setProperty('--length', `${Math.hypot(dx, dy)}px`);
    web.style.setProperty('--angle', `${Math.atan2(dy, dx)}rad`);
    document.body.appendChild(web);
    web.addEventListener('animationend', () => web.remove(), { once: true });
  }
  toggle.addEventListener('click', e => { e.stopPropagation(); muted = !muted; localStorage.setItem('fob_spider_muted', muted ? '1' : '0'); sync(); if (!muted) thwip(); });
  layer.addEventListener('click', e => {
    const spider = e.target.closest('.web-spider');
    if (!spider) return;
    e.stopPropagation(); thwip(); shootWeb(spider);
  });
  document.addEventListener('click', e => { if (e.target.closest('.theme-spiderman .menu-item,.theme-spiderman .btn-primary')) thwip(); });
  window.setupSpiderTheme = active => { sync(); if (active) document.addEventListener('pointerdown', () => { ctx ||= new (window.AudioContext || window.webkitAudioContext)(); }, {once:true}); };
  if (premiereDays) {
    const premiere = new Date('2026-07-31T00:00:00+02:00');
    const days = Math.max(0, Math.ceil((premiere - new Date()) / 86400000));
    premiereDays.textContent = days ? `${days} dní` : 'UŽ V KINÁCH';
  }
  sync();
})();
