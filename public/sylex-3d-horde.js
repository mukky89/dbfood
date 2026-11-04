import * as THREE from './vendor/three/three.module.js';

// Zombies as a skeleton of joints posed per enemy; each body part is one
// InstancedMesh, so the whole horde costs ~25 draw calls and no allocations.
// Bodies face -Z; game (x,y) maps to world (x,·,z).

const MAX = 280;
const KINDS = {
  walker:  { scale: 1,    lean: -.18, reach: 1.25, freq: .17, swing: .45, limp: true, shirts: ['#5d6b55', '#6c5a48', '#4f5d6b', '#7a6f5b'], pants: '#3b4148', parts: ['hair'] },
  runner:  { scale: .95,  lean: -.42, reach: 0,    freq: .12, swing: .8, run: true, shirts: ['#8a3b32', '#3b5f7a', '#6b7a3a'], pants: '#2f3236', parts: ['hair'] },
  armored: { scale: 1.08, lean: -.06, reach: .85,  freq: .15, swing: .35, shirts: ['#3d4a3f'], pants: '#2f3a33', parts: ['helmet', 'vest', 'belt'] },
  swarm:   { scale: .68,  lean: -.7,  reach: 1.6,  freq: .24, swing: .55, shirts: ['#5b524a', '#4a5560', '#665d4c'], pants: '#3a3631', parts: ['hair'] },
  cloaked: { scale: 1,    lean: -.28, reach: 1.1,  freq: .16, swing: .45, shirts: ['#2e3440'], pants: '#262a31', parts: ['hood'] },
  crawler: { scale: .9,   lean: -1.35, reach: 1.9, freq: .2,  swing: .5, crawl: true, shirts: ['#4d463c', '#3f4a52'], pants: '#2f2c28', parts: ['hair', 'fungus-head'] },
  spore:   { scale: 1.2,  lean: -.08, reach: .6,   freq: .09, swing: .3, wide: 1.55, limp: true, shirts: ['#6f6650'], pants: '#3a362d', parts: ['fungus-head', 'fungus-back', 'fungus-arm'] },
  leader:  { scale: 1.45, lean: -.1,  reach: .8,   freq: .12, swing: .38, wide: 1.2, redEyes: true, shirts: ['#3b2f2a'], pants: '#24221f', parts: ['plates', 'belt', 'fungus-head', 'fungus-back', 'crown'] },
  boss:    { scale: 1.75, lean: -.12, reach: .7,   freq: .1,  swing: .35, wide: 1.25, shirts: ['#4b3d36'], pants: '#2c2a27', parts: ['plates', 'belt', 'fungus-back', 'fungus-arm'] },
  brute:   { scale: 1.25, lean: -.15, reach: .9,   freq: .13, swing: .4,  wide: 1.15, shirts: ['#4b3d36'], pants: '#2c2a27', parts: ['plates'] },
};
const SKINS = ['#8b9d68', '#9aa37a', '#7f9170', '#a3a88a', '#93a080'];

export function createHorde(scene, { position }) {
  const owned = [];
  const own = x => (owned.push(x), x);
  const capsule = (r, l) => { const g = own(new THREE.CapsuleGeometry(r, l, 3, 10)); g.translate(0, -(l / 2 + r * .45), 0); return g; };
  const cap = (r, open) => own(new THREE.SphereGeometry(r, 14, 7, 0, Math.PI * 2, 0, open));
  const box = (w, h, d) => own(new THREE.BoxGeometry(w, h, d));
  const ball = r => own(new THREE.SphereGeometry(r, 14, 10));

  // ---- Skeleton template, re-posed for every enemy ----
  const node = (parent, x = 0, y = 0, z = 0) => { const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); return o; };
  const root = new THREE.Object3D(), hips = node(root, 0, 12, 0), torso = node(hips, 0, 1.5, 0), neck = node(torso, 0, 12.2, -.3), head = node(neck, 0, 3, 0), jaw = node(head, 0, -2.3, -1.4);
  const arm = side => { const shoulder = node(torso, side * 6, 10.4, 0), elbow = node(shoulder, 0, -6, 0), hand = node(elbow, 0, -6, 0); return { shoulder, elbow, hand }; };
  const leg = side => { const thigh = node(hips, side * 2.7, -1, 0), knee = node(thigh, 0, -5.6, 0), ankle = node(knee, 0, -5.4, 0); return { thigh, knee, ankle }; };
  const L = arm(-1), R = arm(1), LL = leg(-1), RL = leg(1);
  const torsoShape = node(torso, 0, 6, 0);

  // [joint, geometry, material, tint, kinds, offset, scale, rotation]
  const G = {
    pelvis: box(8.6, 4, 5.6), torso: own(new THREE.CapsuleGeometry(4.3, 4.6, 4, 12)), head: ball(3.6), jaw: box(4, 1.5, 3.2), eye: ball(.55),
    hair: cap(3.8, 1.25), helmet: cap(4.3, 1.45), brim: own(new THREE.CylinderGeometry(4.9, 4.9, .5, 18)), hood: cap(4.5, 2.05),
    upper: capsule(1.45, 4.2), fore: capsule(1.2, 4.4), hand: ball(1.5), thigh: capsule(1.9, 4), shin: capsule(1.6, 4.2), foot: box(3.2, 1.8, 5.4),
    shelf: own(new THREE.SphereGeometry(2.4, 12, 6, 0, Math.PI * 2, 0, 1.1)), knob: ball(1.3), spike: own(new THREE.ConeGeometry(.7, 3.6, 7)),
    vest: box(11, 8.5, 7.2), stripe: box(11.2, .9, 7.4), belt: box(9.2, 1.3, 6), plate: box(5.4, 2.2, 6), rag: box(7, 3.5, .5),
  };
  const PARTS = [
    [hips, G.pelvis, 'cloth', 'pants', null, [0, 0, 0]],
    [torsoShape, G.torso, 'cloth', 'shirt', null, [0, 0, 0], [1.15, 1, .72]],
    [torso, G.rag, 'cloth', 'shirt', ['walker', 'runner', 'swarm'], [1.5, 2.6, 3.4], [1, 1, 1], [0, 0, .3]],
    [hips, G.belt, 'dark', null, ['armored', 'boss'], [0, 1.6, 0]],
    [torso, G.vest, 'hivis', null, ['armored'], [0, 7, 0]],
    [torso, G.stripe, 'reflect', null, ['armored'], [0, 5, 0]],
    [torso, G.stripe, 'reflect', null, ['armored'], [0, 9, 0]],
    [head, G.head, 'skin', 'skin', null, [0, 0, 0], [1, 1.12, 1]],
    [jaw, G.jaw, 'skin', 'skin', null, [0, 0, -.6]],
    [head, G.eye, 'eye', 'eye', null, [-1.3, .5, -3.1]],
    [head, G.eye, 'eye', 'eye', null, [1.3, .5, -3.1]],
    [head, G.hair, 'dark', null, ['hair'], [0, .4, .2], [1, 1, 1], [-.25, 0, 0]],
    [head, G.helmet, 'metal', null, ['helmet'], [0, .6, 0]],
    [head, G.brim, 'metal', null, ['helmet'], [0, 1.2, 0]],
    [head, G.hood, 'cloth', 'shirt', ['hood'], [0, .5, .6], [1, 1.1, 1.1], [-.35, 0, 0]],
    // Fungal growths: layered shelf fungus and knobs breaking through skin and cloth.
    [head, G.shelf, 'fungus', null, ['fungus-head'], [1.6, 2.2, .4], [1, .45, 1], [0, 0, -.6]],
    [head, G.shelf, 'fungus', null, ['fungus-head'], [-1.2, 2.8, -.6], [.8, .4, .8], [.2, 0, .5]],
    [head, G.knob, 'fungus', null, ['fungus-head'], [-2.4, 1, 1.4]],
    [torso, G.shelf, 'fungus', null, ['fungus-back'], [-2, 9, 3.4], [1.3, .5, 1.1], [-1.3, 0, .2]],
    [torso, G.shelf, 'fungus', null, ['fungus-back'], [2.2, 6, 3.6], [1.1, .45, 1], [-1.4, 0, -.3]],
    [torso, G.knob, 'fungus', null, ['fungus-back'], [0, 3.5, 3.8], [1.4, 1.4, 1]],
    [R.shoulder, G.shelf, 'fungus', null, ['fungus-arm'], [1.2, .4, 0], [1, .5, 1], [0, 0, -.9]],
    [head, G.spike, 'fungus', null, ['crown'], [-1.8, 3.4, 0], [1, 1, 1], [0, 0, .45]],
    [head, G.spike, 'fungus', null, ['crown'], [1.8, 3.4, 0], [1, 1, 1], [0, 0, -.45]],
    [head, G.spike, 'fungus', null, ['crown'], [0, 4.2, .6], [1, 1.2, 1], [-.3, 0, 0]],
    [L.shoulder, G.upper, 'cloth', 'shirt', null, [0, 0, 0]], [R.shoulder, G.upper, 'cloth', 'shirt', null, [0, 0, 0]],
    [L.shoulder, G.plate, 'metal', null, ['plates'], [-.6, 1.2, 0], [1, 1, 1], [0, 0, .35]], [R.shoulder, G.plate, 'metal', null, ['plates'], [.6, 1.2, 0], [1, 1, 1], [0, 0, -.35]],
    [L.elbow, G.fore, 'skin', 'skin', null, [0, 0, 0]], [R.elbow, G.fore, 'skin', 'skin', null, [0, 0, 0]],
    [L.hand, G.hand, 'skin', 'skin', null, [0, 0, 0], [1, 1.25, .8]], [R.hand, G.hand, 'skin', 'skin', null, [0, 0, 0], [1, 1.25, .8]],
    [LL.thigh, G.thigh, 'cloth', 'pants', null, [0, 0, 0]], [RL.thigh, G.thigh, 'cloth', 'pants', null, [0, 0, 0]],
    [LL.knee, G.shin, 'cloth', 'pants', null, [0, 0, 0]], [RL.knee, G.shin, 'cloth', 'pants', null, [0, 0, 0]],
    [LL.ankle, G.foot, 'dark', null, null, [0, -.4, -1.2]], [RL.ankle, G.foot, 'dark', null, null, [0, -.4, -1.2]],
  ];
  const anchors = PARTS.map(([joint, , , , , o = [0, 0, 0], s = [1, 1, 1], r = [0, 0, 0]]) => { const a = node(joint, ...o); a.scale.set(...s); a.rotation.set(...r); return a; });
  const tags = kind => new Set([kind, ...KINDS[kind].parts]);
  const partKinds = PARTS.map(p => p[4] && new Set(p[4]));
  const showPart = Object.fromEntries(Object.keys(KINDS).map(k => { const t = tags(k); return [k, partKinds.map(s => !s || [...s].some(x => t.has(x)))]; }));

  const std = (o) => own(new THREE.MeshStandardMaterial(o));
  const solid = {
    skin: std({ color: '#ffffff', roughness: .78 }), cloth: std({ color: '#ffffff', roughness: .95 }), dark: std({ color: '#26282a', roughness: .85 }),
    metal: std({ color: '#7d878a', roughness: .35, metalness: .8 }), hivis: std({ color: '#c9d22a', roughness: .6, emissive: '#3a3d05', emissiveIntensity: .5 }),
    reflect: std({ color: '#e8eef0', roughness: .2, metalness: .6, emissive: '#5c6466', emissiveIntensity: .6 }),
    eye: own(new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false })),
    fungus: std({ color: '#c9a46a', roughness: .9, emissive: '#3a2a10', emissiveIntensity: .25 }),
  };
  const ghost = Object.fromEntries(Object.entries(solid).map(([k, m]) => { const g = own(m.clone()); g.transparent = true; g.opacity = k === 'eye' ? .9 : .22; g.depthWrite = false; if (g.color && k !== 'eye') g.color.multiplyScalar(.8); return [k, g]; }));

  function rig(materials, shadows) {
    return PARTS.map(([, geometry, m, tint]) => {
      const mesh = new THREE.InstancedMesh(geometry, materials[m], MAX);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.count = 0; mesh.frustumCulled = false;
      mesh.castShadow = shadows; mesh.receiveShadow = shadows;
      if (tint) { mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3); mesh.instanceColor.setUsage(THREE.DynamicDrawUsage); }
      mesh.userData.outlineable = shadows; mesh.userData.noOutline = !shadows;
      scene.add(mesh); return mesh;
    });
  }
  const rigs = [rig(solid, true), rig(ghost, false)];

  // Health bars are camera-facing quads drawn over the scene.
  const quad = own(new THREE.PlaneGeometry(1, 1));
  const barMaterial = c => own(new THREE.MeshBasicMaterial({ color: c, depthTest: false, depthWrite: false, transparent: true, opacity: .92, toneMapped: false }));
  const bars = [barMaterial('#14232a'), barMaterial('#ffffff')].map((m, i) => { const b = new THREE.InstancedMesh(quad, m, MAX); b.count = 0; b.userData.noOutline = true; b.frustumCulled = false; b.renderOrder = 20 + i; if (i) b.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3); scene.add(b); return b; });

  const states = new Map(), dying = [];
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3(), RIGHT = new THREE.Vector3();
  const colors = { shirt: new THREE.Color(), pants: new THREE.Color(), skin: new THREE.Color(), eye: new THREE.Color() };
  const FROST = new THREE.Color('#c4e6f7'), HIT = new THREE.Color('#ff7a64'), HEALTHY = new THREE.Color('#9fe39a'), HURT = new THREE.Color('#ff5b45'), TMP = new THREE.Color();
  const counts = [0, 0];

  function pose(kind, phase, time, id, fall) {
    const k = KINDS[kind], s = Math.sin(phase), swing = k.swing;
    root.rotation.z = 0; root.position.y = 2;
    root.scale.setScalar(k.scale); torsoShape.scale.set(1.15 * (k.wide || 1), 1, .72 * (k.wide || 1));
    hips.position.y = 12 + Math.abs(Math.cos(phase)) * (k.run ? 1.2 : .6); hips.rotation.set(0, s * .1, s * .05);
    LL.thigh.rotation.x = s * swing; RL.thigh.rotation.x = -s * swing * (k.limp ? .6 : 1);
    LL.knee.rotation.x = -Math.max(0, -Math.sin(phase + .7)) * swing * 1.6; RL.knee.rotation.x = -Math.max(0, Math.sin(phase + .7)) * swing * 1.6 - (k.limp ? .25 : 0);
    LL.ankle.rotation.x = -LL.thigh.rotation.x * .4; RL.ankle.rotation.x = -RL.thigh.rotation.x * .4;
    torso.rotation.set(k.lean + Math.sin(phase * 2) * .03, s * .1, 0);
    if (k.crawl) { // on all fours: hips low, thighs folded under, arms paw forward
      hips.position.y = 6.5 + Math.abs(Math.cos(phase)) * .5;
      LL.thigh.rotation.x = 1.2 + s * .35; RL.thigh.rotation.x = 1.2 - s * .35; LL.knee.rotation.x = RL.knee.rotation.x = -2.1;
      L.shoulder.rotation.set(1.35 + s * .45, 0, -.1); R.shoulder.rotation.set(1.35 - s * .45, 0, .1); L.elbow.rotation.x = R.elbow.rotation.x = -.4;
      neck.rotation.set(1.1, 0, 0); jaw.rotation.x = .5 + Math.sin(time * 6 + id) * .2;
      if (fall) { const f = Math.min(1, fall.t / .55); root.rotation.x = 0; root.rotation.z = f * 1.4; root.position.y = 2 - (fall.t > .9 ? (fall.t - .9) * 10 : 0); }
      return;
    }
    if (k.run) {
      L.shoulder.rotation.set(-s * .9, 0, -.12); R.shoulder.rotation.set(s * .9, 0, .12); L.elbow.rotation.x = R.elbow.rotation.x = 1.3;
    } else {
      L.shoulder.rotation.set(k.reach + s * .12, 0, -.18 - (k.wide ? .2 : 0)); R.shoulder.rotation.set(k.reach - s * .12 - (id % 3 === 0 ? .5 : 0), 0, .18 + (k.wide ? .2 : 0));
      L.elbow.rotation.x = .25 + Math.sin(time * 2 + id) * .05; R.elbow.rotation.x = .3;
    }
    neck.rotation.set(-k.lean * .6 + Math.sin(phase * .5) * .08, 0, (id % 2 ? .22 : -.18));
    jaw.rotation.x = .25 + Math.sin(time * 3 + id) * .15;
    if (fall) { // fall backwards from the feet, arms flop, then sink into the ground
      const f = Math.min(1, fall.t / .55), e = f * f;
      root.rotation.x = e * 1.45; L.shoulder.rotation.x = R.shoulder.rotation.x = 2.4 * e + k.reach * (1 - e);
      root.position.y = 2 - (fall.t > .9 ? (fall.t - .9) * 14 * k.scale : 0);
    } else root.rotation.x = 0;
  }

  function write(r, i, kind, variant, frost, hit) {
    const show = showPart[kind], k = KINDS[kind];
    colors.shirt.set(k.shirts[variant % k.shirts.length]); colors.pants.set(k.pants); colors.skin.set(SKINS[variant % SKINS.length]); colors.eye.set(k.redEyes ? '#ff5038' : '#f0f39a');
    for (const c of [colors.shirt, colors.pants, colors.skin]) { if (frost) c.lerp(FROST, .55); if (hit) c.lerp(HIT, hit); }
    root.updateMatrixWorld(true);
    r.forEach((mesh, p) => {
      mesh.setMatrixAt(i, show[p] ? anchors[p].matrixWorld : ZERO);
      const tint = PARTS[p][3]; if (tint) mesh.setColorAt(i, colors[tint]);
    });
  }

  function bar(i, x, y, z, frac, width, camera) {
    Q.copy(camera.quaternion); RIGHT.set(1, 0, 0).applyQuaternion(Q);
    V.set(x, y, z); S.set(width + 1.4, 3.6, 1); M.compose(V, Q, S); bars[0].setMatrixAt(i, M);
    V.addScaledVector(RIGHT, -(1 - frac) * width / 2); S.set(Math.max(.01, width * frac), 2.2, 1); M.compose(V, Q, S); bars[1].setMatrixAt(i, M);
    TMP.copy(HURT).lerp(HEALTHY, frac); bars[1].setColorAt(i, TMP);
  }

  // Returns true while death animations are still playing.
  function update(game, dt, time, { playing, camera, reduced, fx }) {
    counts[0] = counts[1] = 0; let barCount = 0;
    const alive = new Set();
    if (playing) for (const e of game.enemies) {
      alive.add(e);
      let st = states.get(e);
      if (!st) { st = { phase: (e.id * 1.7) % 6.28, last: e.distance, hp: e.hp, hit: 0, variant: e.id * 7 + 3 }; states.set(e, st); }
      const k = KINDS[e.kind];
      st.phase += (e.distance - st.last) * k.freq; st.last = e.distance;
      if (e.hp < st.hp - .01) st.hit = 1; st.hp = e.hp; st.hit = Math.max(0, st.hit - dt * 12);
      const ahead = position(e.distance + 2, e.route);
      st.x = e.x; st.z = e.y; st.yaw = Math.atan2(e.x - ahead.x, e.y - ahead.y);
      root.position.set(e.x, 2, e.y); root.rotation.set(0, st.yaw, 0);
      pose(e.kind, st.phase, time, e.id, null); root.position.set(e.x, 2, e.y);
      const g = e.cloak && !e.revealed ? 1 : 0;
      if (counts[g] < MAX) write(rigs[g], counts[g]++, e.kind, st.variant, e.slow > 0, reduced ? 0 : st.hit * .35);
      if (!g && barCount < MAX) bar(barCount++, e.x, 2 + (k.crawl ? 22 : 38) * k.scale, e.y, Math.max(0, e.hp / e.max), 18 + 10 * (k.scale - 1), camera);
    }
    for (const [e, st] of states) if (!alive.has(e)) {
      states.delete(e);
      if (playing && !e.escaped && !reduced && dying.length < 60) dying.push({ kind: e.kind, x: st.x, z: st.z, yaw: st.yaw, phase: st.phase, variant: st.variant, id: e.id, t: 0, dust: false });
    }
    for (let i = dying.length - 1; i >= 0; i--) {
      const d = dying[i]; d.t += dt;
      if (d.t > 1.7 || !playing) { dying.splice(i, 1); continue; }
      if (!d.dust && d.t > .5) { d.dust = true; fx.dust(d.x, d.z, 12 * KINDS[d.kind].scale); }
      root.position.set(d.x, 2, d.z); root.rotation.set(0, d.yaw, 0);
      pose(d.kind, d.phase, time, d.id, d); root.rotation.y = d.yaw; root.position.x = d.x; root.position.z = d.z;
      if (counts[0] < MAX) write(rigs[0], counts[0]++, d.kind, d.variant, false, 0);
    }
    rigs.forEach((r, g) => r.forEach(mesh => { mesh.count = counts[g]; if (mesh.userData.outline) mesh.userData.outline.count = counts[g]; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }));
    bars.forEach(b => { b.count = barCount; b.instanceMatrix.needsUpdate = true; if (b.instanceColor) b.instanceColor.needsUpdate = true; });
    return dying.length > 0;
  }
  function reset() { states.clear(); dying.length = 0; }
  function setQuality(shadows) { rigs[0].forEach(m => { m.castShadow = shadows; }); }
  function dispose() { owned.forEach(x => x.dispose()); }
  return { update, reset, setQuality, dispose };
}
