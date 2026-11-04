import * as THREE from './vendor/three/three.module.js';

// Landmarks that react to the game: river with a bridge, the four zombie
// portals, a small data centre linked by optical fibre, and Sylex's health board.
// Game coordinates (x,y) map to world (x,·,z).

function canvasTexture(w, h, draw, srgb = true) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv); if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t;
}

// Tileable ripple normal map from a sum of sines with analytic derivatives.
function rippleNormals() {
  return canvasTexture(256, 256, (c, w, h) => {
    const img = c.createImageData(w, h), waves = [[3, 1, .9], [-2, 4, .6], [5, -3, .35], [1, 7, .25]];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let dx = 0, dy = 0;
      for (const [a, b, amp] of waves) { const k = Math.cos((a * x + b * y) / w * Math.PI * 2) * amp; dx += k * a; dy += k * b; }
      const n = new THREE.Vector3(-dx * .06, -dy * .06, 1).normalize(), o = (y * w + x) * 4;
      img.data[o] = (n.x * .5 + .5) * 255; img.data[o + 1] = (n.y * .5 + .5) * 255; img.data[o + 2] = (n.z * .5 + .5) * 255; img.data[o + 3] = 255;
    }
    c.putImageData(img, 0, 0);
  }, false);
}

function ribbon(points, width, y) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, y, z)));
  const n = 80, pos = [], uv = [], index = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, p = curve.getPoint(t), d = curve.getTangent(t), side = new THREE.Vector3(-d.z, 0, d.x).normalize();
    const wobble = 1 + Math.sin(t * 23) * .08;
    for (const s of [-1, 1]) { pos.push(p.x + side.x * s * width * wobble / 2, y, p.z + side.z * s * width * wobble / 2); uv.push(s < 0 ? 0 : 1, t * curve.getLength() / 60); }
    if (i) { const a = (i - 1) * 2; index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(index); g.computeVertexNormals();
  return g;
}

export function createLandmarks(scene, { routes, river: RIVER, concrete, steel, lightMetal, dark }) {
  const owned = []; const own = x => (owned.push(x), x);
  const add = (geometry, material, x = 0, y = 0, z = 0, parent = scene) => { const m = new THREE.Mesh(geometry, material); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m; };

  // ---- River and bridge ----
  const ripples = own(rippleNormals()); ripples.wrapS = ripples.wrapT = THREE.RepeatWrapping; ripples.repeat.set(1, 1);
  const bank = add(own(ribbon(RIVER, 78, .25)), own(new THREE.MeshStandardMaterial({ color: '#7d7357', roughness: .95 }))); bank.castShadow = false;
  const water = add(own(ribbon(RIVER, 56, .6)), own(new THREE.MeshPhysicalMaterial({ color: '#2d5866', roughness: .08, metalness: .05, clearcoat: 1, clearcoatRoughness: .05, normalMap: ripples, normalScale: new THREE.Vector2(.45, .45), envMapIntensity: 1.4 })));
  water.castShadow = false; water.material.userData.keepPBR = true;
  // The east road crosses at z = 470; the deck is the road itself, framed by girders and railings.
  const bridge = new THREE.Group(); scene.add(bridge);
  for (const z of [449, 491]) {
    add(own(new THREE.BoxGeometry(76, 3, 3)), steel, 890, 1.2, z, bridge);
    for (let x = 856; x <= 924; x += 8.5) add(own(new THREE.CylinderGeometry(.5, .5, 8, 6)), lightMetal, x, 5, z, bridge);
    add(own(new THREE.BoxGeometry(70, .9, .9)), lightMetal, 890, 8.6, z, bridge); add(own(new THREE.BoxGeometry(70, .6, .6)), lightMetal, 890, 5.4, z, bridge);
  }
  for (const x of [866, 914]) add(own(new THREE.BoxGeometry(6, 6, 46)), concrete, x, -1, 470, bridge);
  for (const x of [878, 902]) add(own(new THREE.CylinderGeometry(2.4, 2.8, 5, 12)), concrete, x, -1.5, 470, bridge);

  // ---- Portals: steel ring with a swirling fungal membrane ----
  const swirl = own(canvasTexture(256, 256, (c, w, h) => {
    const g = c.createRadialGradient(128, 128, 6, 128, 128, 128); g.addColorStop(0, '#f6ffe0'); g.addColorStop(.35, '#9dff7a'); g.addColorStop(.75, '#4c2f7a'); g.addColorStop(1, '#120a20');
    c.fillStyle = g; c.fillRect(0, 0, w, h); c.globalCompositeOperation = 'lighter';
    for (let arm = 0; arm < 5; arm++) { c.beginPath(); for (let t = 0; t < 1; t += .01) { const a = arm * 1.2566 + t * 7, r = t * 120; c.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r); } c.strokeStyle = 'rgba(190,255,150,.45)'; c.lineWidth = 9; c.stroke(); }
  }));
  const ringGeo = own(new THREE.TorusGeometry(17, 2.3, 12, 48)), discGeo = own(new THREE.CircleGeometry(15.5, 48)), pillarGeo = own(new THREE.BoxGeometry(5, 34, 5)), slabGeo = own(new THREE.BoxGeometry(50, 2, 18));
  const ringMat = own(new THREE.MeshStandardMaterial({ color: '#3a4146', roughness: .35, metalness: .85, emissive: '#3dff6a', emissiveIntensity: .15 }));
  const portals = routes.map((route, i) => {
    const [x, z] = route[0], [nx, nz] = route[1], g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = Math.atan2(nx - x, nz - z); scene.add(g);
    add(slabGeo, concrete, 0, 1, 0, g); for (const s of [-1, 1]) add(pillarGeo, concrete, s * 22, 17, 0, g);
    const ring = add(ringGeo, ringMat, 0, 20, 0, g);
    const disc = add(discGeo, own(new THREE.MeshBasicMaterial({ map: swirl, transparent: true, opacity: .5, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })), 0, 20, 0, g);
    disc.castShadow = false; disc.receiveShadow = false;
    return { g, ring, disc, glow: .2, center: new THREE.Vector3(x, 20, z), index: i };
  });

  // ---- Data centre with optical fibre trunk to the main building ----
  const ledCanvas = document.createElement('canvas'); ledCanvas.width = 32; ledCanvas.height = 64; const lc = ledCanvas.getContext('2d');
  const leds = own(new THREE.CanvasTexture(ledCanvas)); leds.colorSpace = THREE.SRGBColorSpace; leds.magFilter = THREE.NearestFilter;
  let ledSeed = 9; const ledRand = () => (ledSeed = (ledSeed * 1664525 + 1013904223) >>> 0) / 4294967296;
  function drawLeds() {
    lc.fillStyle = '#0c1216'; lc.fillRect(0, 0, 32, 64);
    for (let y = 2; y < 64; y += 4) { lc.fillStyle = '#1b252b'; lc.fillRect(1, y - 1, 30, 3); for (let x = 3; x < 30; x += 3) { const r = ledRand(); lc.fillStyle = r > .55 ? '#57ff8c' : r > .45 ? '#4fc9ff' : r > .42 ? '#ffb02e' : '#11301c'; lc.fillRect(x, y, 1, 1); } }
    leds.needsUpdate = true;
  }
  drawLeds();
  const rackMat = own(new THREE.MeshStandardMaterial({ color: '#20282d', roughness: .4, metalness: .6 }));
  const faceMat = own(new THREE.MeshStandardMaterial({ map: leds, emissiveMap: leds, emissive: '#ffffff', emissiveIntensity: 1.2, roughness: .3 }));
  const dc = new THREE.Group(); scene.add(dc);
  add(own(new THREE.BoxGeometry(70, 1.5, 78)), concrete, 918, .7, 208, dc);
  for (let i = 0; i < 5; i++) {
    const z = 182 + i * 13; add(own(new THREE.BoxGeometry(12, 24, 11)), rackMat, 912, 13, z, dc);
    const face = add(own(new THREE.PlaneGeometry(10, 22)), faceMat, 905.9, 13, z, dc); face.rotation.y = -Math.PI / 2; face.castShadow = false;
  }
  add(own(new THREE.BoxGeometry(16, 12, 30)), own(new THREE.MeshStandardMaterial({ color: '#c9cfcc', roughness: .5, metalness: .4 })), 936, 6.5, 205, dc);
  const fans = [];
  for (const z of [196, 214]) { add(own(new THREE.CylinderGeometry(6, 6, .6, 24)), dark, 936, 12.9, z, dc); const fan = add(own(new THREE.BoxGeometry(11, .3, 1.4)), lightMetal, 936, 13.3, z, dc); fans.push(fan); }
  const fibreMat = own(new THREE.MeshStandardMaterial({ color: '#f2b233', emissive: '#ffcf4a', emissiveIntensity: .5, roughness: .4 }));
  const trunk = (pts, r = .9) => add(own(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p))), 60, r, 8)), fibreMat);
  trunk([[906, 20, 180], [890, 24, 170], [860, 22, 160], [840, 16, 145], [835, 12, 140]]);
  trunk([[906, 8, 236], [905, 1.2, 262], [935, 1.2, 296], [990, 1.2, 318]], .7);

  // ---- Sylex health board above the main building ----
  const boardCanvas = document.createElement('canvas'); boardCanvas.width = 512; boardCanvas.height = 112;
  const boardTex = own(new THREE.CanvasTexture(boardCanvas)); boardTex.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: boardTex, depthTest: false, transparent: true }))); board.position.set(750, 168, 64); board.scale.set(150, 33, 1); board.renderOrder = 15; scene.add(board);
  let shownHealth = -1, hurt = 0;
  function drawBoard(health, max) {
    const c = boardCanvas.getContext('2d'), f = Math.max(0, health / max);
    c.clearRect(0, 0, 512, 112); c.fillStyle = 'rgba(16,34,42,.88)'; c.beginPath(); c.roundRect(4, 4, 504, 104, 18); c.fill();
    c.fillStyle = '#f4e7b6'; c.font = '700 34px Segoe UI, sans-serif'; c.fillText('SYLEX', 22, 46);
    c.fillStyle = '#d6e4dc'; c.font = '600 28px Segoe UI, sans-serif'; c.textAlign = 'right'; c.fillText(`${health} / ${max}`, 490, 46); c.textAlign = 'left';
    c.fillStyle = '#29424b'; c.beginPath(); c.roundRect(22, 62, 468, 28, 14); c.fill();
    c.fillStyle = f > .5 ? '#7fd67a' : f > .25 ? '#f1c24b' : '#ff6a55'; c.beginPath(); c.roundRect(22, 62, Math.max(28, 468 * f), 28, 14); c.fill();
    boardTex.needsUpdate = true;
  }

  // ---- Quadcopter drones (pooled) ----
  const droneBody = own(new THREE.BoxGeometry(7, 2.4, 7)), droneArm = own(new THREE.BoxGeometry(14, .8, 1.2)), rotorGeo = own(new THREE.CylinderGeometry(3.4, 3.4, .25, 16)), camGeo = own(new THREE.SphereGeometry(1.4, 12, 8));
  const droneMat = own(new THREE.MeshStandardMaterial({ color: '#e8ecea', roughness: .35, metalness: .4 })), rotorMat = own(new THREE.MeshBasicMaterial({ color: '#c9d6dc', transparent: true, opacity: .35, depthWrite: false }));
  const droneLed = own(new THREE.MeshBasicMaterial({ color: '#7fe8ff', toneMapped: false }));
  const drones = Array.from({ length: 6 }, () => {
    const g = new THREE.Group(); g.visible = false; g.scale.setScalar(1.8); scene.add(g);
    add(droneBody, droneMat, 0, 0, 0, g); for (const r of [Math.PI / 4, -Math.PI / 4]) add(droneArm, dark, 0, .4, 0, g).rotation.y = r;
    const rotors = [[5, 5], [-5, 5], [5, -5], [-5, -5]].map(([x, z]) => { const m = add(rotorGeo, rotorMat, x, 1.4, z, g); m.castShadow = false; return m; });
    add(camGeo, dark, 0, -1.6, -2.4, g); const led = add(own(new THREE.SphereGeometry(.6, 8, 6)), droneLed, 0, .4, -3.6, g); led.castShadow = false;
    return { g, rotors, last: new THREE.Vector3() };
  });

  let ledTimer = 0;
  // Returns true while something is visibly animating.
  function update(game, dt, time, { playing, reduced, fx }) {
    if (!reduced) { ripples.offset.x += dt * .015; ripples.offset.y -= dt * .04; fans.forEach(f => { f.rotation.y += dt * 9; }); }
    ledTimer += dt; if (ledTimer > .3) { ledTimer = 0; drawLeds(); }
    // A portal glows when zombies are about to come through it.
    const soon = new Set(); if (playing && game.state === 'wave') for (const q of game.queue) { if (q.at - game.time > 4) break; soon.add(q.route); }
    for (const p of portals) {
      const target = soon.has(p.index) ? 1 : .18; p.glow += (target - p.glow) * Math.min(1, dt * 3);
      const pulse = reduced ? 1 : .85 + Math.sin(time * 5 + p.index) * .15;
      p.disc.material.opacity = .25 + p.glow * .6 * pulse; ringMat.emissiveIntensity = .15;
      if (!reduced) p.disc.rotation.z -= dt * (.4 + p.glow * 2.2);
      if (soon.has(p.index) && !reduced && Math.random() < dt * 20) fx.sparks(p.center.x, p.center.y, p.center.z, 2, 18);
    }
    if (game.health !== shownHealth) { if (shownHealth > game.health && playing) { hurt = 1; fx.sparks(805, 12, 150, 14, 50); } shownHealth = game.health; drawBoard(game.health, game.maxHealth); }
    hurt = Math.max(0, hurt - dt * 2); board.material.color.setRGB(1, 1 - hurt * .5, 1 - hurt * .5);
    board.visible = true;
    drones.forEach((d, i) => {
      const s = playing ? game.drones[i] : null; d.g.visible = !!s; if (!s) return;
      const y = 62 + (reduced ? 0 : Math.sin(time * 3 + i) * 2.5), dx = s.x - d.last.x, dz = s.y - d.last.z;
      if (dx * dx + dz * dz > .01) d.g.rotation.y = Math.atan2(-dx, -dz);
      d.g.rotation.x = reduced ? 0 : -Math.min(.35, Math.hypot(dx, dz) * .08);
      d.g.position.set(s.x, y, s.y); d.last.set(s.x, y, s.y);
      if (!reduced) d.rotors.forEach((r, k) => { r.rotation.y += dt * (k % 2 ? 40 : -40); });
    });
    return playing;
  }
  function dispose() { owned.forEach(x => x.dispose()); }
  return { update, dispose };
}
