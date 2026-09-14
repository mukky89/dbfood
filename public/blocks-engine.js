/* Pure game rules; no order data, network, DOM or timers. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LunchBlocks = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const SHAPES = [
    [[1, 1, 1, 1]], [[1, 1], [1, 1]], [[0, 1, 0], [1, 1, 1]],
    [[0, 1, 1], [1, 1, 0]], [[1, 1, 0], [0, 1, 1]],
    [[1, 0, 0], [1, 1, 1]], [[0, 0, 1], [1, 1, 1]]
  ];
  class Game {
    constructor(random = Math.random) { this.random = random; this.reset(); }
    reset() {
      this.board = Array.from({ length: 20 }, () => Array(10).fill(0));
      this.bag = []; this.score = 0; this.lines = 0; this.over = false;
      this.spawn();
    }
    get level() { return 1 + Math.floor(this.lines / 10); }
    get interval() { return Math.max(110, 700 - (this.level - 1) * 65); }
    spawn() {
      if (!this.bag.length) {
        this.bag = [0, 1, 2, 3, 4, 5, 6];
        for (let i = 6; i > 0; i--) {
          const j = Math.floor(this.random() * (i + 1));
          [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
        }
      }
      const type = this.bag.pop(), shape = SHAPES[type].map(row => row.slice());
      this.piece = { shape, color: type + 1, x: Math.floor((10 - shape[0].length) / 2), y: 0 };
      if (!this.fits(shape, this.piece.x, 0)) { this.over = true; this.piece = null; }
    }
    fits(shape, x, y) {
      return shape.every((row, r) => row.every((v, c) => !v || (
        x + c >= 0 && x + c < 10 && y + r >= 0 && y + r < 20 && !this.board[y + r][x + c]
      )));
    }
    move(dx) {
      if (!this.piece || this.over) return false;
      const p = this.piece;
      if (!this.fits(p.shape, p.x + dx, p.y)) return false;
      p.x += dx; return true;
    }
    rotate() {
      if (!this.piece || this.over) return false;
      const p = this.piece, rotated = p.shape[0].map((_, i) => p.shape.map(row => row[i]).reverse());
      for (const dx of [0, -1, 1, -2, 2]) {
        if (this.fits(rotated, p.x + dx, p.y)) { p.shape = rotated; p.x += dx; return true; }
      }
      return false;
    }
    ghostY() {
      if (!this.piece) return 0;
      let y = this.piece.y;
      while (this.fits(this.piece.shape, this.piece.x, y + 1)) y++;
      return y;
    }
    lock() {
      if (!this.piece || this.over) return 0;
      const p = this.piece;
      p.shape.forEach((row, r) => row.forEach((v, c) => { if (v) this.board[p.y + r][p.x + c] = p.color; }));
      const remaining = this.board.filter(row => !row.every(Boolean));
      const cleared = 20 - remaining.length;
      this.score += [0, 100, 300, 500, 800][cleared] * this.level;
      this.lines += cleared;
      while (remaining.length < 20) remaining.unshift(Array(10).fill(0));
      this.board = remaining; this.spawn(); return cleared;
    }
    step(softDrop = false) {
      if (!this.piece || this.over) return 0;
      const p = this.piece;
      if (this.fits(p.shape, p.x, p.y + 1)) { p.y++; if (softDrop) this.score++; return 0; }
      return this.lock();
    }
    drop() {
      if (!this.piece || this.over) return 0;
      const y = this.ghostY();
      this.score += (y - this.piece.y) * 2; this.piece.y = y;
      return this.lock();
    }
  }
  return { Game };
});
