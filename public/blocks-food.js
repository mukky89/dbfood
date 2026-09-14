/* Canvas food art. The occupied cells and collision rules stay in blocks-engine.js. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LunchFood = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const foods = [null,
    { name: 'Sushi', icon: '🍣', color: '#b4dfcf', base: '#345c50' },
    { name: 'Wafľa', icon: '🧇', color: '#e5b46e', base: '#b77b3f' },
    { name: 'Pizza', icon: '🍕', color: '#ffd67d', base: '#cc8347' },
    { name: 'Brokolica', icon: '🥦', color: '#8dd493', base: '#397956' },
    { name: 'Steak', icon: '🥩', color: '#f0a0a0', base: '#a45562' },
    { name: 'Losos', icon: '🍣', color: '#ffb18c', base: '#c97258' },
    { name: 'Syr', icon: '🧀', color: '#ffe897', base: '#d0a345' }
  ];
  function drawTile(ctx, x, y, type, ghost = false) {
    const food = foods[type];
    if (!food) return;
    ctx.save(); ctx.translate(x * 30, y * 30);
    const box = (x, y, w, h, r, color) => {
      ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();
    };
    const dot = (x, y, r, color) => {
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    };
    const line = (points, color, width = 1.5) => {
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.beginPath();
      points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
    };
    if (ghost) {
      box(2, 2, 26, 26, 4, '#c4b59912');
      ctx.strokeStyle = food.color; ctx.globalAlpha = .55; ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]); ctx.strokeRect(3, 3, 24, 24); ctx.restore(); return;
    }
    // A square food portion keeps the full occupied cell legible, even for rounded toppings.
    box(1, 2, 28, 28, 5, '#070b1055');
    box(1, 1, 28, 27, 5, food.base);
    box(3, 3, 24, 23, 3, food.color);
    if (type === 1) {
      box(4, 4, 22, 21, 7, '#29463d'); box(6, 6, 18, 17, 6, '#f4f0d8');
      box(11, 10, 9, 10, 2, '#ed9476'); box(8, 10, 4, 8, 1, '#80b85d');
      dot(21, 9, 1, '#b3b69a'); dot(9, 21, .8, '#b3b69a');
    } else if (type === 2) {
      for (const u of [5, 12, 19]) for (const v of [5, 12, 19]) {
        box(u, v, 5, 5, 1, '#9e6234'); box(u + 1, v + 1, 4, 3, 1, '#c78d4a');
      }
      box(11, 10, 8, 7, 2, '#fff0ac'); line([[12, 11], [17, 11]], '#fff9d8');
    } else if (type === 3) {
      box(4, 4, 22, 21, 3, '#e89a48'); box(5, 5, 20, 19, 3, '#ffda79');
      for (const [u, v] of [[10, 10], [21, 12], [14, 21]]) {
        dot(u, v, 3.3, '#b84637'); dot(u - .6, v - .7, 2.3, '#df6650');
      }
      line([[18, 6], [17, 9]], '#518557', 2); line([[7, 18], [9, 20]], '#518557', 2);
    } else if (type === 4) {
      box(12, 13, 6, 11, 2, '#c6dc87');
      for (const [u, v, r] of [[9, 12, 5], [19, 12, 6], [14, 8, 5]]) {
        dot(u, v, r, '#367d50'); dot(u - 1, v - 1, r - 2, '#62b26c');
      }
      dot(10, 8, 1, '#b6e38d'); dot(19, 10, 1.2, '#b6e38d');
    } else if (type === 5) {
      box(4, 4, 22, 21, 7, '#f3cfbe'); box(6, 6, 18, 17, 6, '#bf6670');
      line([[10, 7], [13, 12], [10, 17], [12, 22]], '#f2b1aa', 1);
      for (const offset of [0, 6, 12]) line([[7 + offset, 9], [9 + offset, 19]], '#7d454b', 1.5);
      dot(22, 7, 1, '#728854');
    } else if (type === 6) {
      box(4, 4, 22, 21, 3, '#ec8b6d');
      for (const offset of [-5, 2, 9]) line([[5, 12 + offset], [14, 16 + offset], [25, 9 + offset]], '#ffd8b5', 2);
      line([[6, 24], [23, 24]], '#724f45', 2);
    } else if (type === 7) {
      for (const [u, v, r] of [[9, 9, 3], [21, 12, 3.5], [12, 21, 3]]) {
        dot(u, v, r, '#d4a447'); dot(u + .5, v + 1, r - 1, '#eebf58');
      }
    }
    line([[6, 2], [23, 2]], '#fff5d966', 1);
    ctx.restore();
  }
  return { foods, drawTile };
});
