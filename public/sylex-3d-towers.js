import * as THREE from './vendor/three/three.module.js';

// Procedural tower models. A model is rebuilt only when its type, level or
// specialization changes; aiming, recoil and status lights animate in place.
// Turrets face -Z; yaw = atan2(-dx, -dz) points them at a target.

function stripes(a, b) {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 32; const c = cv.getContext('2d');
  c.fillStyle = a; c.fillRect(0, 0, 128, 32); c.fillStyle = b;
  for (let x = -32; x < 160; x += 32) { c.beginPath(); c.moveTo(x, 32); c.lineTo(x + 16, 32); c.lineTo(x + 32, 0); c.lineTo(x + 16, 0); c.fill(); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.repeat.set(9, 1); t.anisotropy = 4; return t;
}

export function createTowerFactory({ concrete, steel, lightMetal, dark, rubber }, types) {
  const owned = [], cache = new Map();
  const geo = (key, make) => { let g = cache.get(key); if (!g) { g = make(); cache.set(key, g); owned.push(g); } return g; };
  const cyl = (r1, r2, h, n = 18, open = false) => geo(`c${r1}/${r2}/${h}/${n}/${open}`, () => new THREE.CylinderGeometry(r1, r2, h, n, 1, open));
  const blk = (w, h, d) => geo(`b${w}/${h}/${d}`, () => new THREE.BoxGeometry(w, h, d));
  const sph = (r, w = 14, h = 10) => geo(`s${r}/${w}`, () => new THREE.SphereGeometry(r, w, h));
  const cap = (r, l) => geo(`k${r}/${l}`, () => new THREE.CapsuleGeometry(r, l, 4, 14));
  const tor = (R, r) => geo(`t${R}/${r}`, () => new THREE.TorusGeometry(R, r, 8, 28));
  const oct = r => geo(`o${r}`, () => new THREE.OctahedronGeometry(r));
  const dishGeo = (r, open) => geo(`d${r}/${open}`, () => new THREE.SphereGeometry(r, 30, 10, 0, Math.PI * 2, 0, open));
  const cable = (side) => geo(`cable${side}`, () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(side * 9, 5.6, 7), new THREE.Vector3(side * 12, 9, 8), new THREE.Vector3(side * 8.5, 14, 6), new THREE.Vector3(side * 6.6, 17, 3.5)]), 16, .75, 6));

  const mat = x => (owned.push(x), x);
  const hazardTexture = stripes('#e3b417', '#1d2124'); owned.push(hazardTexture);
  const hazard = mat(new THREE.MeshStandardMaterial({ map: hazardTexture, roughness: .55, metalness: .1 }));
  const paint = mat(new THREE.MeshStandardMaterial({ color: '#d4d8d1', roughness: .42, metalness: .35 }));
  const olive = mat(new THREE.MeshStandardMaterial({ color: '#59603f', roughness: .6, metalness: .3 }));
  const gold = mat(new THREE.MeshStandardMaterial({ color: '#e7c160', roughness: .3, metalness: .8, emissive: '#5a4310', emissiveIntensity: .4 }));
  const copper = mat(new THREE.MeshStandardMaterial({ color: '#b8703f', roughness: .3, metalness: .9 }));
  const ledIdle = mat(new THREE.MeshStandardMaterial({ color: '#1b3a24', emissive: '#37e079', emissiveIntensity: 1.6 }));
  const ledBusy = mat(new THREE.MeshStandardMaterial({ color: '#3a2a10', emissive: '#ffb02e', emissiveIntensity: 2.4 }));
  const trims = {}, glows = {};
  const trim = type => trims[type] || (trims[type] = mat(new THREE.MeshStandardMaterial({ color: types[type].color, roughness: .35, metalness: .4 })));
  const glowOf = color => glows[color] || (glows[color] = mat(new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.8, roughness: .2, metalness: .1, toneMapped: false })));
  const dishMaterial = mat(new THREE.MeshStandardMaterial({ color: '#e9ece6', roughness: .35, metalness: .5, side: THREE.DoubleSide }));
  const fibre = mat(new THREE.MeshStandardMaterial({ color: '#f2b233', emissive: '#7ae9ff', emissiveIntensity: .35, roughness: .4 }));
  const frost = mat(new THREE.MeshPhysicalMaterial({ color: '#cfe6f2', roughness: .2, metalness: .6, clearcoat: 1, clearcoatRoughness: .15 }));

  function part(parent, g, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    const mesh = new THREE.Mesh(g, m); mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  const along = Math.PI / 2; // rotate a Y cylinder to lie along Z

  function base(root, type, level) {
    part(root, cyl(18, 20, 5, 8), concrete, 0, 2.5, 0, 0, Math.PI / 8);
    part(root, cyl(16, 16, 3, 28), paint, 0, 6.5, 0);
    part(root, cyl(16.08, 16.08, 1.5, 28, true), hazard, 0, 6.4, 0);
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + Math.PI / 8; part(root, cyl(.8, .8, 1.3, 6), lightMetal, Math.cos(a) * 17, 5.4, Math.sin(a) * 17); }
    part(root, cyl(6.5, 8.5, 11, 16), steel, 0, 13.5, 0);
    part(root, blk(4.5, 6, .8), dark, 0, 13, -7.7);
    // Armoured optical fibre feeds the turret; the jacket glows faintly.
    for (const side of [-1, 1]) part(root, cable(side), fibre);
    part(root, blk(5, 4, 3.5), dark, 11.5, 7, 6.5); for (let i = 0; i < 4; i++) part(root, blk(.7, .7, .3), glowOf('#5ff0ff'), 10 + i, 7.6, 4.7);
    part(root, cyl(9.5, 9.5, 2, 28), dark, 0, 20, 0);
    part(root, blk(3.2, 1.6, 1.2), dark, 0, 8.2, -15.6);
    const led = part(root, sph(.9, 10, 8), ledIdle, 0, 8.4, -16.3); led.castShadow = false;
    for (let i = 0; i < level; i++) part(root, blk(2.2, .8, 1.4), gold, -3.4 + i * 3.4, 8.3, 13.2);
    root.userData.led = led;
  }

  function rapid(yaw, rec, muzzles, level, spec, t) {
    part(yaw, blk(15, 9, 17), paint, 0, 5.5, 0); part(yaw, blk(13, 1, 14), steel, 0, 10.4, 0);
    part(yaw, blk(15.3, 1.4, 17.3), t, 0, 3, 0);
    for (const z of [-3, 0, 3]) part(yaw, blk(.6, 3.5, 1.2), dark, -7.7, 6, z);
    part(yaw, blk(4, 3, 4), dark, 5, 11.6, -4); part(yaw, sph(1.2), glowOf('#7ff3ff'), 5, 11.6, -6.1);
    part(yaw, blk(5, 6, 9), olive, -10, 5, 2); part(yaw, blk(2.5, 2, 6), dark, -7.2, 7, -2);
    if (level >= 2) for (const s of [-1, 1]) part(yaw, blk(1.4, 9.5, 15), steel, s * 8.3, 6, 0);
    if (level >= 3) part(yaw, blk(16, 8, 1.8), steel, 0, 6, -9.3);
    if (spec === 'pierce') {
      part(rec, cyl(1.9, 2.3, 32, 14), lightMetal, 0, 0, -16, along);
      part(rec, blk(5, 3.4, 4), dark, 0, 0, -32);
      for (const s of [-1, 1]) part(rec, blk(.8, 1.4, 22), t, s * 2.8, 0, -14);
      muzzles.push(new THREE.Object3D()); muzzles[0].position.set(0, 0, -34.5);
    } else {
      const rows = spec === 'twin' ? [0, 4.2] : [0];
      for (const y of rows) for (const x of [-2.6, 2.6]) {
        part(rec, cyl(2, 2, 8, 12), dark, x, y, -4, along);
        part(rec, cyl(1.15, 1.15, 22, 12), lightMetal, x, y, -11, along);
        part(rec, cyl(1.75, 1.75, 2.6, 10), steel, x, y, -22, along);
        const m = new THREE.Object3D(); m.position.set(x, y, -23.6); muzzles.push(m);
      }
    }
    muzzles.forEach(m => rec.add(m)); rec.position.set(0, 5.5, -8.5);
    return 1.6;
  }

  function slow(yaw, rec, muzzles, level, spec, t) {
    part(yaw, cyl(8, 9, 8, 20), paint, 0, 4, 0); part(yaw, cyl(8.1, 9.1, 1.4, 20, true), t, 0, 2, 0);
    const tank = spec === 'freeze' ? glowOf('#8fd3ff') : frost;
    const xs = level >= 2 ? [-4.6, 4.6] : [0];
    for (const x of xs) { part(yaw, cap(3.6, 9), tank, x, 11, 2.5, along); for (const z of [-1.5, 6.5]) part(yaw, cyl(3.75, 3.75, .9, 16, true), steel, x, 11, z, along); }
    if (level >= 3) for (let i = 0; i < 5; i++) part(yaw, blk(.5, 6, 7), lightMetal, -4 + i * 2, 7, 9);
    if (spec === 'field') { part(yaw, tor(13, .8), t, 0, 3, 0, along); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; part(yaw, sph(1.4), glowOf('#9fdcff'), Math.cos(a) * 13, 3, Math.sin(a) * 13); } }
    part(rec, cyl(1.6, 1.6, 10, 12), steel, 0, 0, -5, along);
    for (const z of [-3, -6, -9]) part(rec, tor(2.4, .45), t, 0, 0, z);
    part(rec, cyl(1.5, 3.4, 4, 18), lightMetal, 0, 0, -11.5, -along);
    const m = new THREE.Object3D(); m.position.set(0, 0, -13.8); rec.add(m); muzzles.push(m);
    rec.position.set(0, 7, -6);
    return .6;
  }

  function pulse(yaw, rec, muzzles, level, spec, t) {
    part(yaw, cyl(10, 11, 4, 24), paint, 0, 2, 0); part(yaw, cyl(10.1, 11.1, 1, 24, true), t, 0, 1.2, 0);
    for (const s of [-1, 1]) part(yaw, blk(2, 9, 10), steel, s * 5.6, 7, 0);
    if (level >= 2) part(yaw, blk(13, 1.6, 13), steel, 0, 4.6, 0);
    const pitch = new THREE.Group(); pitch.position.set(0, 9, 1); pitch.rotation.x = .95; yaw.add(pitch); pitch.add(rec);
    const r = spec === 'heavy' ? 1.3 : 1;
    part(rec, cyl(3.6 * r, 4.2 * r, 20, 22), olive, 0, 0, -6, along);
    for (const z of [-1, -9]) part(rec, cyl(4.7 * r, 4.7 * r, 1.4, 22), t, 0, 0, z, along);
    part(rec, cyl(4.3 * r, 4.3 * r, 1.8, 22), steel, 0, 0, -15.6, along);
    if (spec === 'shock') for (const z of [-4, -7, -10]) { part(rec, tor(4.8, .55), copper, 0, 0, z); }
    const m = new THREE.Object3D(); m.position.set(0, 0, -17); rec.add(m); muzzles.push(m);
    for (let i = 0; i < 4; i++) part(yaw, cap(1.4, 3.5), olive, -4.5 + i * 3, 5, 9, along);
    part(yaw, blk(13, 1, 4), dark, 0, 3.6, 9);
    return 3;
  }

  function laser(yaw, rec, muzzles, level, spec, t) {
    part(yaw, cap(5.2, 9), paint, 0, 7, 2, along); part(yaw, cyl(5.35, 5.35, 1.2, 18, true), t, 0, 7, 2, along);
    for (const s of [-1, 1]) { part(yaw, cap(1.5, 5), glowOf(types.laser.color), s * 6.6, 6, 4); part(yaw, cyl(.4, .4, 7, 6), rubber, s * 4, 9.5, 4, 0, 0, s * .9); }
    if (level >= 2) { part(yaw, blk(9, 6, 4.5), dark, 0, 7, 9.5); for (let i = 0; i < 5; i++) part(yaw, blk(9.4, .5, 4.8), lightMetal, 0, 4.6 + i * 1.2, 9.5); }
    if (level >= 3) part(yaw, tor(6.4, .7), t, 0, 7, -3);
    part(rec, cyl(2.6, 2.6, 16, 16), steel, 0, 0, -8, along);
    const fins = spec === 'focus' ? 8 : 5;
    for (let i = 0; i < fins; i++) part(rec, cyl(4.4, 4.4, .55, 20), dark, 0, 0, -3 - i * (10 / fins), along);
    const lensR = spec === 'focus' ? 3.6 : 2.9;
    part(rec, cyl(lensR + .5, lensR + .5, 1.6, 20), steel, 0, 0, -15.8, along);
    part(rec, cyl(lensR, lensR, 1.7, 20), glowOf('#ff8a7f'), 0, 0, -16, along);
    const m = new THREE.Object3D(); m.position.set(0, 0, -17.2); rec.add(m); muzzles.push(m);
    if (spec === 'prism') { part(rec, cyl(.4, .4, 6, 6), steel, 0, 4, -12); const c = part(rec, oct(3), glowOf('#ffc2f0'), 0, 8.5, -12); c.userData.spin = true; }
    rec.position.set(0, 7, -4);
    return 0;
  }

  function radar(yaw, rec, muzzles, level, spec, t) {
    part(yaw, cyl(1.6, 2, 14, 10), steel, 0, 7, 0);
    part(yaw, blk(6, 4, 4), paint, 0, 13, 4); part(yaw, blk(6.2, 1, 4.2), t, 0, 11.4, 4);
    const dish = part(yaw, dishGeo(13, .62), dishMaterial, 0, 18, -9, 1.27);
    part(yaw, cyl(.45, .45, 11, 6), steel, 0, 17, -9.5, 1.2);
    const horn = part(yaw, sph(1.2), glowOf(types.radar.color), 0, 20.5, -14.5); horn.castShadow = false;
    if (spec === 'scan') { const back = part(yaw, dishGeo(7, .6), dish.material, 0, 16, 7, -1.3); back.castShadow = true; }
    if (spec === 'boost') for (const s of [-1, 1]) { part(yaw, blk(3, 5, 3), t, s * 5.5, 13, 4); part(yaw, cyl(.3, .3, 8, 6), steel, s * 5.5, 19, 4); }
    if (level >= 2) for (let i = 0; i < 3; i++) part(yaw, blk(.6, 6 + i, .6), lightMetal, -2 + i * 2, 18 + i / 2, 6);
    if (level >= 3) { part(yaw, cyl(.6, .6, 12, 6), steel, 0, 24, 4); const b = part(yaw, sph(1.1), glowOf('#ff4b3a'), 0, 30.5, 4); b.userData.blink = true; }
    const m = new THREE.Object3D(); m.position.set(0, 20.5, -14.5); yaw.add(m); muzzles.push(m);
    return 0;
  }

  const builders = { rapid, slow, pulse, laser, radar };

  function build(type, level = 1, spec = null) {
    const root = new THREE.Group(), yaw = new THREE.Group(), rec = new THREE.Group();
    base(root, type, level); yaw.position.y = 21; root.add(yaw); yaw.add(rec);
    const muzzles = [], kick = builders[type](yaw, rec, muzzles, level, spec, trim(type));
    rec.userData.z0 = rec.position.z;
    root.userData = { ...root.userData, type, key: `${type}|${level}|${spec}`, yaw, rec, muzzles, kick, aim: 0, recoil: 0, barrel: 0, blinkers: [], spinners: [] };
    root.traverse(o => { if (o.userData.blink) root.userData.blinkers.push(o); if (o.userData.spin) root.userData.spinners.push(o); });
    return root;
  }

  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  // Returns true while the model is still moving (turning, recoiling, spinning).
  function animate(model, target, dt, time, reduced) {
    const u = model.userData;
    u.led.material = target ? ledBusy : ledIdle;
    u.blinkers.forEach(b => { b.visible = reduced || Math.sin(time * 4) > -.2; });
    u.spinners.forEach(s => { if (!reduced) s.rotation.y += dt * 1.5; });
    if (u.type === 'radar') { if (!reduced) u.yaw.rotation.y += dt * 1.1; return !reduced; }
    let moving = false;
    if (target) {
      const desired = Math.atan2(model.position.x - target.x, model.position.z - target.y), delta = wrap(desired - u.aim);
      const turn = reduced ? Math.abs(delta) : dt * 5;
      u.aim = wrap(u.aim + Math.max(-turn, Math.min(turn, delta))); moving = Math.abs(delta) > .01;
      u.yaw.rotation.y = u.aim;
    }
    if (u.recoil > 0) { u.recoil = Math.max(0, u.recoil - dt * 7); moving = true; }
    const k = u.recoil * u.recoil; u.rec.position.z = u.rec.userData.z0 + k * u.kick;
    return moving;
  }
  function fire(model, reduced) { const u = model.userData; u.barrel = (u.barrel + 1) % Math.max(1, u.muzzles.length); if (!reduced && u.kick) u.recoil = 1; }
  function muzzle(model, out) { const u = model.userData; return u.muzzles[u.barrel % u.muzzles.length].getWorldPosition(out); }
  // Only materials created for this model are disposed; shared geometry stays cached.
  function release(model) { model.removeFromParent(); model.userData.ownedMaterials?.forEach(m => m.dispose()); }
  function ghost(model) {
    const materials = []; model.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = .4; o.material.depthWrite = false; o.castShadow = false; materials.push(o.material); } });
    model.userData.ownedMaterials = materials; return model;
  }
  function dispose() { owned.forEach(x => x.dispose()); }
  return { build, animate, fire, muzzle, release, ghost, dispose };
}
