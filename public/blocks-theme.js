(function () {
  'use strict';
  const root = document.documentElement, panel = document.getElementById('blocks-game');
  if (!panel || !window.LunchBlocks) return;
  const $ = id => document.getElementById('blocks-' + id);
  const canvas = $('canvas'), ctx = canvas.getContext('2d');
  if (!ctx) { $('start').disabled = true; $('cover-text').textContent = 'Tento prehliadač nepodporuje hru.'; return; }
  const game = new window.LunchBlocks.Game();
  const controls = panel.querySelectorAll('[data-blocks-action]');
  const colors = ['', '#64d8dd', '#f3ce74', '#b39af7', '#8bd3ac', '#ec8896', '#83aff0', '#f3b47a'];
  let mode = 'idle', timer = null;
  function visible() {
    return root.classList.contains('theme-blocks') && !document.hidden && !panel.hidden
      && !$('content').hidden && panel.getClientRects().length > 0;
  }
  function tile(x, y, color, ghost = false) {
    ctx.fillStyle = ghost ? '#263545' : colors[color];
    ctx.fillRect(x * 30 + 2, y * 30 + 2, 26, 26);
    ctx.fillStyle = ghost ? '#496174' : '#ffffff55';
    ctx.fillRect(x * 30 + 3, y * 30 + 3, 24, 3);
  }
  function paint() {
    ctx.fillStyle = '#09111b'; ctx.fillRect(0, 0, 300, 600);
    ctx.strokeStyle = '#1b2b39'; ctx.lineWidth = .6;
    for (let x = 0; x <= 10; x++) { ctx.beginPath(); ctx.moveTo(x * 30, 0); ctx.lineTo(x * 30, 600); ctx.stroke(); }
    for (let y = 0; y <= 20; y++) { ctx.beginPath(); ctx.moveTo(0, y * 30); ctx.lineTo(300, y * 30); ctx.stroke(); }
    game.board.forEach((row, y) => row.forEach((v, x) => { if (v) tile(x, y, v); }));
    if (game.piece) {
      const p = game.piece, gy = game.ghostY();
      p.shape.forEach((row, r) => row.forEach((v, c) => { if (v) tile(p.x + c, gy + r, p.color, true); }));
      p.shape.forEach((row, r) => row.forEach((v, c) => { if (v) tile(p.x + c, p.y + r, p.color); }));
    }
    $('score').textContent = game.score; $('lines').textContent = game.lines; $('level').textContent = game.level;
  }
  function schedule() {
    clearTimeout(timer); timer = null;
    if (mode !== 'playing') return;
    if (!visible()) { setMode('paused'); return; }
    timer = setTimeout(() => {
      timer = null;
      if (!visible()) { setMode('paused'); return; }
      update(game.step()); schedule();
    }, game.interval);
  }
  function setMode(next) {
    mode = next; clearTimeout(timer); timer = null;
    $('cover').hidden = next === 'playing';
    $('pause').disabled = next !== 'playing' && next !== 'paused';
    $('pause').textContent = next === 'paused' ? '▶' : 'Ⅱ';
    $('pause').setAttribute('aria-label', next === 'paused' ? 'Pokračovať v hre' : 'Pozastaviť hru');
    controls.forEach(button => { button.disabled = next !== 'playing'; });
    if (next === 'paused') {
      $('cover-title').textContent = 'Pauza'; $('cover-text').textContent = 'Tvoje kocky počkajú.';
      $('start').textContent = 'Pokračovať →'; $('status').textContent = 'Hra je pozastavená.';
    } else if (next === 'over') {
      $('cover-title').textContent = 'Koniec hry'; $('cover-text').textContent = `Tvoje skóre: ${game.score}. Dáme ďalšie kolo?`;
      $('start').textContent = 'Hrať znova →'; $('status').textContent = `Koniec hry. Skóre ${game.score}, riadky ${game.lines}.`;
      $('start').focus({ preventScroll: true });
    } else if (next === 'playing') {
      $('status').textContent = 'Zapĺňaj riadky. Každý sa počíta.'; schedule();
    }
  }
  function update(cleared) {
    paint();
    if (game.over) setMode('over');
    else if (cleared) $('status').textContent = `Vymazané riadky: ${cleared}. Skóre ${game.score}.`;
  }
  function action(name) {
    if (mode !== 'playing' || !visible()) return;
    let cleared = 0;
    if (name === 'left') game.move(-1);
    if (name === 'right') game.move(1);
    if (name === 'rotate') game.rotate();
    if (name === 'down') cleared = game.step(true);
    if (name === 'drop') { cleared = game.drop(); schedule(); }
    update(cleared);
  }
  $('start').addEventListener('click', () => {
    if (!visible()) return;
    if (mode !== 'paused') game.reset();
    setMode('playing'); paint(); $('pause').focus({ preventScroll: true });
  });
  $('pause').addEventListener('click', () => {
    if (mode === 'playing') { setMode('paused'); $('start').focus({ preventScroll: true }); }
    else if (mode === 'paused' && visible()) setMode('playing');
  });
  controls.forEach(button => button.addEventListener('click', () => action(button.dataset.blocksAction)));
  // Mouse coordinates follow the displayed canvas size, including responsive scaling.
  canvas.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse' || mode !== 'playing' || !visible() || !game.piece) return;
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width) return;
    const column = Math.max(0, Math.min(9, Math.floor((event.clientX - bounds.left) * 10 / bounds.width)));
    const target = column - Math.floor(game.piece.shape[0].length / 2);
    // Move one cell at a time so the mouse cannot jump through occupied cells.
    while (game.piece.x !== target) {
      if (!game.move(Math.sign(target - game.piece.x))) break;
    }
    paint();
  });
  canvas.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'mouse' || mode !== 'playing' || !visible()) return;
    // Keep focus within the panel; clicking the canvas must not trigger focusout pause.
    event.preventDefault(); canvas.focus({ preventScroll: true });
  });
  canvas.addEventListener('click', event => {
    if (event.pointerType && event.pointerType !== 'mouse') return;
    if (event.button === 0) action('drop');
  });
  canvas.addEventListener('contextmenu', event => {
    if (mode !== 'playing' || !visible()) return;
    event.preventDefault(); event.stopPropagation(); action('rotate');
  });
  // Listen only inside the game: ordering inputs and page shortcuts keep their behavior.
  panel.addEventListener('keydown', event => {
    if (mode !== 'playing') return;
    const mapping = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'rotate', ArrowDown: 'down', ' ': 'drop' };
    if (mapping[event.key]) {
      event.preventDefault(); event.stopPropagation();
      if (!event.repeat || (event.key !== ' ' && event.key !== 'ArrowUp')) action(mapping[event.key]);
    } else if (event.key === 'Escape' || event.key.toLowerCase() === 'p') {
      event.preventDefault(); event.stopPropagation(); setMode('paused'); $('start').focus({ preventScroll: true });
    }
  });
  function pause() { if (mode === 'playing') setMode('paused'); }
  panel.addEventListener('focusout', event => { if (!panel.contains(event.relatedTarget)) pause(); });
  window.addEventListener('blur', pause);
  window.addEventListener('pagehide', pause);
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  $('collapse').addEventListener('click', () => {
    pause(); const collapsed = !$('content').hidden; $('content').hidden = collapsed;
    $('collapse').setAttribute('aria-expanded', String(!collapsed));
    $('collapse').setAttribute('aria-label', collapsed ? 'Rozbaliť hru' : 'Zbaliť hru');
    $('collapse').textContent = collapsed ? '+' : '−';
  });
  const observer = new MutationObserver(() => { if (!visible()) pause(); });
  observer.observe(root, { attributes: true, attributeFilter: ['class'] });
  observer.observe(document.getElementById('order-section'), { attributes: true, attributeFilter: ['style', 'hidden'] });
  paint(); // No game loop or audio until the user starts the game.
})();
