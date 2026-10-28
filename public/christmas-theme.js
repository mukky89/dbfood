/* Para a hlas pri fotografii; aktivujú sa iba vo vianočnej téme. */
(() => {
  const root = document.documentElement;
  const image = document.querySelector('.oblatky-promo img');
  if (!image) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'christmas-bakery';
  button.setAttribute('aria-label', 'Prehrať hlášku: Práve sa dopiekli čerstvé vianočné oblátky');
  button.setAttribute('aria-pressed', 'false');
  const video = document.createElement('video');
  video.className = 'bakery-video';
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = 'none';
  video.setAttribute('aria-hidden', 'true');
  video.setAttribute('tabindex', '-1');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let inView = false;
  const caption = document.createElement('span');
  caption.className = 'bakery-caption';
  caption.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14"/></svg><span>Vypočuť čerstvo upečenú hlášku</span>';
  const captionText = caption.querySelector('span');
  const status = document.createElement('span');
  status.className = 'sr-only';
  status.setAttribute('role', 'status');
  const audio = new Audio('/assets/christmas/vianocne-oblatky-sarah.mp3');
  audio.preload = 'none';
  let enabled = false;
  let playing = false;
  let playRequest = 0;

  function reset() {
    playing = false;
    button.classList.remove('is-playing');
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-label', 'Prehrať hlášku: Práve sa dopiekli čerstvé vianočné oblátky');
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
    captionText.textContent = 'Práve sa dopiekli čerstvé vianočné oblátky';
    try { await audio.play(); }
    catch (_) { if (request === playRequest && enabled) failed(); }
  });
  audio.addEventListener('ended', reset);
  audio.addEventListener('error', () => { if (enabled && playing) failed(); });
  function syncVideo() {
    if (!enabled || !inView || document.hidden || reducedMotion.matches || navigator.connection?.saveData) {
      video.pause();
      if (reducedMotion.matches) button.classList.remove('video-ready');
      return;
    }
    if (!video.getAttribute('src')) video.src = '/assets/christmas/trubicky-steam-loop.mp4';
    video.play().catch(() => button.classList.remove('video-ready'));
  }
  video.addEventListener('playing', () => button.classList.add('video-ready'));
  video.addEventListener('error', () => button.classList.remove('video-ready'));
  reducedMotion.addEventListener('change', syncVideo);
  const visibility = new IntersectionObserver(entries => {
    inView = entries[0].isIntersecting;
    syncVideo();
  });
  function syncTheme() {
    const next = root.classList.contains('theme-christmas');
    if (next === enabled) return;
    enabled = next;
    if (enabled) {
      image.replaceWith(button);
      button.append(image, video, caption);
      button.after(status);
      visibility.observe(button);
    } else {
      stop();
      video.pause();
      inView = false;
      visibility.unobserve(button);
      button.replaceWith(image);
      status.remove();
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    syncVideo();
  });
  window.addEventListener('pagehide', () => { stop(); video.pause(); });
  window.addEventListener('pageshow', syncVideo);
  new MutationObserver(syncTheme).observe(root, { attributes: true, attributeFilter: ['class'] });
  syncTheme();
})();
