(function () {
  'use strict';

  // One world unit is one pixel on the 1200 × 780 terrarium. The controller
  // owns the camera and DPR; all drawing here stays in simulation coordinates.
  const W = 1200, H = 780;
  const slots = () => window.Anthill.SLOTS;
  const palette = ['#99703f', '#bc925c', '#d5b179', '#775335', '#e8c996', '#634630'];
  const names = { store: 'Zásobáreň', nursery: 'Liaheň', rest: 'Oddychová komora', queen: 'Kráľovná', water: 'Vodná komora', tunnel: 'Nový tunel' };
  let backdrop, caves, caveKey = '', groundRevision = 0;
  const soil = new Image();
  const ready = new Promise(resolve => {
    soil.onload = () => { groundRevision++; backdrop = null; caves = null; window.dispatchEvent(new Event('colony-renderer-ready')); resolve(); };
    soil.onerror = () => resolve();
    soil.src = '/assets/colony/terrain.webp';
  });
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  function rng(seed) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296; }; }
  function canvas() { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; }
  function ellipse(c, x, y, rx, ry, fill, rotation = 0) {
    c.beginPath(); c.ellipse(x, y, rx, ry, rotation, 0, Math.PI * 2); c.fillStyle = fill; c.fill();
  }
  function line(c, pts, color, width) {
    if (!pts.length) return;
    c.beginPath(); c.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
    c.strokeStyle = color; c.lineWidth = width; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke();
  }
  function stone(c, x, y, r, random, tint = 0) {
    const p = new Path2D(), n = 7, tall = .55 + random() * .45;
    for (let j = 0; j < n; j++) {
      const a = j / n * Math.PI * 2, k = r * (.75 + random() * .25);
      const px = x + Math.cos(a) * k, py = y + Math.sin(a) * k * tall;
      if (j) p.lineTo(px, py); else p.moveTo(px, py);
    }
    p.closePath();
    const g = c.createLinearGradient(x, y - r, x + r * .3, y + r);
    g.addColorStop(0, tint ? '#aaa895' : '#e2c18d'); g.addColorStop(.4, tint ? '#767c6b' : '#ac814d'); g.addColorStop(1, tint ? '#505745' : '#725331');
    c.fillStyle = g; c.fill(p); c.strokeStyle = '#36241433'; c.lineWidth = .7; c.stroke(p);
  }
  function leaf(c, x, y, length, angle, color) {
    c.save(); c.translate(x, y); c.rotate(angle); c.beginPath(); c.moveTo(0, 0);
    c.bezierCurveTo(-length * .34, -length * .46, -length * .25, -length * .89, 0, -length);
    c.bezierCurveTo(length * .33, -length * .73, length * .34, -length * .3, 0, 0);
    c.fillStyle = color; c.fill();
    c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(2, -length * .6, 0, -length * .93);
    c.strokeStyle = '#d9d48a66'; c.lineWidth = .8; c.stroke(); c.restore();
  }
  function plant(c, x, y, h, random) {
    c.save(); c.strokeStyle = '#596039'; c.lineWidth = 1.8;
    const lean = (random() - .5) * h * .6;
    c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x - lean * .2, y - h * .4, x + lean, y - h); c.stroke();
    for (let i = 1; i <= 5; i++) {
      const t = i / 6;
      leaf(c, x + lean * t * t, y - h * t, h * (.17 + random() * .11), (i % 2 ? -1 : 1) * (.55 + random() * .45), i % 2 ? '#6d7b42' : '#8a9654');
    }
    c.restore();
  }
  function roots(c, x, y, length, random, level = 0) {
    if (level > 3 || length < 8) return;
    const bend = (random() - .5) * length, endX = x + bend, endY = y + length;
    c.beginPath(); c.moveTo(x, y); c.bezierCurveTo(x + bend * 1.2, y + length * .3, x - bend * .2, y + length * .8, endX, endY);
    c.strokeStyle = level ? '#baa07888' : '#b3946999'; c.lineWidth = Math.max(.5, 2.3 - level * .6); c.stroke();
    roots(c, endX, endY, length * .57, random, level + 1);
    roots(c, x + bend * .4, y + length * .54, length * .45, random, level + 1);
  }
  function makeBackdrop() {
    const out = canvas(), c = out.getContext('2d'), random = rng(518602);
    let g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#ced0ae'); g.addColorStop(.22, '#d8cf9f'); g.addColorStop(.26, '#c8a574'); g.addColorStop(.5, '#aa8152'); g.addColorStop(1, '#64472f');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.save(); c.filter = 'blur(13px)';
    for (let i = 0; i < 110; i++) {
      const x = random() * W, y = random() * 170, r = 10 + random() * 46;
      ellipse(c, x, y, r * .6, r, ['#727b42aa', '#faf1c988', '#a7af7599', '#4b603255'][i % 4]);
    }
    c.restore();
    g = c.createLinearGradient(0, 0, 0, 210); g.addColorStop(0, '#fff9e51f'); g.addColorStop(.7, '#ede2b211'); g.addColorStop(1, '#938150aa'); c.fillStyle = g; c.fillRect(0, 0, W, 210);
    const terrain = new Path2D(); terrain.moveTo(0, 175);
    for (let x = 0; x <= W; x += 8) terrain.lineTo(x, 183 + Math.sin(x * .018) * 6 + Math.sin(x * .067) * 3);
    terrain.lineTo(W, H); terrain.lineTo(0, H); terrain.closePath();
    c.save(); c.clip(terrain);
    g = c.createLinearGradient(0, 170, 0, H); g.addColorStop(0, '#d8b582'); g.addColorStop(.12, '#b18b5a'); g.addColorStop(.52, '#b68d5b'); g.addColorStop(1, '#745237');
    c.fillStyle = g; c.fillRect(0, 170, W, H);
    if (soil.complete && soil.naturalWidth) {
      const split = soil.naturalHeight * (210 / 1024);
      c.drawImage(soil, 0, split, soil.naturalWidth, soil.naturalHeight - split, 0, 175, W, H - 175);
    }
    // Sedimentary variations and embedded grit are baked once, not every frame.
    for (let j = 0; j < 8; j++) {
      c.beginPath(); c.moveTo(0, 255 + j * 71); c.bezierCurveTo(400, 224 + j * 75, 720, 313 + j * 65, W, 250 + j * 72);
      c.strokeStyle = j % 2 ? '#e0b87b15' : '#392b1712'; c.lineWidth = 23 + random() * 30; c.stroke();
    }
    for (let i = 0; i < 37000; i++) {
      const x = random() * W, y = 174 + random() * 610, r = .35 + Math.pow(random(), 2) * 2.5;
      c.globalAlpha = (soil.naturalWidth ? .08 : .22) + random() * (soil.naturalWidth ? .18 : .57); c.fillStyle = palette[i % palette.length];
      c.fillRect(x, y, r * (1 + random()), r);
      if (r > 1.8) { c.fillStyle = '#f6e2b7'; c.globalAlpha *= .6; c.fillRect(x, y, r, .65); }
    }
    c.globalAlpha = 1;
    for (let i = 0; i < 470; i++) stone(c, random() * W, 190 + random() * 590, 1.8 + random() * 4, random, i % 8 === 0);
    for (const x of [30, 126, 1110, 1170, 930]) roots(c, x, 184, 68 + random() * 85, random);
    c.restore();
    if (soil.complete && soil.naturalWidth) {
      const split = soil.naturalHeight * (210 / 1024);
      c.save();
      c.beginPath(); c.moveTo(0, 0); c.lineTo(W, 0); c.lineTo(W, 182);
      for (let x = W; x >= 0; x -= 8) c.lineTo(x, 183 + Math.sin(x * .018) * 6 + Math.sin(x * .067) * 3);
      c.closePath(); c.clip();
      c.drawImage(soil, 0, 0, soil.naturalWidth, split, 0, 0, W, 185);
      c.restore();
    }
    // Moss and sparse plants frame the playable surface without hiding it.
    for (const x of soil.naturalWidth ? [] : [12, 36, 62, 94, 1060, 1107, 1138, 1176]) plant(c, x, 181, 24 + random() * 95, random);
    for (let i = 0; i < (soil.naturalWidth ? 0 : 105); i++) {
      const x = i < 60 ? random() * 155 : 1025 + random() * 175;
      const y = 173 + random() * 18;
      ellipse(c, x, y, 2 + random() * 5, 2 + random() * 3, ['#7b7d44', '#989753', '#5a6639'][i % 3]);
    }
    // Sand mound joins the real entrance at (600,170).
    const mound = new Path2D(); mound.moveTo(520, 188); mound.bezierCurveTo(550, 161, 551, 119, 590, 111); mound.bezierCurveTo(631, 105, 640, 155, 679, 187); mound.closePath();
    g = c.createLinearGradient(555, 105, 650, 190); g.addColorStop(0, '#f1d19a'); g.addColorStop(.5, '#c89d61'); g.addColorStop(1, '#87603a');
    c.fillStyle = g; c.fill(mound);
    c.save(); c.clip(mound);
    if (soil.naturalWidth) {
      c.drawImage(soil, soil.naturalWidth * .33, soil.naturalHeight * .28, soil.naturalWidth * .16, soil.naturalHeight * .14, 519, 106, 164, 86);
      c.globalAlpha = .3; c.fillStyle = g; c.fill(mound); c.globalAlpha = 1;
    }
    for (let i = 0; i < 2600; i++) { const x = 520 + random() * 160, y = 108 + random() * 87; c.fillStyle = palette[i % 6]; c.globalAlpha = .35 + random() * .6; c.fillRect(x, y, .6 + random() * 2.4, .7 + random() * 1.7); }
    c.restore();
    ellipse(c, 601, 164, 20, 26, '#51381f', -.13); ellipse(c, 603, 170, 15, 22, '#2d2318', -.13);
    for (let i = 0; i < 30; i++) { const a = random() * Math.PI * 2; stone(c, 600 + Math.cos(a) * 28, 166 + Math.sin(a) * 30, 1.5 + random() * 3.2, random); }
    g = c.createRadialGradient(585, 30, 30, 600, 360, 770); g.addColorStop(0, '#fffce413'); g.addColorStop(.65, '#00000000'); g.addColorStop(1, '#291b1833'); c.fillStyle = g; c.fillRect(0, 0, W, H);
    return out;
  }

  function roomShape(room, scale = 1) {
    const p = slots()[room.slot], path = new Path2D(), queen = room.type === 'queen';
    const rx = (queen ? 114 : room.type === 'tunnel' ? 52 : 92) * scale, ry = (queen ? 65 : 55) * scale;
    const samples = 48;
    for (let i = 0; i <= samples; i++) {
      const a = i / samples * Math.PI * 2;
      const rough = 1 + .045 * Math.sin(a * 5 + room.slot) + .035 * Math.cos(a * 7 + room.slot * 2);
      const x = p.x + Math.cos(a) * rx * rough, y = p.y + Math.sin(a) * ry * rough;
      if (i) path.lineTo(x, y); else path.moveTo(x, y);
    }
    path.closePath(); return path;
  }
  function fallbackTunnels(game) {
    return [{ id: 'trunk', points: [{ x: 600, y: 170 }, { x: 600, y: 722 }], progress: 100 }, ...game.s.rooms.map(r => ({ id: 'room:' + r.id, slot: r.slot, progress: r.progress, points: [{ x: 600, y: slots()[r.slot].y }, slots()[r.slot]] }))];
  }
  function partial(points, fraction) {
    if (fraction >= 1) return points;
    let length = 0; for (let i = 1; i < points.length; i++) length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    let remaining = length * fraction; const out = [points[0]];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], distance = Math.hypot(b.x - a.x, b.y - a.y);
      if (distance > remaining) { const t = remaining / distance; out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }); break; }
      out.push(b); remaining -= distance;
    }
    return out;
  }
  function makeCaves(game) {
    const out = canvas(), c = out.getContext('2d'), mask = canvas(), m = mask.getContext('2d');
    const routes = game.tunnels ? game.tunnels() : fallbackTunnels(game), random = rng(165981);
    const actual = routes.map(t => ({ ...t, points: partial(t.points, t.progress >= 100 ? 1 : clamp(t.progress / 70, .035, 1)) }));
    for (const t of actual) line(m, t.points, '#fff', t.id === 'trunk' ? 63 : t.id.startsWith('cross') ? 39 : 49);
    for (const room of game.s.rooms) {
      const scale = room.progress >= 100 ? 1 : clamp((room.progress - 45) / 55, 0, 1);
      if (scale > 0) { m.fillStyle = '#fff'; m.fill(roomShape(room, scale)); }
    }
    // Dark external edge and a sandy lower lip give the cut-away real depth.
    c.save(); c.shadowColor = '#332113cc'; c.shadowBlur = 12; c.shadowOffsetY = -3; c.drawImage(mask, 0, 0); c.restore();
    c.globalCompositeOperation = 'source-in'; c.fillStyle = '#372619'; c.fillRect(0, 0, W, H); c.globalCompositeOperation = 'source-over';
    const floor = canvas(), f = floor.getContext('2d');
    let g = f.createLinearGradient(0, 180, 0, H); g.addColorStop(0, '#74502d'); g.addColorStop(.3, '#745430'); g.addColorStop(.7, '#62442a'); g.addColorStop(1, '#3d3021'); f.fillStyle = g; f.fillRect(0, 0, W, H);
    f.save(); f.filter = 'blur(10px)';
    for (const t of actual) { line(f, t.points.map(p => ({ x: p.x, y: p.y + 13 })), '#d5b07bc9', 37); line(f, t.points.map(p => ({ x: p.x, y: p.y - 16 })), '#20180fe6', 33); }
    f.restore();
    for (const room of game.s.rooms) {
      const p = slots()[room.slot];
      g = f.createRadialGradient(p.x, p.y + 28, 9, p.x, p.y, 105);
      g.addColorStop(0, '#b59560'); g.addColorStop(.43, '#83613b'); g.addColorStop(.75, '#44311e'); g.addColorStop(1, '#291f15');
      f.fillStyle = g; f.fill(roomShape(room));
    }
    if (soil.naturalWidth) {
      // Light relief stays photographic inside the excavated chambers, too.
      // Soft-light preserves their directional lighting and dark recesses.
      f.save(); f.globalCompositeOperation = 'soft-light'; f.globalAlpha = .93;
      const split = soil.naturalHeight * (210 / 1024);
      f.drawImage(soil, 0, split, soil.naturalWidth, soil.naturalHeight - split, 0, 175, W, H - 175);
      f.restore();
    }
    for (let i = 0; i < 17500; i++) {
      const x = random() * W, y = 180 + random() * 600;
      f.fillStyle = palette[i % 6]; f.globalAlpha = .08 + random() * .32; const r = .3 + random() * 1.8; f.fillRect(x, y, r * 1.4, r);
    }
    f.globalAlpha = 1;
    for (let i = 0; i < 320; i++) stone(f, random() * W, 185 + random() * 595, 1 + random() * 3, random);
    f.globalCompositeOperation = 'destination-in'; f.drawImage(mask, 0, 0); f.globalCompositeOperation = 'source-over'; c.drawImage(floor, 0, 0);
    // Granules around chamber walls are stable between frames and rebuilds.
    for (const room of game.s.rooms) {
      if (room.progress < 100) continue;
      const p = slots()[room.slot], rx = room.type === 'queen' ? 114 : room.type === 'tunnel' ? 52 : 92, ry = room.type === 'queen' ? 65 : 55;
      for (let i = 0; i < 95; i++) {
        const a = random() * Math.PI * 2, rough = 1 + .045 * Math.sin(a * 5 + room.slot) + .035 * Math.cos(a * 7 + room.slot * 2);
        const delta = (random() - .4) * 9;
        stone(c, p.x + Math.cos(a) * (rx * rough + delta), p.y + Math.sin(a) * (ry * rough + delta), .8 + random() * 2.4, random);
      }
    }
    return out;
  }

  function seed(c, x, y, size, angle = 0) {
    c.save(); c.translate(x, y); c.rotate(angle);
    const g = c.createLinearGradient(-size, -size * .4, size, size * .4); g.addColorStop(0, '#5e452b'); g.addColorStop(.33, '#dcc394'); g.addColorStop(.58, '#af8550'); g.addColorStop(1, '#795a32');
    c.beginPath(); c.moveTo(-size, 0); c.bezierCurveTo(-size * .2, -size * .75, size * .7, -size * .47, size, 0); c.bezierCurveTo(size * .4, size * .6, -size * .45, size * .47, -size, 0); c.fillStyle = g; c.fill();
    c.beginPath(); c.moveTo(-size * .8, 0); c.quadraticCurveTo(0, size * .1, size * .8, 0); c.strokeStyle = '#f5dfad99'; c.lineWidth = .65; c.stroke(); c.restore();
  }
  function crumb(c, x, y, r, random) {
    c.save(); c.translate(x, y); c.rotate(random() * 2);
    c.beginPath(); c.moveTo(-r, -r * .4); c.lineTo(-r * .5, -r); c.lineTo(r * .3, -r * .8); c.lineTo(r, -r * .2); c.lineTo(r * .7, r * .6); c.lineTo(-r * .6, r * .7); c.closePath();
    const g = c.createLinearGradient(0, -r, 0, r); g.addColorStop(0, '#f7dd99'); g.addColorStop(1, '#b9853d'); c.fillStyle = g; c.fill();
    c.fillStyle = '#fff0c0'; c.fillRect(-r * .3, -r * .5, r * .3, r * .15); c.fillStyle = '#b08b46'; c.fillRect(r * .25, -r * .2, r * .2, r * .2); c.restore();
  }
  function drop(c, x, y, size) {
    c.save(); c.translate(x, y); ellipse(c, 1, size * .28, size * 1.06, size * .47, '#4c543c40');
    const g = c.createRadialGradient(-size * .3, -size * .35, 1, 0, 0, size); g.addColorStop(0, '#f3fafbc9'); g.addColorStop(.32, '#c1d9d79c'); g.addColorStop(.7, '#7dada896'); g.addColorStop(.87, '#e7f4e0dc'); g.addColorStop(1, '#597e75b3');
    ellipse(c, 0, 0, size, size * .66, g); c.beginPath(); c.ellipse(-size * .12, -size * .12, size * .72, size * .38, -.22, 3.25, 5.65); c.strokeStyle = '#fffffff0'; c.lineWidth = Math.max(1.4, size * .075); c.stroke(); ellipse(c, -size * .38, -size * .3, size * .16, size * .085, '#fff'); c.restore();
  }
  function food(c, f, small = false) {
    c.save(); c.translate(f.x, f.y); const random = rng(f.id * 751 + 31);
    const amount = clamp((f.amount || 1) / (window.Anthill.FOODS[f.type]?.amount || 18), .17, 1);
    const scale = small ? .26 : .55 + amount * .45; c.scale(scale, scale);
    ellipse(c, 1, 5, 29, 8, '#34270f33');
    if (f.type === 'fruit') {
      c.rotate(-.12);
      const path = new Path2D(); path.moveTo(-33, 1); path.quadraticCurveTo(-37, -23, -22, -41); path.quadraticCurveTo(-3, -23, 35, -13); path.quadraticCurveTo(18, 14, -33, 1); path.closePath();
      const g = c.createLinearGradient(-30, -33, 10, 5); g.addColorStop(0, '#fff3cc'); g.addColorStop(.5, '#f3deaa'); g.addColorStop(1, '#d5b779'); c.fillStyle = g; c.fill(path);
      c.beginPath(); c.moveTo(-22, -41); c.quadraticCurveTo(-37, -23, -33, 1); c.quadraticCurveTo(18, 14, 35, -13); c.strokeStyle = '#af4834'; c.lineWidth = 5; c.stroke(); c.beginPath(); c.moveTo(-22, -39); c.quadraticCurveTo(-32, -21, -30, 0); c.strokeStyle = '#ec8b63'; c.lineWidth = 1.2; c.stroke();
      for (let i = 0; i < 13; i++) { c.fillStyle = '#fff8dd99'; c.fillRect(-25 + random() * 43, -17 + random() * 17, 1.2, 1.2); }
    } else if (f.type === 'water') drop(c, 0, -6, 25);
    else if (f.type === 'seed') {
      for (let i = 0; i < Math.ceil(3 + amount * 5); i++) seed(c, (random() - .5) * 34, (random() - .5) * 13 - 3, 9 + random() * 5, random() * 2.5);
    } else if (f.type === 'cheese' || f.type === 'pizza') {
      c.beginPath(); c.moveTo(-26, 0); c.lineTo(-17, -29); c.lineTo(30, -2); c.lineTo(21, 10); c.closePath(); c.fillStyle = '#d49b3e'; c.fill();
      c.beginPath(); c.moveTo(-26, 0); c.lineTo(-17, -29); c.lineTo(26, -9); c.closePath(); c.fillStyle = '#f4d389'; c.fill();
      for (const [x, y, r] of [[-11, -13, 3.5], [4, -12, 2.5], [-18, -2, 2]]) ellipse(c, x, y, r, r * .6, f.type === 'pizza' ? '#b25433' : '#ca983f');
    } else {
      for (let i = 0; i < Math.ceil(3 + amount * 4); i++) crumb(c, (random() - .5) * 36, (random() - .5) * 15 - 4, 7 + random() * 8, random);
    }
    c.restore();
  }
  function egg(c, x, y, size, angle) {
    c.save(); c.translate(x, y); c.rotate(angle);
    ellipse(c, 1, 2, size * .66, size, '#35261426');
    const g = c.createRadialGradient(-size * .25, -size * .3, .1, 0, 0, size); g.addColorStop(0, '#fff7da'); g.addColorStop(.55, '#e8d9b0'); g.addColorStop(1, '#bba378'); ellipse(c, 0, 0, size * .62, size, g);
    ellipse(c, -size * .2, -size * .35, size * .15, size * .3, '#fffcef88'); c.restore();
  }
  function body(c, x, y, rx, ry, queen = false) {
    const g = c.createRadialGradient(x - rx * .3, y - ry * .52, 0, x, y, rx * 1.12);
    g.addColorStop(0, queen ? '#95603c' : '#795239'); g.addColorStop(.28, queen ? '#573321' : '#452a1c'); g.addColorStop(.66, '#241a14'); g.addColorStop(1, '#100e0b'); ellipse(c, x, y, rx, ry, g);
    c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.strokeStyle = '#1e160eee'; c.lineWidth = .55; c.stroke();
    ellipse(c, x - rx * .15, y - ry * .5, rx * .43, ry * .18, '#e1c6984f', -.11);
    c.save(); c.beginPath(); c.ellipse(x, y, rx * .98, ry * .98, 0, 0, Math.PI * 2); c.clip();
    for (let i = 0; i < 28; i++) {
      const px = x + Math.sin(i * 7.83) * rx, py = y + Math.cos(i * 5.21) * ry;
      c.fillStyle = i % 3 ? '#c0966926' : '#0e0c0a55'; c.fillRect(px, py, .21 + (i % 3) * .08, .17);
    }
    c.restore();
  }
  function antArt(c, a, time, queen = false, multiplier = 1) {
    c.save(); c.translate(a.x, a.y); c.rotate(a.angle || 0); c.scale(multiplier, multiplier);
    const moving = a.route?.length > 0, phase = time * (moving ? 15 : 2.1) + a.id * 2.7;
    const gaster = queen ? 12.3 : 7.2, breadth = queen ? 7.1 : 4.2;
    // Each worker has six articulated legs. Opposite tripod groups alternate.
    ellipse(c, -3, 3.7, queen ? 24 : 18, queen ? 9 : 5.5, '#160e0930');
    for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
      const stride = Math.sin(phase + i * Math.PI * .9 + (side === 1 ? Math.PI : 0)) * (moving ? 2.6 : .45);
      const bx = 4.1 - i * 3.7, by = side * 1.5;
      const kneeX = bx + [4, -.5, -6][i] + stride * .65, kneeY = side * (queen ? 9 : 7.6);
      const tipX = bx + [10.5, 0, -12][i] - stride, tipY = side * (queen ? 17 : 12.2) - stride * side * .4;
      line(c, [{ x: bx, y: by }, { x: kneeX, y: kneeY }, { x: tipX, y: tipY }, { x: tipX + 1.5, y: tipY - side * .7 }], '#332418', queen ? 1.05 : .86);
      line(c, [{ x: bx, y: by - .28 }, { x: kneeX, y: kneeY - .28 }], '#ac7e425c', .48);
    }
    body(c, -11.1, 0, gaster, breadth, queen);
    // Fine intersegment boundaries follow the gaster's surface.
    c.save(); c.beginPath(); c.ellipse(-11.1, 0, gaster, breadth, 0, 0, Math.PI * 2); c.clip();
    for (let i = 0; i < (queen ? 4 : 3); i++) {
      c.beginPath(); c.ellipse(-18 + i * (queen ? 5.2 : 4), 0, 3, breadth + .2, 0, -1.3, 1.3); c.strokeStyle = '#c6a37645'; c.lineWidth = .5; c.stroke();
    }
    c.restore(); body(c, -2.3, 0, 2, 1.6, queen); body(c, 2.5, 0, queen ? 6.3 : 4.5, queen ? 4.2 : 2.8, queen); body(c, queen ? 11.5 : 9.5, 0, queen ? 5.5 : 4, queen ? 4.5 : 3.3, queen);
    for (const side of [-1, 1]) {
      ellipse(c, queen ? 13.2 : 10.9, side * (queen ? 3.2 : 2.4), queen ? 1.1 : .78, queen ? 1 : .7, '#0a0b08');
      const twitch = Math.sin(time * 4.2 + a.id + side * 1.4) * 1.3;
      line(c, [{ x: queen ? 15 : 12.5, y: side * 1.9 }, { x: queen ? 21 : 17.7, y: side * (5 + twitch) }, { x: queen ? 28 : 22.5, y: side * (6.3 + twitch * .8) }], '#37271b', queen ? .96 : .75);
      line(c, [{ x: queen ? 16 : 13, y: side * .65 }, { x: queen ? 19 : 15.4, y: side * 1.7 }, { x: queen ? 20 : 16, y: 0 }], '#6f4929', queen ? 1 : .65);
    }
    if (a.cargo) food(c, { id: a.id, x: 20, y: -2, type: a.cargo.type, amount: 8 }, true);
    else if (a.state === 'dirt') crumb(c, 18, 0, 3.3, rng(a.id + 52));
    c.restore();
  }
  const antSprites = new Map();
  function ant(c, a, time, queen = false, multiplier = 1) {
    const moving = a.route?.length > 0;
    const phase = time * (moving ? 15 : 2.1) + a.id * 2.7;
    const frame = ((Math.floor(phase / (Math.PI * 2) * 16) % 16) + 16) % 16;
    const key = (queen ? 'q' : 'w') + (moving ? 'm' : 'i') + frame;
    let sprite = antSprites.get(key);
    if (!sprite) {
      sprite = document.createElement('canvas'); sprite.width = 192; sprite.height = 150;
      const p = sprite.getContext('2d'); p.scale(3, 3); p.translate(32, 25);
      antArt(p, { id: 0, x: 0, y: 0, route: moving ? [1] : [] }, frame / 16 * Math.PI * 2 / (moving ? 15 : 2.1), queen);
      antSprites.set(key, sprite);
    }
    c.save(); c.translate(a.x, a.y); c.rotate(a.angle || 0); c.scale(multiplier, multiplier);
    c.drawImage(sprite, -32, -25, 64, 50);
    if (a.cargo) food(c, { id: a.id, x: 20, y: -2, type: a.cargo.type, amount: 8 }, true);
    else if (a.state === 'dirt') crumb(c, 18, 0, 3.3, rng(a.id + 52));
    c.restore();
  }
  function roomContents(c, game) {
    const s = game.s;
    for (const room of s.rooms) {
      if (room.progress < 100) continue;
      const p = slots()[room.slot], random = rng(818 + room.id * 311);
      if (room.type === 'store') {
        const n = Math.min(32, Math.floor(s.food / 2));
        for (let i = 0; i < n; i++) {
          const x = p.x + (random() - .5) * 116, y = p.y + 4 + random() * 28;
          if (i % 3) seed(c, x, y, 4 + random() * 5.5, random() * 3.1); else crumb(c, x, y, 3 + random() * 4.5, random);
        }
      } else if (room.type === 'nursery' || room.type === 'queen') {
        const n = room.type === 'queen' ? 13 : Math.min(30, 8 + Math.floor(s.brood / 3) + Math.floor(s.ants.length / 2));
        for (let i = 0; i < n; i++) egg(c, p.x + (random() - .5) * (room.type === 'queen' ? 127 : 108), p.y + 11 + random() * 25, 4.3 + random() * 3.2, random() * 2.5 - 1.2);
      } else if (room.type === 'water' && s.water > 0) {
        drop(c, p.x + 10, p.y + 20, 8 + Math.min(20, s.water * .22));
      } else if (room.type === 'rest') {
        for (let i = 0; i < 7; i++) leaf(c, p.x - 45 + random() * 90, p.y + 29, 10 + random() * 12, random() * 3 - 1.5, '#74704699');
      }
    }
    const queen = s.rooms.find(r => r.type === 'queen');
    if (queen) {
      const p = slots()[queen.slot];
      ant(c, { id: 900, x: p.x, y: p.y - 3 + Math.sin(s.time * 1.3) * .35, angle: -.09 + Math.sin(s.time * .23) * .025 }, s.time, true, 1.7);
    }
  }
  function obstacles(c, game) {
    const s = game.s, random = rng(7893);
    ellipse(c, s.rock, 176, 35, 7, '#3b301044'); stone(c, s.rock, 156, 34, random, 1);
    c.beginPath(); c.moveTo(s.rock - 22, 153); c.lineTo(s.rock - 6, 142); c.lineTo(s.rock + 10, 146); c.strokeStyle = '#d1d3b944'; c.lineWidth = 1.6; c.stroke();
    drop(c, 770, 168, 44);
    if (s.bridge) {
      c.save(); c.translate(770, 155); c.rotate(Math.PI / 2); leaf(c, 0, 58, 120, 0, '#889347'); c.restore();
    }
    if (s.event?.type === 'branch') {
      c.save(); c.translate(930, 160); c.rotate(-.35); line(c, [{ x: -37, y: 3 }, { x: 43, y: -1 }], '#65432b', 15); line(c, [{ x: -36, y: -1 }, { x: 40, y: -4 }], '#ae8b60', 4); line(c, [{ x: 4, y: 0 }, { x: 21, y: -25 }], '#785a36', 6); c.restore();
    }
  }
  function label(c, text, x, y, selected = false) {
    c.save();
    // Keep chamber names readable when the camera shows a wider mobile view.
    const dpr = c.canvas.clientWidth ? c.canvas.width / c.canvas.clientWidth : 1;
    const screenScale = Math.max(.1, Math.abs(c.getTransform().a) / dpr);
    const fontSize = clamp(11 / screenScale, 13, 24), height = fontSize + 12;
    c.font = '500 ' + fontSize + 'px "Segoe UI", sans-serif';
    const width = c.measureText(text).width + 20;
    c.fillStyle = selected ? '#faf5e9ed' : '#2e261be0'; c.beginPath(); c.roundRect(x - width / 2, y - height / 2, width, height, height / 2); c.fill();
    c.fillStyle = selected ? '#433d28' : '#fff4da'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, x, y + .5); c.restore();
  }
  function overlays(c, game, options) {
    const s = game.s, selected = options.selected;
    const tool = options.tool || '', toolType = tool.startsWith('food:') ? tool.slice(5) : tool;
    if (options.paths || s.settings.paths) {
      c.save(); c.setLineDash([3, 7]);
      for (const a of s.ants) if (a.route.length) line(c, [{ x: a.x, y: a.y }, ...a.route], '#e9e3b275', 1.4);
      c.restore();
    }
    if (s.guide) {
      c.save(); c.globalAlpha = Math.min(.7, s.guide.life / 8); line(c, s.guide.points, '#f6edbd', 2.5); c.restore();
    }
    for (const room of s.rooms) {
      const p = slots()[room.slot], chosen = selected?.kind === 'room' && selected.id === room.id;
      if (room.progress < 100) {
        c.save(); c.setLineDash([3, 6]); c.strokeStyle = '#f0e4bd99'; c.lineWidth = 1.2; c.stroke(roomShape(room)); c.restore();
        label(c, Math.floor(room.progress) + ' % · kopanie', p.x, p.y + 53, chosen);
      } else if (room.type !== 'tunnel') label(c, names[room.type] || '', p.x, p.y + (room.type === 'queen' ? 66 : 56), chosen);
      if (chosen) { c.save(); c.strokeStyle = '#f6e7bb'; c.lineWidth = 1.5; c.stroke(roomShape(room, 1.05)); c.restore(); }
    }
    if (tool.startsWith('build:') || ['dig', 'build', 'tunnel'].includes(tool)) {
      for (let i = 4; i < slots().length; i++) {
        if (s.rooms.some(r => r.slot === i)) continue;
        const p = slots()[i]; c.save(); c.setLineDash([4, 7]); c.strokeStyle = '#f5e6c68c'; c.lineWidth = 1.8; c.beginPath(); c.ellipse(p.x, p.y, 69, 39, 0, 0, Math.PI * 2); c.stroke(); c.restore();
        c.strokeStyle = '#f7eac5'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(p.x - 7, p.y); c.lineTo(p.x + 7, p.y); c.moveTo(p.x, p.y - 7); c.lineTo(p.x, p.y + 7); c.stroke();
      }
    }
    if (selected?.kind === 'ant') {
      const a = s.ants.find(n => n.id === selected.id);
      if (a) { c.strokeStyle = '#f8e5ac'; c.lineWidth = 1.3; c.beginPath(); c.ellipse(a.x, a.y, 25, 25, 0, 0, Math.PI * 2); c.stroke(); label(c, a.name, a.x, a.y - 36, true); }
    }
    if (selected?.kind === 'food') {
      const f = s.foods.find(n => n.id === selected.id);
      if (f) label(c, window.Anthill.FOODS[f.type].name + ' · ' + Math.ceil(f.amount), f.x, 102, true);
    }
    const hover = options.hover;
    if (hover && (toolType === 'food' || window.Anthill.FOODS[toolType]) && hover.y < 220) {
      c.save(); c.globalAlpha = .48; food(c, { id: 13, type: toolType === 'food' ? 'seed' : toolType, amount: 18, x: clamp(hover.x, 55, 1145), y: 170 }); c.restore();
    }
  }
  function weather(c, game) {
    if (game.s.event?.type !== 'rain') return;
    const t = game.s.time, random = rng(5663); c.save(); c.fillStyle = '#536e6b19'; c.fillRect(0, 0, W, 182); c.strokeStyle = '#e4f1e3aa'; c.lineWidth = .9;
    c.beginPath(); for (let i = 0; i < 60; i++) { const x = random() * W, y = (random() * 180 + t * (100 + random() * 30)) % 185; c.moveTo(x, y); c.lineTo(x - 4, y + 11); } c.stroke(); c.restore();
  }
  function draw(c, game, options = {}) {
    if (!game?.s) return;
    c.save();
    if (!backdrop) backdrop = makeBackdrop();
    c.drawImage(backdrop, 0, 0);
    const key = groundRevision + ':' + game.s.rooms.map(r => [r.id, r.slot, r.type, Math.floor(r.progress / 5)].join(',')).join('|');
    if (!caves || key !== caveKey) { caves = makeCaves(game); caveKey = key; }
    c.drawImage(caves, 0, 0);
    obstacles(c, game); roomContents(c, game);
    for (const f of game.s.foods) food(c, f);
    for (const a of game.s.ants) ant(c, a, game.s.time, false, a.y < 220 ? 1.07 : 1);
    weather(c, game); overlays(c, game, options);
    // Very faint glass edge anchors the cross section as a terrarium.
    c.strokeStyle = '#fff9dc66'; c.lineWidth = 2; c.beginPath(); c.roundRect(3, 3, W - 6, H - 6, 14); c.stroke();
    c.strokeStyle = '#3e302c30'; c.lineWidth = 3; c.beginPath(); c.moveTo(8, H - 8); c.lineTo(W - 8, H - 8); c.stroke(); c.restore();
  }
  function portrait(target) {
    const c = target.getContext('2d'); if (!c) return;
    const width = target.width || 320, height = target.height || 180; c.clearRect(0, 0, width, height);
    const g = c.createLinearGradient(0, 0, width, height); g.addColorStop(0, '#6c482c'); g.addColorStop(.55, '#a78150'); g.addColorStop(1, '#d9bb86'); c.fillStyle = g; c.fillRect(0, 0, width, height);
    if (soil.naturalWidth) {
      c.save(); c.globalCompositeOperation = 'soft-light';
      c.drawImage(soil, soil.naturalWidth * .33, soil.naturalHeight * .4, soil.naturalWidth * .28, soil.naturalHeight * .2, 0, 0, width, height); c.restore();
    }
    const random = rng(621); for (let i = 0; i < 850; i++) { c.fillStyle = palette[i % 6]; c.globalAlpha = .3 + random() * .4; const r = 1 + random() * 2; c.fillRect(random() * width, random() * height, r, r); } c.globalAlpha = 1;
    for (let i = 0; i < 9; i++) egg(c, width * .27 + random() * width * .5, height * .79 + random() * height * .12, height * .038, random() * 3);
    antArt(c, { id: 900, x: width * .49, y: height * .46, angle: -.16 }, 0, true, Math.min(width / 76, height / 46));
  }
  window.ColonyRenderer = { draw, portrait, ready };
})();
