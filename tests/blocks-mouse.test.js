const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { Game } = require('../public/blocks-engine');

function fixture() {
  const nodes = new Map();
  let now = 0, timerId = 0;
  const timers = new Map();
  function advance(ms) {
    const end = now + ms;
    while (true) {
      const next = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > end) break;
      now = next[1].at; timers.delete(next[0]); next[1].fn();
    }
    now = end;
  }
  function node(id) {
    if (!nodes.has(id)) nodes.set(id, {
      hidden: false, handlers: {}, dataset: {},
      addEventListener(type, fn) { this.handlers[type] = fn; },
      setAttribute() {}, focus() { this.focused = true; },
      getClientRects: () => [1], contains: () => true,
      getBoundingClientRect: () => ({ left: 100, width: 200 }),
      getContext: () => new Proxy({}, { get: () => () => {}, set: () => true }),
      querySelectorAll: () => [], classList: { contains: () => true }
    });
    return nodes.get(id);
  }
  let game;
  const document = { documentElement: node('root'), hidden: false,
    getElementById: node, addEventListener() {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../public/blocks-theme.js'), 'utf8'), {
    document, window: { LunchBlocks: { Game: class extends Game {
      constructor() { super(() => .5); game = this; }
    } }, addEventListener() {} },
    setTimeout: (fn, ms) => { timers.set(++timerId, { fn, at: now + ms }); return timerId; },
    clearTimeout: id => timers.delete(id), MutationObserver: class { observe() {} }
  });
  const canvas = node('blocks-canvas');
  const fire = (type, overrides = {}) => {
    const event = { pointerType: 'mouse', button: 0, clientX: 200,
      preventDefault() { this.prevented = true; }, stopPropagation() {}, ...overrides };
    canvas.handlers[type](event); return event;
  };
  return { game, node, fire, document, advance, start: () => node('blocks-start').handlers.click() };
}

test('mouse follows scaled canvas coordinates and stops at walls and obstacles', () => {
  const f = fixture(); f.start();
  f.game.piece = { x: 4, y: 3, color: 1, shape: [[1, 1]] };
  f.fire('pointermove', { clientX: 100 }); assert.equal(f.game.piece.x, 0);
  f.game.board[3][3] = 2;
  f.fire('pointermove', { clientX: 299 }); assert.equal(f.game.piece.x, 1);
  f.game.board[3][3] = 0;
  f.fire('pointermove', { clientX: 299 }); assert.equal(f.game.piece.x, 8);
});
test('right click rotates, left click drops exactly once, and canvas keeps focus', () => {
  const f = fixture(); f.start();
  f.game.piece = { x: 4, y: 3, color: 1, shape: [[1, 1, 1]] };
  assert.equal(f.fire('pointerdown').prevented, true);
  assert.equal(f.node('blocks-canvas').focused, true);
  f.fire('pointerdown', { button: 2 });
  assert.equal(f.game.board.flat().filter(Boolean).length, 0);
  assert.equal(f.fire('contextmenu', { button: 2 }).prevented, true);
  assert.deepEqual(f.game.piece.shape, [[1], [1], [1]]);
  assert.equal(f.game.board.flat().filter(Boolean).length, 0);
  f.fire('click');
  assert.equal(f.game.grounded, true);
  assert.equal(f.game.board.flat().filter(Boolean).length, 0);
  f.advance(550);
  assert.equal(f.game.board.flat().filter(Boolean).length, 3);
  assert.ok(f.game.score > 0);
});

function redOverhang(f) {
  f.game.board[18][3] = f.game.board[18][4] = 5;
  f.game.board[19][4] = f.game.board[19][5] = 5;
  f.game.piece = { x: 0, y: 17, color: 3, shape: [[0, 1, 0], [1, 1, 1]] };
}
test('held mouse target tucks T under the screenshot red overhang after falling', () => {
  const f = fixture(); f.start(); redOverhang(f);
  f.fire('pointermove', { clientX: 145 }); // target x=1, blocked at this height
  assert.equal(f.game.piece.x, 0);
  f.advance(700); // no new pointermove: retry the target after gravity
  assert.equal(f.game.piece.x, 1);
  assert.equal(f.game.piece.y, 18);
  f.advance(550);
  assert.deepEqual(f.game.board[19].slice(1, 6), [3, 3, 3, 5, 5]);
  assert.equal(f.game.board[18][3], 5); // the overhang is never overwritten
});
test('drop leaves time to slide under the overhang and then locks automatically', () => {
  const f = fixture(); f.start(); redOverhang(f);
  f.fire('click'); f.advance(400);
  assert.equal(f.game.piece.y, 18);
  f.fire('pointermove', { clientX: 145 });
  assert.equal(f.game.piece.x, 1);
  f.advance(549); assert.equal(f.game.board[19][3], 0);
  f.advance(1); assert.equal(f.game.board[19][3], 3);
});
test('dropping also retries a mouse target that was blocked above the overhang', () => {
  const f = fixture(); f.start(); redOverhang(f);
  f.fire('pointermove', { clientX: 145 });
  assert.equal(f.game.piece.x, 0);
  f.fire('click');
  assert.equal(f.game.piece.x, 1);
  assert.equal(f.game.piece.y, 18);
  f.advance(550); assert.equal(f.game.board[19][3], 3);
});
test('leaving canvas cancels held mouse target and pause cancels pending landing', () => {
  const f = fixture(); f.start(); redOverhang(f);
  f.fire('pointermove', { clientX: 145 }); f.fire('pointerleave'); f.advance(700);
  assert.equal(f.game.piece.x, 0);
  f.node('blocks-pause').handlers.click(); f.advance(2000);
  assert.equal(f.game.board[19][0], 0);
  f.start(); f.advance(550);
  assert.equal(f.game.board[19][0], 3);
});
test('repeated movement cannot postpone a landing forever', () => {
  const f = fixture(); f.start();
  f.game.piece = { x: 0, y: 18, color: 2, shape: [[1, 1], [1, 1]] };
  f.fire('click');
  for (let i = 0; i < 16; i++) {
    f.advance(100); f.fire('pointermove', { clientX: i % 2 ? 125 : 145 });
  }
  f.advance(550);
  assert.equal(f.game.board.flat().filter(Boolean).length, 4);
});
test('mouse does nothing before start, during pause, or when hidden; touch movement is ignored', () => {
  const f = fixture();
  const original = JSON.stringify(f.game.piece);
  f.fire('pointermove', { clientX: 100 }); f.fire('click'); f.fire('contextmenu');
  assert.equal(JSON.stringify(f.game.piece), original);
  f.start();
  const active = JSON.stringify(f.game.piece);
  f.fire('pointermove', { pointerType: 'touch', clientX: 100 });
  assert.equal(JSON.stringify(f.game.piece), active);
  f.document.hidden = true;
  f.fire('pointermove', { clientX: 100 }); f.fire('click'); f.fire('contextmenu');
  assert.equal(JSON.stringify(f.game.piece), active);
  f.document.hidden = false; f.node('blocks-pause').handlers.click();
  f.fire('pointermove', { clientX: 100 }); f.fire('click'); f.fire('contextmenu');
  assert.equal(JSON.stringify(f.game.piece), active);
});
