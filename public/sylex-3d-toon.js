import * as THREE from './vendor/three/three.module.js';

// Cartoon look for the Sylex scene (design B2): three-tone toon shading and
// dark ink outlines of constant on-screen width. Outlines are back faces pushed
// out along the projected normal in clip space, so a scaled box gets the same
// line as a small bolt, and instanced zombies are outlined with one extra draw.

const OUTLINE_VERTEX = `
uniform float thickness;uniform vec2 resolution;
void main(){
  vec4 p=vec4(position,1.);vec3 n=normal;
  #ifdef USE_INSTANCING
  p=instanceMatrix*p;n=mat3(instanceMatrix)*n;
  #endif
  vec4 clip=projectionMatrix*modelViewMatrix*p;
  vec3 vn=mat3(modelViewMatrix)*n;
  vec2 dir=vn.xy;float len=length(dir);dir=len>1e-4?dir/len:vec2(0.);
  clip.xy+=dir*thickness*clip.w*2./resolution;
  gl_Position=clip;
}`;
const OUTLINE_FRAGMENT = `uniform vec3 color;uniform float opacity;void main(){gl_FragColor=vec4(color,opacity);}`;

export function createToonKit() {
  const owned = [];
  // Three hard light bands: shadow, mid, lit.
  const ramp = new THREE.DataTexture(new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
  ramp.minFilter = ramp.magFilter = THREE.NearestFilter; ramp.generateMipmaps = false; ramp.needsUpdate = true; owned.push(ramp);
  const uniforms = { resolution: { value: new THREE.Vector2(1280, 720) } };
  const outlineMaterial = (px = 2.2, color = '#3b2414', opacity = 1) => {
    const m = new THREE.ShaderMaterial({ uniforms: { thickness: { value: px }, resolution: uniforms.resolution, color: { value: new THREE.Color(color) }, opacity: { value: opacity } }, vertexShader: OUTLINE_VERTEX, fragmentShader: OUTLINE_FRAGMENT, side: THREE.BackSide, transparent: opacity < 1, depthWrite: opacity >= 1 });
    owned.push(m); return m;
  };
  const ink = outlineMaterial(2.4), fine = outlineMaterial(1.4);

  // Standard/Physical → Toon, keeping colour, maps, emission and transparency.
  // Materials flagged userData.keepPBR (glass, water) stay physically based.
  const converted = new Map();
  function toon(material) {
    if (!material || material.userData?.keepPBR || !(material.isMeshStandardMaterial)) return material;
    let t = converted.get(material);
    if (!t) {
      t = new THREE.MeshToonMaterial({ color: material.color, map: material.map, gradientMap: ramp, emissive: material.emissive, emissiveMap: material.emissiveMap, emissiveIntensity: material.emissiveIntensity, transparent: material.transparent, opacity: material.opacity, side: material.side, alphaTest: material.alphaTest, depthWrite: material.depthWrite, toneMapped: material.toneMapped, normalMap: material.normalMap, normalScale: material.normalScale });
      t.color.multiplyScalar(1.08); converted.set(material, t); owned.push(t);
    }
    return t;
  }
  // Converts materials in place under `root`; returns root for chaining.
  function stylize(root) {
    root.traverse(o => { if (o.isMesh && !o.userData.isOutline) o.material = Array.isArray(o.material) ? o.material.map(toon) : toon(o.material); });
    return root;
  }
  // Adds an outline copy beside each mesh under `root` (or the mesh itself).
  function outline(root, { px = 'ink', filter = () => true } = {}) {
    const material = px === 'fine' ? fine : ink, meshes = [];
    root.traverse(o => { if ((o.isMesh || o.isInstancedMesh) && !o.userData.isOutline && !o.userData.noOutline && filter(o)) meshes.push(o); });
    for (const m of meshes) {
      let line;
      if (m.isInstancedMesh) { line = new THREE.InstancedMesh(m.geometry, material, m.instanceMatrix.count); line.instanceMatrix = m.instanceMatrix; line.count = m.count; line.frustumCulled = false; }
      else { line = new THREE.Mesh(m.geometry, material); }
      line.userData.isOutline = true; line.castShadow = line.receiveShadow = false; line.raycast = () => {};
      if (m.isInstancedMesh) { m.parent.add(line); m.userData.outline = line; }
      else { line.matrixAutoUpdate = false; m.add(line); }
    }
    return root;
  }
  function setResolution(w, h) { uniforms.resolution.value.set(w, h); }
  function dispose() { owned.forEach(x => x.dispose()); }
  return { toon, stylize, outline, setResolution, ramp, dispose };
}
