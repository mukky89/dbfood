import * as THREE from './vendor/three/three.module.js';

// Pooled combat effects for the Sylex 3D scene. Everything is allocated once;
// update() only rewrites typed arrays and pooled transforms.
// Game coordinates (x,y) map to world (x,·,z); heights are world units.

const PARTICLE_VERTEX = `
attribute float psize;attribute float palpha;attribute vec3 pcolor;
uniform float uScale;varying vec3 vColor;varying float vAlpha;
void main(){vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;
gl_PointSize=psize*projectionMatrix[1][1]*uScale/max(1.,-mv.z);vColor=pcolor;vAlpha=palpha;}`;
const PARTICLE_FRAGMENT = `
varying vec3 vColor;varying float vAlpha;
void main(){float d=length(gl_PointCoord-.5);if(d>.5)discard;gl_FragColor=vec4(vColor,vAlpha*smoothstep(.5,.12,d));}`;
const STRIDE = 19; // px py pz vx vy vz age life s0 s1 a0 gravity drag r0 g0 b0 r1 g1 b1

function particleSystem(scene, max, blending) {
  const geometry = new THREE.BufferGeometry();
  const pos = new Float32Array(max * 3), col = new Float32Array(max * 3), alpha = new Float32Array(max), size = new Float32Array(max);
  const attr = (a, n) => new THREE.BufferAttribute(a, n).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', attr(pos, 3)); geometry.setAttribute('pcolor', attr(col, 3));
  geometry.setAttribute('palpha', attr(alpha, 1)); geometry.setAttribute('psize', attr(size, 1));
  const material = new THREE.ShaderMaterial({ uniforms: { uScale: { value: 360 } }, vertexShader: PARTICLE_VERTEX, fragmentShader: PARTICLE_FRAGMENT, transparent: true, depthWrite: false, blending });
  const points = new THREE.Points(geometry, material); points.frustumCulled = false; points.renderOrder = 5; scene.add(points);
  const data = new Float32Array(max * STRIDE); let cursor = 0, live = 0;
  function emit(x, y, z, vx, vy, vz, life, s0, s1, a0, gravity, drag, c0, c1 = c0) {
    const o = cursor * STRIDE; cursor = (cursor + 1) % max;
    data[o] = x; data[o + 1] = y; data[o + 2] = z; data[o + 3] = vx; data[o + 4] = vy; data[o + 5] = vz; data[o + 6] = 0; data[o + 7] = life;
    data[o + 8] = s0; data[o + 9] = s1; data[o + 10] = a0; data[o + 11] = gravity; data[o + 12] = drag;
    data[o + 13] = c0.r; data[o + 14] = c0.g; data[o + 15] = c0.b; data[o + 16] = c1.r; data[o + 17] = c1.g; data[o + 18] = c1.b;
  }
  function update(dt) {
    live = 0;
    for (let i = 0; i < max; i++) {
      const o = i * STRIDE, life = data[o + 7];
      if (life <= 0) { alpha[i] = 0; size[i] = 0; continue; }
      const age = data[o + 6] + dt;
      if (age >= life) { data[o + 7] = 0; alpha[i] = 0; size[i] = 0; continue; }
      data[o + 6] = age; live++;
      const drag = Math.max(0, 1 - data[o + 12] * dt);
      data[o + 3] *= drag; data[o + 5] *= drag; data[o + 4] = data[o + 4] * drag - data[o + 11] * dt;
      data[o] += data[o + 3] * dt; data[o + 1] = Math.max(.5, data[o + 1] + data[o + 4] * dt); data[o + 2] += data[o + 5] * dt;
      const t = age / life;
      pos[i * 3] = data[o]; pos[i * 3 + 1] = data[o + 1]; pos[i * 3 + 2] = data[o + 2];
      size[i] = data[o + 8] + (data[o + 9] - data[o + 8]) * t;
      alpha[i] = data[o + 10] * (1 - t) * Math.min(1, t * 8 + .2);
      for (let k = 0; k < 3; k++) col[i * 3 + k] = data[o + 13 + k] + (data[o + 16 + k] - data[o + 13 + k]) * t;
    }
    for (const name of ['position', 'pcolor', 'palpha', 'psize']) geometry.attributes[name].needsUpdate = true;
  }
  function clear() { for (let i = 0; i < max; i++) data[i * STRIDE + 7] = 0; update(0); }
  return { emit, update, clear, points, material, get live() { return live; } };
}

// A unit cylinder along +Y, stretched between two points.
const UP = new THREE.Vector3(0, 1, 0);
function stretch(mesh, a, b, radius) {
  const dir = mesh.userData.dir || (mesh.userData.dir = new THREE.Vector3());
  dir.subVectors(b, a); const length = Math.max(.001, dir.length());
  mesh.position.copy(a).addScaledVector(dir, .5);
  mesh.quaternion.setFromUnitVectors(UP, dir.multiplyScalar(1 / length));
  mesh.scale.set(radius, length, radius);
}

function radialTexture(inner, outer) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const c = cv.getContext('2d');
  const g = c.createRadialGradient(64, 64, 4, 64, 64, 64); g.addColorStop(0, inner); g.addColorStop(.55, inner); g.addColorStop(1, outer);
  c.fillStyle = g; c.fillRect(0, 0, 128, 128);
  // Irregular soot speckles so scorch marks do not read as perfect discs.
  let seed = 77; const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < 260; i++) { const a = rand() * 6.283, r = 18 + rand() * 44; c.fillStyle = `rgba(20,18,14,${.05 + rand() * .2})`; c.beginPath(); c.arc(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, 1 + rand() * 4, 0, 6.283); c.fill(); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createEffects(scene, { slots }) {
  const owned = [];
  const own = x => (owned.push(x), x);
  const glow = particleSystem(scene, 700, THREE.AdditiveBlending);
  const smoke = particleSystem(scene, 500, THREE.NormalBlending);
  const unitCylinder = own(new THREE.CylinderGeometry(1, 1, 1, 8, 1, true));
  const additive = color => own(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  const pool = (n, make) => Array.from({ length: n }, () => { const m = make(); m.visible = false; m.castShadow = false; m.receiveShadow = false; m.frustumCulled = false; scene.add(m); return m; });

  // Shots are optical LC connectors on a glowing fibre; beams fade per mesh.
  const tracers = pool(40, () => new THREE.Mesh(unitCylinder, additive('#9ff4ff')));
  const lcBody = own(new THREE.BoxGeometry(1.8, 1.8, 4.2)), lcFerrule = own(new THREE.CylinderGeometry(.5, .5, 2.4, 10)), lcBoot = own(new THREE.CylinderGeometry(.7, 1, 3, 10)), lcLatch = own(new THREE.BoxGeometry(.6, 1, 2.6));
  lcFerrule.rotateX(Math.PI / 2); lcFerrule.translate(0, 0, -3.2); lcBoot.rotateX(Math.PI / 2); lcBoot.translate(0, 0, 3.4); lcLatch.translate(0, 1.2, -.4); lcLatch.rotateX(-.2);
  const lcBlue = own(new THREE.MeshStandardMaterial({ color: '#2f6fd6', roughness: .35, metalness: .1, emissive: '#0c2a66', emissiveIntensity: .6 }));
  const lcCeramic = own(new THREE.MeshStandardMaterial({ color: '#f4f1e8', roughness: .25 })), lcBootMat = own(new THREE.MeshStandardMaterial({ color: '#d6dde0', roughness: .5 }));
  const connectors = pool(40, () => { const g = new THREE.Group(); for (const [geo, m] of [[lcBody, lcBlue], [lcFerrule, lcCeramic], [lcBoot, lcBootMat], [lcLatch, lcBlue]]) g.add(new THREE.Mesh(geo, m)); return g; });
  const beamCores = pool(16, () => new THREE.Mesh(unitCylinder, additive('#fff4f0')));
  const beamGlows = pool(16, () => new THREE.Mesh(unitCylinder, additive('#ff5a4a')));
  beamGlows.forEach(m => { m.material.opacity = .35; m.renderOrder = 4; });
  const flashGeometry = own(new THREE.SphereGeometry(1, 12, 8));
  const flashes = pool(16, () => new THREE.Mesh(flashGeometry, additive('#ffd38a')));
  const fireballs = pool(10, () => new THREE.Mesh(flashGeometry, additive('#ff9a3c')));
  // Mortar rounds: olive body with a dark nose, oriented along their arc.
  const shellGeometry = own(new THREE.CapsuleGeometry(1.8, 4.5, 4, 10)); shellGeometry.rotateX(Math.PI / 2);
  const shellMaterial = own(new THREE.MeshStandardMaterial({ color: '#4f5a3a', roughness: .5, metalness: .5 }));
  const shells = pool(32, () => { const m = new THREE.Mesh(shellGeometry, shellMaterial); return m; });
  shells.forEach(m => { m.castShadow = true; });
  const scorchTexture = own(radialTexture('rgba(24,20,16,.85)', 'rgba(24,20,16,0)'));
  const scorchGeometry = own(new THREE.PlaneGeometry(1, 1)); scorchGeometry.rotateX(-Math.PI / 2);
  const scorches = pool(14, () => new THREE.Mesh(scorchGeometry, own(new THREE.MeshBasicMaterial({ map: scorchTexture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }))));
  scorches.forEach(m => { m.renderOrder = 1; m.userData.life = 0; });
  let scorchCursor = 0;
  const flashState = flashes.map(() => ({ life: 0, max: 1, size: 1 })), fireState = fireballs.map(() => ({ life: 0, max: 1, size: 1 }));
  let flashCursor = 0, fireCursor = 0;

  const seen = new WeakSet();
  const slotAt = new Map(slots.map((p, i) => [p[0] + ',' + p[1], i]));
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), D = new THREE.Vector3();
  const color = (hex) => new THREE.Color(hex);
  const C_SPARK = color('#ffe6a8'), C_SPARK_END = color('#ff6a1a'), C_FROST = color('#d8f4ff'), C_FROST_END = color('#5aa7ff');
  const C_SMOKE = color('#6b6a64'), C_SMOKE_END = color('#a9a8a0'), C_DUST = color('#8f8467'), C_DUST_END = color('#b5ad93');
  const C_SPORE = color('#d8e27a'), C_SPORE_END = color('#7f8f3a');
  const C_FIRE = color('#fff0b0'), C_FIRE_END = color('#ff4a12'), C_LASER = color('#ffd0c8'), C_LASER_END = color('#ff3020');
  let budget = 1, reduced = false, time = 0, rand = 1;
  const random = () => (rand = (rand * 1664525 + 1013904223) >>> 0) / 4294967296;
  const spread = s => (random() - .5) * 2 * s;

  function sparks(x, y, z, n, speed, c0 = C_SPARK, c1 = C_SPARK_END) {
    if (reduced) return; n = Math.round(n * budget);
    for (let i = 0; i < n; i++) glow.emit(x, y, z, spread(speed), random() * speed * .9 + speed * .2, spread(speed), .25 + random() * .35, 2.2, .4, 1, 160, 2.5, c0, c1);
  }
  function puff(x, y, z, n, size, rise = 14, c0 = C_SMOKE, c1 = C_SMOKE_END, alpha = .55) {
    if (reduced) return; n = Math.round(n * budget);
    for (let i = 0; i < n; i++) smoke.emit(x + spread(size * .3), y + random() * 3, z + spread(size * .3), spread(8), rise * (.5 + random()), spread(8), 1.2 + random() * 1.4, size * .5, size * 1.6, alpha, -2, 1.2, c0, c1);
  }
  function flash(p, size, hex) {
    const i = flashCursor = (flashCursor + 1) % flashes.length, m = flashes[i];
    m.material.color.set(hex); m.position.copy(p); const f = flashState[i]; f.life = f.max = .07; f.size = size; m.visible = true;
  }
  function explosion(x, z, radius) {
    const i = fireCursor = (fireCursor + 1) % fireballs.length;
    fireballs[i].position.set(x, 6, z); const f = fireState[i]; f.life = f.max = .35; f.size = radius * .32; fireballs[i].visible = true;
    sparks(x, 6, z, 26, 90, C_FIRE, C_FIRE_END);
    puff(x, 4, z, 16, 26, 18);
    puff(x, 2, z, 10, 18, 6, C_DUST, C_DUST_END, .45);
    const s = scorches[scorchCursor = (scorchCursor + 1) % scorches.length];
    s.position.set(x, 2.3 + scorchCursor * .01, z); s.rotation.y = random() * 6.28; s.scale.set(radius * 1.3, 1, radius * 1.3);
    s.userData.life = 7; s.material.opacity = .8; s.visible = true;
  }

  // Effects are created by the engine; each one is decorated exactly once.
  function spawn(e, muzzle) {
    const slot = slotAt.get(e.x + ',' + e.y);
    const from = slot === undefined ? A.set(e.x, 20, e.y) : muzzle(slot, A);
    if (e.kind === 'shot') { flash(from, 3.2, '#ffd38a'); sparks(e.tx, 18, e.ty, 7, 45); puff(from.x, from.y, from.z, 2, 6, 8, C_SMOKE, C_SMOKE_END, .3); }
    else if (e.kind === 'frost') {
      flash(from, 2.6, '#bfe8ff');
      if (!reduced) for (let i = 0, n = Math.round(14 * budget); i < n; i++) { const t = .35 + random() * .5; glow.emit(from.x, from.y, from.z, (e.tx - from.x) / t + spread(14), (16 - from.y) / t + spread(6), (e.ty - from.z) / t + spread(14), t, 2, 6, .8, 0, .4, C_FROST, C_FROST_END); }
    }
    else if (e.kind === 'shell') { flash(from, 5, '#ffcf7a'); puff(from.x, from.y, from.z, 8, 14, 20); }
    else if (e.kind === 'drone') { flash(A.set(e.x, 60, e.y), 2, '#9ff4ff'); sparks(e.tx, 16, e.ty, 6, 40, C_FROST, C_FROST_END); }
    else if (e.kind === 'blast') explosion(e.tx, e.ty, 60);
    else if (e.kind === 'spores') { puff(e.tx, 10, e.ty, 22, 30, 6, C_SPORE, C_SPORE_END, .5); sparks(e.tx, 14, e.ty, 12, 25, C_SPORE, C_SPORE_END); }
    return slot;
  }

  // Returns the slots that fired this frame so towers can recoil.
  function update(game, dt, { playing, muzzle, quality, reducedMotion }) {
    budget = quality; reduced = reducedMotion; time += dt;
    const fired = [];
    if (playing) for (const e of game.effects) if (!seen.has(e)) { seen.add(e); if (e.kind !== 'beam') { const s = spawn(e, muzzle); if (s !== undefined) fired.push(s); } }
    let tracer = 0, beam = 0;
    if (playing) for (const e of game.effects) {
      if ((e.kind === 'shot' || e.kind === 'drone') && tracer < tracers.length) {
        // A short bright slug travelling from the muzzle to the target.
        const slot = e.kind === 'drone' ? undefined : slotAt.get(e.x + ',' + e.y), from = slot === undefined ? A.set(e.x, e.kind === 'drone' ? 60 : 20, e.y) : muzzle(slot, A);
        const p = reduced ? 1 : Math.min(1, 1 - e.life / .18 + .35), q = reduced ? 0 : Math.max(0, p - .35);
        B.set(e.tx, 18, e.ty); C.lerpVectors(from, B, q); D.lerpVectors(from, B, p);
        const m = tracers[tracer], lc = connectors[tracer++]; m.material.opacity = reduced ? .4 : .85; stretch(m, C, D, .28); m.visible = true;
        lc.position.copy(D); lc.lookAt(from); lc.visible = e.kind === 'shot'; m.material.color.set(e.kind === 'shot' ? '#9ff4ff' : '#7fe8ff');
      } else if (e.kind === 'beam' && beam < beamCores.length) {
        const slot = slotAt.get(e.x + ',' + e.y), from = slot === undefined ? A.set(e.x, 20, e.y) : muzzle(slot, A);
        B.set(e.tx, 19, e.ty);
        const flicker = reduced ? 1 : .85 + Math.sin(time * 70 + beam) * .15;
        stretch(beamCores[beam], from, B, .55 * flicker); beamCores[beam].visible = true;
        stretch(beamGlows[beam], from, B, 2.4 * flicker); beamGlows[beam].material.color.set(e.color); beamGlows[beam].visible = true; beam++;
        if (!reduced && random() < .5 * budget) glow.emit(e.tx, 19, e.ty, spread(30), random() * 30, spread(30), .3, 2.4, .5, 1, 60, 2, C_LASER, C_LASER_END);
      }
    }
    for (let i = tracer; i < tracers.length; i++) tracers[i].visible = connectors[i].visible = false;
    for (let i = beam; i < beamCores.length; i++) beamCores[i].visible = beamGlows[i].visible = false;

    // Mortar rounds follow a ballistic arc derived from the engine's flight timer.
    let s = 0;
    if (playing) for (const sh of game.shells) {
      if (s >= shells.length) break;
      const slot = slotAt.get(sh.x + ',' + sh.y), from = slot === undefined ? A.set(sh.x, 30, sh.y) : muzzle(slot, A);
      const p = Math.min(1, Math.max(0, 1 - sh.t / sh.flight)), span = Math.hypot(sh.tx - sh.x, sh.ty - sh.y), apex = 45 + span * .35;
      const at = (k, out) => out.set(from.x + (sh.tx - from.x) * k, from.y + (4 - from.y) * k + 4 * apex * k * (1 - k), from.z + (sh.ty - from.z) * k);
      const m = shells[s++]; at(p, m.position); at(Math.min(1, p + .02), B);
      if (B.distanceToSquared(m.position) > 1e-6) m.lookAt(B);
      m.visible = true;
      if (!reduced && random() < .6 * budget) smoke.emit(m.position.x, m.position.y, m.position.z, 0, 2, 0, .7, 2, 5, .35, 0, .5, C_SMOKE, C_SMOKE_END);
    }
    for (let i = s; i < shells.length; i++) shells[i].visible = false;

    flashes.forEach((m, i) => { const f = flashState[i]; if (!m.visible) return; f.life -= dt; if (f.life <= 0) { m.visible = false; return; } const k = f.life / f.max; m.scale.setScalar(f.size * (1.4 - k * .4)); m.material.opacity = k; });
    fireballs.forEach((m, i) => { const f = fireState[i]; if (!m.visible) return; f.life -= dt; if (f.life <= 0) { m.visible = false; return; } const k = 1 - f.life / f.max; m.scale.setScalar(f.size * (reduced ? .8 : .3 + k)); m.material.opacity = (1 - k) * (1 - k) * .9; m.material.color.setRGB(1, .75 - k * .5, .35 - k * .3); });
    for (const m of scorches) { if (!m.visible) continue; m.userData.life -= dt; if (m.userData.life <= 0) m.visible = false; else m.material.opacity = Math.min(.8, m.userData.life / 3); }
    glow.update(dt); smoke.update(dt);
    glow.points.visible = smoke.points.visible = playing;
    return fired;
  }
  function busy() { return glow.live + smoke.live > 0 || flashes.some(m => m.visible) || fireballs.some(m => m.visible) || scorches.some(m => m.visible); }
  function setViewport(height) { glow.material.uniforms.uScale.value = smoke.material.uniforms.uScale.value = height / 2; }
  function dust(x, z, size) { puff(x, 2, z, 6, size, 5, C_DUST, C_DUST_END, .4); }
  function reset() { glow.clear(); smoke.clear(); [...flashes, ...fireballs, ...scorches, ...shells, ...tracers, ...connectors, ...beamCores, ...beamGlows].forEach(m => { m.visible = false; }); }
  function dispose() { owned.forEach(x => x.dispose()); glow.material.dispose(); smoke.material.dispose(); glow.points.geometry.dispose(); smoke.points.geometry.dispose(); }
  return { update, busy, setViewport, dust, sparks, reset, dispose };
}
