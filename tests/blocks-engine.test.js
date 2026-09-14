const test = require('node:test');
const assert = require('node:assert/strict');
const { Game } = require('../public/blocks-engine');

test('seven-bag gives every shape once, with independent piece matrices', () => {
  const game = new Game(() => 0.5), colors = [];
  for (let i = 0; i < 7; i++) { colors.push(game.piece.color); game.spawn(); }
  assert.equal(new Set(colors).size, 7);
  game.piece.shape[0][0] = 99;
  const fresh = new Game(() => 0.5);
  assert.ok(fresh.piece.shape.flat().every(v => v === 0 || v === 1));
});

test('walls, floor and occupied cells block movement without corrupting the board', () => {
  const game = new Game();
  game.piece = { shape: [[1, 1]], x: 0, y: 19, color: 1 };
  assert.equal(game.move(-1), false);
  assert.equal(game.fits([[1]], 0, 20), false);
  assert.equal(game.fits([[1]], 10, 0), false);
  game.board[19][2] = 2;
  assert.equal(game.move(1), false);
  assert.equal(game.piece.x, 0);
});

test('rotation kicks off the wall, but cannot rotate into the floor', () => {
  const game = new Game();
  game.piece = { shape: [[1], [1], [1], [1]], x: 8, y: 2, color: 1 };
  assert.equal(game.rotate(), true);
  assert.equal(game.piece.x, 6);
  assert.deepEqual(game.piece.shape, [[1, 1, 1, 1]]);
  game.piece.y = 19;
  assert.equal(game.rotate(), false);
});

test('hard drop stops on the stack, awards distance points and spawns a new piece', () => {
  const game = new Game();
  game.piece = { shape: [[1, 1]], x: 4, y: 0, color: 2 };
  game.board[18][4] = 3;
  assert.equal(game.ghostY(), 17);
  game.drop();
  assert.equal(game.score, 34);
  assert.equal(game.board[17][4], 2);
  assert.equal(game.board[17][5], 2);
  assert.equal(game.piece.y, 0);
});

for (const count of [1, 2, 3, 4]) test(`clears ${count} lines together and preserves board dimensions`, () => {
  const game = new Game();
  for (let y = 20 - count; y < 20; y++) { game.board[y].fill(2); game.board[y][4] = 0; }
  game.piece = { shape: Array.from({ length: count }, () => [1]), x: 4, y: 20 - count, color: 1 };
  assert.equal(game.lock(), count);
  assert.equal(game.score, [0, 100, 300, 500, 800][count]);
  assert.equal(game.lines, count);
  assert.equal(game.board.length, 20);
  assert.ok(game.board.every(row => row.length === 10 && row.every(v => v === 0)));
});

test('ten cleared lines increase speed; reset clears score, stack and game over', () => {
  const game = new Game();
  const startSpeed = game.interval;
  game.lines = 9; game.board[19].fill(1); game.board[19][0] = 0;
  game.piece = { shape: [[1]], x: 0, y: 19, color: 1 }; game.lock();
  assert.equal(game.level, 2); assert.ok(game.interval < startSpeed);
  game.board[0].fill(1); game.spawn();
  assert.equal(game.over, true); assert.equal(game.piece, null);
  assert.equal(game.drop(), 0); assert.equal(game.rotate(), false);
  game.reset();
  assert.equal(game.over, false); assert.equal(game.lines, 0); assert.equal(game.score, 0);
  assert.ok(game.board.flat().every(v => v === 0));
});
