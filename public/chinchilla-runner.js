(function () {
  'use strict';
  const runner = document.getElementById('chinchilla-runner');
  if (!runner || location.pathname.startsWith('/admin')) return;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let timer = null;
  const random = (min, max) => min + Math.random() * (max - min);
  function stop() {
    clearTimeout(timer); timer = null;
    runner.hidden = true; runner.classList.remove('running');
  }
  function schedule(first = false) {
    stop();
    if (document.hidden || reducedMotion.matches) return;
    timer = setTimeout(run, first ? random(8000, 16000) : random(35000, 80000));
  }
  function run() {
    if (document.hidden || reducedMotion.matches) { stop(); return; }
    const duration = random(4200, 6200);
    runner.dataset.direction = Math.random() < .5 ? 'left' : 'right';
    runner.style.bottom = `${Math.round(random(70, Math.min(180, innerHeight * .25)))}px`;
    runner.style.setProperty('--run-duration', `${duration}ms`);
    runner.hidden = false; runner.classList.add('running');
    timer = setTimeout(() => schedule(), duration + 100);
  }
  document.addEventListener('visibilitychange', () => schedule());
  reducedMotion.addEventListener('change', () => schedule());
  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', () => schedule(true));
  schedule(true);
})();
