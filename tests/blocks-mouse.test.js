const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { Game } = require('../public/blocks-engine');

function fixture() {
  const nodes = new Map();
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
    setTimeout: () => 1, clearTimeout() {}, MutationObserver: class { observe() {} }
  });
  const canvas = node('blocks-canvas');
  const fire = (type, overrides = {}) => {
    const event = { pointerType: 'mouse', button: 0, clientX: 200,
      preventDefault() { this.prevented = true; }, stopPropagation() {}, ...overrides };
    canvas.handlers[type](event); return event;
  };
  return { game, node, fire, document, start: () => node('blocks-start').handlers.click() };
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
  assert.equal(f.game.board.flat().filter(Boolean).length, 3);
  assert.ok(f.game.score > 0);
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
