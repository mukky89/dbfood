/* Para a hlas pri fotografii; aktivujú sa iba vo vianočnej téme. */
(() => {
  const root = document.documentElement;
  const image = document.querySelector('.oblatky-promo img');
  if (!image) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'christmas-bakery';
  button.setAttribute('aria-label', 'Prehrať hlášku: Práve sa dopieklo čerstvé pečivo');
  button.setAttribute('aria-pressed', 'false');
  const decoration = document.createElement('span');
  decoration.className = 'bakery-steam';
  decoration.setAttribute('aria-hidden', 'true');
  decoration.innerHTML = `<svg viewBox="0 0 600 400" preserveAspectRatio="none" focusable="false">
    <g fill="none" stroke="white" stroke-linecap="round">
      <path d="M180 290 C115 240 224 205 175 150 S200 80 173 30"/>
      <path d="M310 310 C240 255 355 218 300 165 S335 90 310 25"/>
      <path d="M425 280 C370 240 470 195 420 145 S450 70 420 15"/>
    </g>
  </svg>`;
  const caption = document.createElement('span');
  caption.className = 'bakery-caption';
  caption.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14"/></svg><span>Vypočuť čerstvo upečenú hlášku</span>';
  const captionText = caption.querySelector('span');
  const status = document.createElement('span');
  status.className = 'sr-only';
  status.setAttribute('role', 'status');
  const audio = new Audio('/assets/christmas/cerstve-pecivo.mp3');
  audio.preload = 'none';
  let enabled = false;
  let playing = false;
  let playRequest = 0;

  function reset() {
    playing = false;
    button.classList.remove('is-playing');
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-label', 'Prehrať hlášku: Práve sa dopieklo čerstvé pečivo');
    captionText.textContent = 'Vypočuť čerstvo upečenú hlášku';
  }
  function stop() {
    playRequest++;
    audio.pause();
    audio.currentTime = 0;
    reset();
  }
  function failed() {
    stop();
    status.textContent = 'Zvuk sa nepodarilo prehrať. Skúste kliknúť znova.';
    captionText.textContent = 'Zvuk nie je dostupný — skúsiť znova';
  }
  button.addEventListener('click', async () => {
    if (!enabled) return;
    if (playing) { stop(); return; }
    const request = ++playRequest;
    playing = true;
    status.textContent = '';
    button.classList.add('is-playing');
    button.setAttribute('aria-pressed', 'true');
    button.setAttribute('aria-label', 'Zastaviť hlášku');
    captionText.textContent = 'Práve sa dopieklo čerstvé pečivo';
    try { await audio.play(); }
    catch (_) { if (request === playRequest && enabled) failed(); }
  });
  audio.addEventListener('ended', reset);
  audio.addEventListener('error', () => { if (enabled && playing) failed(); });
  const visibility = new IntersectionObserver(entries => {
    button.classList.toggle('steam-paused', !entries[0].isIntersecting);
  });
  function syncTheme() {
    const next = root.classList.contains('theme-christmas');
    if (next === enabled) return;
    enabled = next;
    if (enabled) {
      image.replaceWith(button);
      button.append(image, decoration, caption);
      button.after(status);
      visibility.observe(button);
    } else {
      stop();
      visibility.unobserve(button);
      button.replaceWith(image);
      status.remove();
    }
  }
  document.addEventListener('visibilitychange', () => {
    button.classList.toggle('page-hidden', document.hidden);
    if (document.hidden) stop();
  });
  window.addEventListener('pagehide', stop);
  new MutationObserver(syncTheme).observe(root, { attributes: true, attributeFilter: ['class'] });
  syncTheme();
})();
