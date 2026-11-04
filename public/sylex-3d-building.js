import * as THREE from './vendor/three/three.module.js';

// The Sylex headquarters, modelled from photographs of the real building:
// a three-storey block clad in horizontal silver trapezoidal sheet, ribbon windows
// with white frames and grey external blinds on the left, a full-height blue
// curtain wall with steel sun ledges and a sloping top in the middle, small
// windows on the right, a two-storey white production hall with an olive band on
// the left, and the red company logo standing on the roof's front-left corner.
// Front façade faces +Z at z = 133; footprint x 575–925 (hall 460–575).

function stripes(w, h, draw) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

export function createSylexBuilding(scene, { cladding, concrete, logoUrl }) {
  const owned = []; const own = x => (owned.push(x), x);
  const group = new THREE.Group(); scene.add(group);
  const boxGeo = own(new THREE.BoxGeometry(1, 1, 1));
  const box = (x, y, z, w, h, d, m, parent = group) => { const b = new THREE.Mesh(boxGeo, m); b.scale.set(w, h, d); b.position.set(x, y, z); b.castShadow = b.receiveShadow = true; parent.add(b); return b; };
  const mat = o => own(new THREE.MeshStandardMaterial(o));
  const white = mat({ color: '#f3f4ef', roughness: .45, metalness: .1 });
  const silver = mat({ color: '#c9cdcd', roughness: .35, metalness: .6 });
  const steel = mat({ color: '#7f8a8e', roughness: .3, metalness: .8 });
  const dark = mat({ color: '#28323a', roughness: .6 });
  const glass = own(new THREE.MeshPhysicalMaterial({ color: '#6f9fc4', roughness: .06, metalness: .35, clearcoat: 1, clearcoatRoughness: .05, envMapIntensity: 1.6 }));
  const windowGlass = own(new THREE.MeshPhysicalMaterial({ color: '#5f7f96', roughness: .08, metalness: .3, clearcoat: 1, envMapIntensity: 1.3 }));
  glass.userData.keepPBR = windowGlass.userData.keepPBR = true; // glass stays reflective in the toon pass
  const blindsMap = own(stripes(16, 64, (c, w, h) => { c.fillStyle = '#9aa1a3'; c.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 4) { c.fillStyle = '#c4c9ca'; c.fillRect(0, y, w, 2); } }));
  const blinds = mat({ map: blindsMap, roughness: .5, metalness: .4 });
  const hallWhite = mat({ color: '#eef0ea', roughness: .6 });
  const olive = mat({ color: '#cfc94e', roughness: .55 });
  const red = mat({ color: '#e3312d', roughness: .45 });

  const H = 128, F = H / 3, FRONT = 133;
  // ---- Main block with silver cladding and a light parapet cap ----
  box(750, H / 2, 64, 350, H, 138, cladding);
  box(750, H + 1.2, 64, 354, 2.4, 142, silver);
  box(750, H - 2, FRONT + .8, 352, 3, 1.2, silver);
  for (let i = 1; i < 3; i++) box(655, i * F, FRONT + .5, 160, 1, .8, silver); // floor lines on the clad part

  // ---- Left wing: ribbon windows, white frames, some panes behind grey blinds ----
  const blindPattern = [[3, 4], [2, 3, 8], [1, 2, 6, 7]]; // per floor, panes with lowered blinds (from the photos)
  for (let floor = 0; floor < 3; floor++) {
    const y = floor * F + F * .55, x0 = 584, w = 142, h = 15, panes = 10, pw = w / panes;
    box(x0 + w / 2, y, FRONT + .6, w + 3, h + 3, 1.2, white);
    box(x0 + w / 2, y, FRONT + 1, w, h, .6, windowGlass);
    for (let p = 0; p <= panes; p++) box(x0 + p * pw, y, FRONT + 1.5, 1.1, h, 1, white);
    box(x0 + w / 2, y + h * .18, FRONT + 1.5, w, .9, 1, white);
    for (const p of blindPattern[floor]) { const b = box(x0 + (p + .5) * pw, y, FRONT + 1.6, pw - 1.2, h - 1, .4, blinds); b.castShadow = false; }
    box(x0 + w / 2, y - h / 2 - 2, FRONT + 2.2, w + 4, 1, 3, white); // sill
  }

  // ---- Curtain wall: protruding glass, mullion grid, sloping top, steel sun ledges ----
  const gx0 = 738, gx1 = 862, gw = gx1 - gx0, gz = FRONT + 3;
  const shape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(gw, 0), new THREE.Vector2(gw, H + 1), new THREE.Vector2(0, H + 9)]);
  const glassGeo = own(new THREE.ExtrudeGeometry(shape, { depth: 6, bevelEnabled: false }));
  const curtain = new THREE.Mesh(glassGeo, glass); curtain.position.set(gx0, 0, gz - 6); curtain.castShadow = curtain.receiveShadow = true; group.add(curtain);
  for (let x = gx0; x <= gx1 + .1; x += gw / 10) { const top = H + 9 - (x - gx0) / gw * 8; box(x, top / 2, gz + .4, 1, top, 1.2, silver); }
  for (let y = 14; y < H; y += 14.2) box((gx0 + gx1) / 2, y, gz + .4, gw, .9, 1.2, silver);
  const capLen = Math.hypot(gw, 8), cap = box((gx0 + gx1) / 2, H + 5, gz - 3, capLen, 1.6, 7, silver); cap.rotation.z = -Math.atan2(8, gw);
  for (const y of [F, 2 * F]) {
    box((gx0 + gx1) / 2 + 6, y, gz + 6, gw + 24, 1.4, 12, steel);
    for (let x = gx0 - 4; x <= gx1 + 16; x += 7) box(x, y + 4, gz + 11.5, .4, 8, .4, steel);
    box((gx0 + gx1) / 2 + 6, y + 8, gz + 11.5, gw + 24, .7, .7, steel);
  }
  // Entrance: double glass doors, a small logo plate, steps, planters and a bench.
  box(800, 14, gz + .9, 34, 26, 1.4, dark);
  for (const x of [786, 800, 814]) box(x, 14, gz + 1.7, 1.2, 26, 1, silver);
  box(800, 26.5, gz + 1.7, 34, 1.2, 1, silver);
  for (let i = 0; i < 3; i++) box(800, 1 + i * 2, gz + 8 + (2 - i) * 4.5, 58 - i * 6, 2, 9 + (2 - i) * 0, concrete);
  for (const x of [770, 830]) { box(x, 3.5, gz + 18, 7, 7, 7, concrete); const bush = new THREE.Mesh(own(new THREE.IcosahedronGeometry(5.5, 1)), mat({ color: '#4e8a3a', roughness: .9 })); bush.position.set(x, 10, gz + 18); bush.castShadow = true; group.add(bush); }
  box(846, 4, gz + 20, 16, 1.6, 5, mat({ color: '#8a3a2c', roughness: .6 })); for (const x of [840, 852]) box(x, 2, gz + 20, 1, 4, 4, dark);

  // ---- Right wing: small two-pane windows ----
  for (let floor = 0; floor < 3; floor++) {
    const y = floor * F + F * .6, x0 = 872, w = floor === 2 ? 30 : 38;
    box(x0 + w / 2, y, FRONT + .6, w + 3, 13, 1.2, white); box(x0 + w / 2, y, FRONT + 1, w, 10, .6, windowGlass); box(x0 + w / 2, y, FRONT + 1.5, 1, 10, 1, white);
  }
  // Side windows on the east face.
  for (let floor = 0; floor < 3; floor++) for (const z of [30, 90]) { const y = floor * F + F * .58; box(925.6, y, z, 1.2, 13, 34, white); box(926.2, y, z, .6, 10, 31, windowGlass); }

  // ---- Production hall: white, olive band, ribbon windows, pilasters ----
  const hallH = 66;
  box(517, hallH / 2, 64, 116, hallH, 132, hallWhite);
  box(517, hallH - 6, 64, 117, 12, 133, olive);
  box(517, hallH + 1, 64, 119, 2, 135, silver);
  for (const y of [14, 42]) { box(517, y, 130.6, 104, 12, 1, windowGlass); for (let x = 467; x <= 567; x += 10.4) box(x, y, 131, .9, 12, 1, white); box(517, y - 7, 131.5, 106, 1, 2, white); }
  for (let x = 461; x <= 573; x += 28) box(x, hallH / 2, 131.2, 2.2, hallH, 1.4, hallWhite);

  // ---- Roof equipment ----
  for (const [x, z, w, d] of [[660, 40, 24, 18], [710, 70, 16, 16], [890, 40, 22, 20]]) { box(x, H + 2.4 + 5, z, w, 10, d, silver); for (let i = 0; i < 4; i++) box(x, H + 7.9 + 5, z - d / 2 + 3 + i * (d - 6) / 3, w - 3, .4, 1, dark); }
  box(905, H + 14, 110, 2, 24, 2, steel);

  // ---- Logo on the roof (front-left) and above the entrance ----
  const logoTexture = own(new THREE.TextureLoader().load(logoUrl, t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.needsUpdate = true; }));
  const logoMat = own(new THREE.MeshBasicMaterial({ map: logoTexture, transparent: true, alphaTest: .35, side: THREE.DoubleSide, toneMapped: false }));
  const roofLogo = new THREE.Mesh(own(new THREE.PlaneGeometry(76, 66.5)), logoMat); roofLogo.position.set(615, H + 40, FRONT - 14); roofLogo.castShadow = true; roofLogo.userData.noOutline = true; group.add(roofLogo);
  for (const x of [596, 634]) box(x, H + 8, FRONT - 15, 1.6, 14, 1.6, red);
  box(615, H + 3, FRONT - 15, 48, 1.4, 4, steel);
  const plate = new THREE.Mesh(own(new THREE.PlaneGeometry(12, 10.5)), logoMat); plate.position.set(726, 20, FRONT + 1.4); plate.userData.noOutline = true; group.add(plate);
  box(726, 20, FRONT + 1, 14, 12, .6, white);

  return { group, dispose() { owned.forEach(x => x.dispose()); } };
}
