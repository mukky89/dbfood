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
  let lockTimer = null, lockPiece = null, lockResets = 0, mouseColumn = null;
  function clearLock() { clearTimeout(lockTimer); lockTimer = null; }
  function syncLock(moved = false) {
    if (game.piece !== lockPiece) { clearLock(); lockPiece = game.piece; lockResets = 0; }
    if (mode !== 'playing' || !game.grounded) { clearLock(); return; }
    if (moved && lockTimer !== null && lockResets < 15) { clearLock(); lockResets++; }
    if (lockTimer !== null) return;
    lockTimer = setTimeout(() => {
      lockTimer = null;
      if (!visible()) { setMode('paused'); return; }
      if (mode === 'playing' && game.grounded) { update(game.lock()); schedule(); }
    }, 550);
  }
  function followMouse() {
    if (mouseColumn === null || !game.piece) return false;
    const target = mouseColumn - Math.floor(game.piece.shape[0].length / 2);
    let moved = false;
    while (game.piece.x !== target) {
      if (!game.move(Math.sign(target - game.piece.x))) break;
      moved = true;
    }
    return moved;
  }
  function visible() {
    return root.classList.contains('theme-blocks') && !document.hidden && !panel.hidden
      && !$('content').hidden && panel.getClientRects().length > 0;
  }
  function tile(x, y, color, ghost = false) {
    if (window.LunchFood) { window.LunchFood.drawTile(ctx, x, y, color, ghost); return; }
    ctx.fillStyle = ghost ? '#263545' : colors[color];
    ctx.fillRect(x * 30 + 2, y * 30 + 2, 26, 26);
    ctx.fillStyle = ghost ? '#496174' : '#ffffff55';
    ctx.fillRect(x * 30 + 3, y * 30 + 3, 24, 3);
  }
  function paint() {
    ctx.fillStyle = '#201c19'; ctx.fillRect(0, 0, 300, 600);
    ctx.strokeStyle = '#3b3128'; ctx.lineWidth = .6;
    for (let x = 0; x <= 10; x++) { ctx.beginPath(); ctx.moveTo(x * 30, 0); ctx.lineTo(x * 30, 600); ctx.stroke(); }
    for (let y = 0; y <= 20; y++) { ctx.beginPath(); ctx.moveTo(0, y * 30); ctx.lineTo(300, y * 30); ctx.stroke(); }
    game.board.forEach((row, y) => row.forEach((v, x) => { if (v) tile(x, y, v); }));
    if (game.piece) {
      const p = game.piece, gy = game.ghostY();
      p.shape.forEach((row, r) => row.forEach((v, c) => { if (v) tile(p.x + c, gy + r, p.color, true); }));
      p.shape.forEach((row, r) => row.forEach((v, c) => { if (v) tile(p.x + c, p.y + r, p.color); }));
    }
    $('score').textContent = game.score; $('lines').textContent = game.lines; $('level').textContent = game.level;
    const food = window.LunchFood && game.piece && window.LunchFood.foods[game.piece.color];
    if ($('food-name')) $('food-name').textContent = food ? `${food.icon} ${food.name}` : 'Dobrú chuť!';
  }
  function schedule() {
    clearTimeout(timer); timer = null;
    if (mode !== 'playing') return;
    if (!visible()) { setMode('paused'); return; }
    timer = setTimeout(() => {
      timer = null;
      if (!visible()) { setMode('paused'); return; }
      const cleared = game.step(false, false);
      update(cleared, followMouse()); schedule();
    }, game.interval);
  }
  function setMode(next) {
    mode = next; clearTimeout(timer); timer = null; clearLock(); mouseColumn = null;
    $('cover').hidden = next === 'playing';
    $('pause').disabled = next !== 'playing' && next !== 'paused';
    $('pause').textContent = next === 'paused' ? '▶' : 'Ⅱ';
    $('pause').setAttribute('aria-label', next === 'paused' ? 'Pokračovať v hre' : 'Pozastaviť hru');
    controls.forEach(button => { button.disabled = next !== 'playing'; });
    if (next === 'paused') {
      $('cover-title').textContent = 'Kuchynská pauza'; $('cover-text').textContent = 'Tvoje dobroty počkajú.';
      $('start').textContent = 'Pokračovať →'; $('status').textContent = 'Hra je pozastavená.';
    } else if (next === 'over') {
      $('cover-title').textContent = 'Koniec hry'; $('cover-text').textContent = `Tvoje skóre: ${game.score}. Dáme ďalšie kolo?`;
      $('start').textContent = 'Hrať znova →'; $('status').textContent = `Koniec hry. Skóre ${game.score}, riadky ${game.lines}.`;
      $('start').focus({ preventScroll: true });
    } else if (next === 'playing') {
      $('status').textContent = 'Zapĺňaj riadky. Každý sa počíta.'; schedule(); syncLock();
    }
  }
  function update(cleared, moved = false) {
    paint();
    if (game.over) setMode('over');
    else if (cleared) $('status').textContent = `Vymazané riadky: ${cleared}. Skóre ${game.score}.`;
    syncLock(moved);
  }
  function action(name) {
    if (mode !== 'playing' || !visible()) return;
    let cleared = 0, moved = false;
    if (name === 'left' || name === 'right' || name === 'down') mouseColumn = null;
    if (name === 'left') moved = game.move(-1);
    if (name === 'right') moved = game.move(1);
    if (name === 'rotate') moved = game.rotate();
    if (name === 'down') cleared = game.step(true, false);
    if (name === 'drop') {
      // Following the mouse can slide off a ledge. Finish falling in the same action.
      do {
        cleared += game.drop(false);
        moved = followMouse() || moved;
      } while (game.piece && !game.grounded);
      schedule();
    }
    update(cleared, moved);
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
    mouseColumn = column;
    update(0, followMouse());
  });
  canvas.addEventListener('pointerleave', () => { mouseColumn = null; });
  canvas.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'mouse' || mode !== 'playing' || !visible()) return;
    // Keep focus within the panel; clicking the canvas must not trigger focusout pause.
    event.preventDefault(); canvas.focus({ preventScroll: true });
    if (event.button === 0) { event.stopPropagation(); action('drop'); }
  });
  canvas.addEventListener('click', event => {
    // Real pointer clicks were handled on press, even if the pointer leaves before release.
    // Keep only keyboard/assistive activation here; never drop the next piece on release.
    if (!event.pointerType && event.detail === 0 && event.button === 0) action('drop');
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
