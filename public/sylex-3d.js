import * as THREE from './vendor/three/three.module.js';

// A real WebGL scene. Game coordinates (x,y) map to world (x,0,z).
// No simulation state lives here; the original engine remains authoritative.
export async function createSylex3D({ onPick, onFailure }) {
  const { path, slots, types, position } = window.SylexTD;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.setSize(1280,720,false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  const canvas = renderer.domElement;
  canvas.setAttribute('role','img');canvas.setAttribute('aria-label','3D areál Sylex. Klikni na očíslovaný podstavec alebo použi tlačidlá miest pod mapou.');
  canvas.dataset.renderer = 'webgl';
  const scene = new THREE.Scene();scene.background = new THREE.Color('#b3c3c6');scene.fog=new THREE.Fog('#b3c3c6',1600,2800);
  const camera = new THREE.PerspectiveCamera(42,16/9,2,4000);
  const target = new THREE.Vector3(480,15,265);
  let yaw=.08, zoom=1.6;
  let cameraDirty=true;
  function cameraUpdate(){camera.position.set(480+Math.sin(yaw)*1030,750,260+Math.cos(yaw)*900);camera.lookAt(target);camera.zoom=zoom*Math.min(1,camera.aspect/(16/9));camera.updateProjectionMatrix();cameraDirty=true;}
  cameraUpdate();
  scene.add(new THREE.HemisphereLight('#d5e6f5','#6d7750',1.5));
  const sun = new THREE.DirectionalLight('#fff1cf',2.6);sun.position.set(120,680,680);sun.target.position.set(480,0,270);scene.add(sun,sun.target);
  sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-650,right:650,top:540,bottom:-540,near:20,far:1500});sun.shadow.bias=-.00025;sun.shadow.normalBias=.8;sun.shadow.radius=3;
  // Locally generated sky environment for reflections; materials below use CC0 photographs.
  const sky=document.createElement('canvas');sky.width=1024;sky.height=512;
  const sc=sky.getContext('2d'),skyGradient=sc.createLinearGradient(0,0,0,512);
  for(const [p,c] of [[0,'#577d9e'],[.35,'#b5d1df'],[.5,'#ecede2'],[.53,'#89977b'],[1,'#465747']])skyGradient.addColorStop(p,c);
  sc.fillStyle=skyGradient;sc.fillRect(0,0,1024,512);
  for(let i=0;i<18;i++){sc.fillStyle='#ffffff30';sc.beginPath();sc.ellipse((i*197)%1024,90+(i*29)%110,60+(i%3)*35,9,0,0,7);sc.fill();}
  const envTexture=new THREE.CanvasTexture(sky);envTexture.colorSpace=THREE.SRGBColorSpace;envTexture.mapping=THREE.EquirectangularReflectionMapping;
  const pmrem=new THREE.PMREMGenerator(renderer),env=pmrem.fromEquirectangular(envTexture);scene.environment=env.texture;envTexture.dispose();pmrem.dispose();
  const loader=new THREE.TextureLoader();const textures=[];
  async function pbr(id,repeat,options={}){
    const maps=await Promise.all(['color','normal','rough'].map(k=>loader.loadAsync('/assets/sylex/'+id+'-'+k+'.jpg')));
    maps.forEach((t,i)=>{t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(...repeat);t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());if(i===0)t.colorSpace=THREE.SRGBColorSpace;textures.push(t);});
    return new THREE.MeshStandardMaterial({map:maps[0],normalMap:maps[1],roughnessMap:maps[2],normalScale:new THREE.Vector2(.3,.3),roughness:1,...options});
  }
  let grass,asphalt,bark,cladding,concrete;
  try{[grass,asphalt,bark,cladding,concrete]=await Promise.all([
    pbr('grass_ground',[26,20],{color:'#8ebc83'}),pbr('aerial_asphalt_01',[5,5],{color:'#666f70'}),pbr('bark_brown_02',[1,3]),pbr('corrugated_iron_03',[8,3],{color:'#ffffff',metalness:.18,roughness:.65,emissive:'#9ba5a5',emissiveIntensity:.12}),pbr('concrete_pavement',[4,4])]);}
  catch(error){renderer.dispose();textures.forEach(t=>t.dispose());env.dispose();throw error;}
  for(const t of [cladding.map,cladding.normalMap,cladding.roughnessMap]){t.center.set(.5,.5);t.rotation=Math.PI/2;t.repeat.set(2,1);}
  const standard=(color,roughness=.7,metalness=0)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
  const steel=standard('#687d83',.3,.75),lightMetal=standard('#cad3d0',.25,.65),rubber=standard('#20272c',.93),white=standard('#ebe6ca'),dark=standard('#23353f');
  const glass=new THREE.MeshPhysicalMaterial({color:'#6e96aa',metalness:.35,roughness:.12,clearcoat:1,envMapIntensity:1.8});
  const geoBox=new THREE.BoxGeometry(1,1,1);
  function mesh(g,material,parent=scene){const m=new THREE.Mesh(g,material);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
  function box(parent,x,y,z,w,h,d,material){const m=mesh(geoBox,material,parent);m.scale.set(w,h,d);m.position.set(x,y,z);return m;}
  function cylinder(parent,x,y,z,r1,r2,h,material,n=16){const m=mesh(new THREE.CylinderGeometry(r1,r2,h,n),material,parent);m.position.set(x,y,z);return m;}
  function rod(parent,a,b,r,material){const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),delta=end.clone().sub(start);const m=cylinder(parent,0,0,0,r,r,delta.length(),material,8);m.position.copy(start.add(end).multiplyScalar(.5));m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());return m;}
  function plane(w,h,material,x,y,z){const m=mesh(new THREE.PlaneGeometry(w,h),material);m.rotation.x=-Math.PI/2;m.position.set(x,y,z);m.castShadow=false;return m;}
  plane(2400,1800,grass,480,-.3,270);
  
  // Road is raised slightly above terrain; segments follow the unchanged simulation path.
  for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i],len=Math.hypot(b[0]-a[0],b[1]-a[1]),angle=Math.atan2(b[0]-a[0],b[1]-a[1]);
    const curb=box(scene,(a[0]+b[0])/2,.1,(a[1]+b[1])/2,44,2,len+42,concrete);curb.rotation.y=angle;
    const road=box(scene,(a[0]+b[0])/2,1,(a[1]+b[1])/2,36,1,len+34,asphalt);road.rotation.y=angle;
    for(let d=12;d<len-8;d+=24){const f=d/len;const dash=box(scene,a[0]+(b[0]-a[0])*f,1.55,a[1]+(b[1]-a[1])*f,1.2,.1,7,white);dash.rotation.y=angle;dash.castShadow=false;}
  }
  // Concrete forecourt and parking.
  box(scene,177,0,470,306,2,102,concrete);box(scene,177,1,470,298,1,94,asphalt);
  for(let x=35;x<325;x+=47){const stripe=box(scene,x,1.6,470,1,.1,77,white);stripe.castShadow=false;box(scene,x+22,3,506,24,3,3,concrete);}
  function label(text,color='#edf1df',background=null,w=256,h=128){const cv=document.createElement('canvas');cv.width=w;cv.height=h;const c=cv.getContext('2d');if(background){c.fillStyle=background;c.fillRect(0,0,w,h);}c.fillStyle=color;c.textAlign='center';c.textBaseline='middle';c.font='bold '+Math.round(h*.66)+'px Segoe UI';c.fillText(text,w/2,h/2);const tex=new THREE.CanvasTexture(cv);tex.colorSpace=THREE.SRGBColorSpace;textures.push(tex);return new THREE.MeshBasicMaterial({map:tex,transparent:true,side:THREE.DoubleSide,depthWrite:false});}
  // Headquarters: three floors, horizontal aluminium cladding and central curtain wall.
  const building=new THREE.Group();building.scale.y=1.45;scene.add(building);
  box(building,750,44,64,350,88,138,cladding);box(building,750,89,64,356,3,144,lightMetal);
  const roof=asphalt.clone();roof.color.set('#a3aaab');box(building,750,91,64,345,1,133,roof);

  // Horizontal ribs sit over the photographic corrugated metal.

  for(const y of [16,44,72]){
    box(building,657,y,135,137,20,2,lightMetal);
    for(let x=597;x<722;x+=23){box(building,x+10,y,136.4,20,16,1,glass);box(building,x+21,y,137,1.2,18,1,lightMetal);}
    box(building,891,y,135,48,12,2,lightMetal);box(building,891,y,136.5,44,8,1,glass);
  }
  box(building,795,45,137,126,87,3,glass);
  for(let x=732;x<=858;x+=15)box(building,x,45,139.2,1.2,89,1.5,lightMetal);
  for(let y=3;y<=87;y+=14)box(building,795,y,139.2,127,1.2,1.5,lightMetal);
  for(const y of [29,57]){box(building,795,y,142,133,1.5,13,steel);for(let x=735;x<858;x+=14)rod(building,[x,y,149],[x,y+8,149],.5,lightMetal);rod(building,[728,y+8,149],[862,y+8,149],.6,lightMetal);}
  box(building,805,11,140,25,22,2,glass);box(building,805,11,142,1,22,1,lightMetal);
  for(let i=0;i<3;i++)box(building,805,1+i,151-i*3,48-i*5,2,8,concrete);
  // Left production hall and roof ventilation equipment.
  box(building,518,23,66,113,46,130,standard('#c9cebd'));box(building,518,47,66,119,2,135,lightMetal);box(building,518,42,132,113,8,1,standard('#adb880'));
  for(let x=472;x<570;x+=22){box(building,x,25,132,17,21,1,glass);box(building,x,25,133,1,22,1,lightMetal);}
  for(const x of [651,702,885]){box(building,x,95,45,23,8,20,steel);for(let z=39;z<54;z+=3)box(building,x,99.1,z,20,.2,.6,dark);}
  const sign=new THREE.Group();building.add(sign);sign.position.set(620,102,131);
  const logo=mesh(new THREE.PlaneGeometry(59,21),label('sylex','#af283a'),sign);logo.position.set(0,3,0);
  rod(sign,[-24,-6,-1],[0,25,-1],.8,standard('#a42b3a'));rod(sign,[0,25,-1],[24,-6,-1],.8,standard('#a42b3a'));rod(sign,[24,-6,-1],[-24,-6,-1],.8,standard('#a42b3a'));
  rod(sign,[-20,-12,-1],[-20,0,-1],.7,steel);rod(sign,[20,-12,-1],[20,0,-1],.7,steel);
  function sideShape(points,depth,material,parent){const shape=new THREE.Shape();points.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();const g=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:1.1,bevelThickness:1.1});const m=mesh(g,material,parent);m.rotation.y=Math.PI/2;m.position.x=-depth/2;return m;}
  function car(x,z,color,variant){
    const g=new THREE.Group();g.position.set(x,1,z);scene.add(g);
    const paint=new THREE.MeshPhysicalMaterial({color,metalness:.55,roughness:.24,clearcoat:1,clearcoatRoughness:.12,envMapIntensity:1.6});
    sideShape([[-25,6],[-25,11],[-18,14],[18,14],[25,11],[25,6]],22,paint,g);
    sideShape([[-13,14],[-7,24],[10,24],[18,14]],19,glass,g);
    box(g,0,24.7,-1,19,1.5,16,paint);
    for(const x of [-10,10]){box(g,x,19,-2,1,11,1.7,paint);box(g,x,17,-13,1.2,6,1.5,paint);box(g,x,12,6,1,1,4,lightMetal);}
    for(const x of [-12.4,12.4])for(const z of [-16,16]){
      const wheel=cylinder(g,x,6,z,6,6,3.7,rubber,20);wheel.rotation.z=Math.PI/2;
      const rim=cylinder(g,x+(x<0?-2:2),6,z,3.6,3.6,.7,lightMetal,16);rim.rotation.z=Math.PI/2;
      for(let j=0;j<5;j++){const a=j*Math.PI/2.5;rod(g,[x+(x<0?-2.5:2.5),6,z],[x+(x<0?-2.5:2.5),6+Math.sin(a)*3.4,z+Math.cos(a)*3.4],.4,steel);}
    }
    for(const x of [-8,8]){box(g,x,11,-25.4,5,2,1,white);box(g,x,11,25.4,5,2,1,standard('#9d3930'));box(g,x*1.55,16,-7,4,2.5,3,paint);}
    box(g,0,9,-26,8,2,.5,dark);box(g,0,8,26,7,2,.5,white);box(g,0,6,26,19,2,1,steel);
    g.rotation.y=variant%2?.04:-.04;
  }
  ['#d6d9d7','#365975','#323b42','#a9b1b0','#773d3a','#d4d2c4'].forEach((color,i)=>car(58+i*47,469,color,i));
  // Leaves are individual textured surfaces, not opaque spheres.
  const leafCanvas=document.createElement('canvas');leafCanvas.width=128;leafCanvas.height=64;
  const lc=leafCanvas.getContext('2d');const lg=lc.createLinearGradient(0,0,0,64);lg.addColorStop(0,'#739544');lg.addColorStop(.5,'#c0cd70');lg.addColorStop(1,'#3d672c');
  lc.fillStyle=lg;lc.beginPath();lc.moveTo(3,32);lc.bezierCurveTo(45,-5,91,0,125,32);lc.bezierCurveTo(85,62,40,70,3,32);lc.fill();lc.strokeStyle='#d1d995';lc.lineWidth=1;lc.beginPath();lc.moveTo(3,32);lc.lineTo(124,32);for(let x=20;x<110;x+=13){lc.moveTo(x,32);lc.lineTo(x+12,13);lc.moveTo(x,32);lc.lineTo(x+12,51);}lc.stroke();
  const leafMap=new THREE.CanvasTexture(leafCanvas);leafMap.colorSpace=THREE.SRGBColorSpace;textures.push(leafMap);
  const leafMaterial=new THREE.MeshStandardMaterial({map:leafMap,alphaTest:.45,side:THREE.DoubleSide,roughness:.9,color:'#a1b875'});
  const treeLocations=[[45,110,1.1],[112,145,.9],[232,82,1],[407,74,1.15],[497,170,.75],[895,400,1.4],[844,491,1.15],[692,487,1.1],[350,514,.8],[82,203,.7],[-50,20,1.4],[60,-45,1.3],[270,-40,1.5],[430,-100,1.5],[1050,100,1.4],[1030,280,1.5],[1000,510,1.5],[-50,490,1.4],[100,620,1.2],[450,650,1.4],[820,660,1.3]];
  const leaves=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),leafMaterial,treeLocations.length*1200);leaves.castShadow=true;leaves.receiveShadow=true;scene.add(leaves);
  let seed=923;const rand=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};const dummy=new THREE.Object3D();let leafIndex=0;
  for(const [x,z,s] of treeLocations){
    cylinder(scene,x,21*s,z,1.8*s,3.5*s,42*s,bark,9);
    const tips=[];
    for(let j=0;j<9;j++){const a=j*2.4,rr=(12+rand()*13)*s,tip=[x+Math.cos(a)*rr,(35+rand()*24)*s,z+Math.sin(a)*rr];tips.push(tip);rod(scene,[x,20*s,z],tip,1.1*s,bark);}
    for(let j=0;j<1200;j++){
      const tip=tips[j%tips.length],a=rand()*Math.PI*2,r=Math.cbrt(rand())*14*s,v=rand()*2-1;
      dummy.position.set(tip[0]+Math.cos(a)*r*Math.sqrt(1-v*v),tip[1]+v*r*.8,tip[2]+Math.sin(a)*r*Math.sqrt(1-v*v));dummy.rotation.set(rand()*3,rand()*6.28,rand()*3);dummy.scale.set((4+rand()*4)*s,(2+rand()*2)*s,1);dummy.updateMatrix();leaves.setMatrixAt(leafIndex,dummy.matrix);leaves.setColorAt(leafIndex++,new THREE.Color().setHSL(.23+rand()*.07,.32+rand()*.2,.48+rand()*.25));
    }
  }
  // Fence and street furniture have real projected shadows.
  for(let x=20;x<945;x+=25)cylinder(scene,x,9,14,.7,.7,18,steel,6);
  rod(scene,[20,5,14],[945,5,14],.35,steel);rod(scene,[20,15,14],[945,15,14],.4,steel);
  for(const [x,z] of [[70,399],[306,100],[618,442],[706,108]]){cylinder(scene,x,20,z,.8,1,40,steel,8);rod(scene,[x,39,z],[x+11,39,z],.7,steel);box(scene,x+10,38.5,z,9,2.5,4,lightMetal);}
  box(scene,20,9,311,6,18,6,lightMetal);for(let i=0;i<7;i++)box(scene,26+i*6,15,311,6,2,2,i%2?standard('#ad483a'):white);
  // Build pads and labels are part of the world, picked with a raycaster.
  const pads=[],padLabels=[];
  slots.forEach(([x,z],i)=>{
    const pad=cylinder(scene,x,2,z,23,24,4,concrete,32);pad.userData.slot=i;pads.push(pad);
    const numberMaterial=label(String(i+1),'#f4efd6','#203b36',128,128);
    const number=new THREE.Sprite(new THREE.SpriteMaterial({map:numberMaterial.map,sizeAttenuation:false,depthTest:false,depthWrite:false}));numberMaterial.dispose();number.position.set(x,8,z+19);number.renderOrder=10;scene.add(number);padLabels.push(number);
  });
  const ring=mesh(new THREE.RingGeometry(24,25.5,64),new THREE.MeshBasicMaterial({color:'#e8ca74',side:THREE.DoubleSide}),scene);ring.rotation.x=-Math.PI/2;ring.position.y=4.4;ring.castShadow=false;
  const range=mesh(new THREE.RingGeometry(.995,1,100),new THREE.MeshBasicMaterial({color:'#e3e7c5',transparent:true,opacity:.55,side:THREE.DoubleSide}),scene);range.rotation.x=-Math.PI/2;range.position.y=2;range.castShadow=false;
  const towerModels=new Map(),operatorModels=new Map();
  function towerModel(type){
    const root=new THREE.Group(),head=new THREE.Group();root.add(head);head.position.y=22;
    const trim=standard(types[type].color,.25,.4);
    cylinder(root,0,5,0,16,19,6,steel,24);cylinder(root,0,9,0,13,16,3,lightMetal,24);cylinder(root,0,16,0,7,9,13,steel,16);cylinder(root,0,22,0,11,10,3,lightMetal,20);
    for(let j=0;j<8;j++){const a=j*Math.PI/4;cylinder(root,Math.cos(a)*13,11,Math.sin(a)*13,1,1,1.4,lightMetal,6);}
    box(head,0,4,0,type==='pulse'?23:19,10,19,steel);box(head,0,8,0,18,2,16,lightMetal);
    if(type==='slow'){
      cylinder(head,0,15,0,5,7,19,lightMetal,16);for(let y=8;y<29;y+=5){cylinder(head,0,y,0,9,9,2,trim,24);cylinder(head,0,y+2,0,7,7,1,steel,24);}const orb=mesh(new THREE.SphereGeometry(4,16,10),trim,head);orb.position.y=30;
    }else{
      for(const x of type==='rapid'?[-4,4]:[0]){const barrel=cylinder(head,x,6,-19,type==='rapid'?1.4:4,type==='rapid'?2:5,26,lightMetal,16);barrel.rotation.x=Math.PI/2;const muzzle=cylinder(head,x,6,-33,type==='rapid'?2:5,type==='rapid'?2:5,3,steel,16);muzzle.rotation.x=Math.PI/2;const bore=cylinder(head,x,6,-34.6,type==='rapid'?1.2:3.5,type==='rapid'?1.2:3.5,.2,dark,16);bore.rotation.x=Math.PI/2;}
      box(head,0,4,10,17,2,1,trim);for(let x=-7;x<=7;x+=3)box(head,x,2,10.5,1,1,1,dark);
    }
    root.userData.head=head;root.userData.ownedMaterials=[trim];scene.add(root);return root;
  }
  const clothes=standard('#343c35'),vest=standard('#55513d'),skin=standard('#8b9d68'),rot=standard('#4c6041'),eyes=standard('#d7d885'),slowVest=standard('#62abc1');
  function person(){
    const g=new THREE.Group(),left=new THREE.Group(),right=new THREE.Group();g.add(left,right);left.position.set(-3.1,12,0);right.position.set(3.1,12,0);
    box(left,0,-5,0,4.5,10,4.5,clothes);box(right,0,-5,0,4.5,10,4.5,clothes);box(left,0,-10,-1,5,3,7,rubber);box(right,0,-10,-1,5,3,7,rubber);
    const torso=box(g,0,19,0,11,14,6,vest);torso.rotation.x=-.12;for(const x of [-4,-1,3])box(g,x,12,-3.2,1.6,4,1,clothes);box(g,2,20,-3.4,3,4,.6,skin);box(g,-3,24,-3.3,2,2,.5,rot);
    const arms=[];for(const x of [-7,7]){const arm=new THREE.Group();g.add(arm);arm.position.set(x,24,0);box(arm,0,-3,0,3.5,6,4,vest);box(arm,0,-8,0,2.8,5,3,skin);const hand=mesh(new THREE.SphereGeometry(1.8,8,6),skin,arm);hand.position.y=-11;for(const dx of [-1,0,1])box(arm,dx,-13,-.5,.55,3,.7,skin);arms.push(arm);}
    const face=mesh(new THREE.SphereGeometry(3.7,12,8),skin,g);face.scale.y=1.2;face.position.y=29;
    face.rotation.z=.18;box(g,-1.5,30,-3.3,2,1.5,.8,rot);box(g,1.5,30,-3.3,2,1.5,.8,rot);for(const x of [-1.5,1.5])box(g,x,30,-3.8,.7,.7,.4,eyes);box(g,.4,27,-3.4,3.2,1.5,.7,dark);box(g,-2,32,0,2,1.7,4,clothes);
    g.userData={left,right,arms,torso};scene.add(g);return g;
  }
  let preview=towerModel('rapid'),previewType='rapid';preview.traverse(o=>{if(o.isMesh){o.material=o.material.clone();o.material.transparent=true;o.material.opacity=.4;o.castShadow=false;}});
  const effectGeometry=new THREE.BufferGeometry();const effectPositions=new Float32Array(9*6);effectGeometry.setAttribute('position',new THREE.BufferAttribute(effectPositions,3));effectGeometry.setDrawRange(0,0);
  const beams=new THREE.LineSegments(effectGeometry,new THREE.LineBasicMaterial({color:'#ffe0a0',transparent:true,opacity:.8}));beams.frustumCulled=false;scene.add(beams);
  let lastGame=null,lastRenderKey="";
  function disposeObject(obj){obj.removeFromParent();obj.userData.ownedMaterials?.forEach(m=>m.dispose());obj.traverse(o=>{if(o.isMesh&&o.geometry!==geoBox)o.geometry.dispose();});}
  function render(game,selected,type,playing=true){
    const renderKey=[playing,selected,type,canvas.clientWidth,canvas.clientHeight,game.credits,game.health,...game.towers.flatMap(t=>[t.slot,t.type,t.level]),...game.enemies.flatMap(e=>[e.distance,e.hp,e.slow]),...game.effects.map(e=>e.life)].join('|');
    if(game===lastGame&&!cameraDirty&&renderKey===lastRenderKey)return;
    lastRenderKey=renderKey;cameraDirty=false;
    if(lastGame!==game){for(const o of towerModels.values())disposeObject(o);for(const o of operatorModels.values())disposeObject(o);towerModels.clear();operatorModels.clear();lastGame=game;}
    const placed=game.towers.find(t=>t.slot===selected);
    ring.position.set(slots[selected][0],4.4,slots[selected][1]);ring.visible=range.visible=playing;
    const radius=types[placed?.type||type].range+((placed?.level||1)-1)*15;range.position.set(slots[selected][0],2,slots[selected][1]);range.scale.set(radius,radius,1);
    if(previewType!==type){preview.traverse(o=>{if(o.isMesh)o.material.dispose();});disposeObject(preview);preview=towerModel(type);preview.traverse(o=>{if(o.isMesh){o.material=o.material.clone();o.material.transparent=true;o.material.opacity=.4;o.castShadow=false;}});previewType=type;}
    preview.position.set(slots[selected][0],4,slots[selected][1]);preview.visible=playing&&!placed;
    for(const t of game.towers){let model=towerModels.get(t.slot);if(!model){model=towerModel(t.type);model.position.set(slots[t.slot][0],4,slots[t.slot][1]);model.userData.slot=t.slot;towerModels.set(t.slot,model);}model.visible=true;model.scale.setScalar(1+(t.level-1)*.09);const target=game.enemies.filter(e=>Math.hypot(e.x-model.position.x,e.y-model.position.z)<=types[t.type].range+(t.level-1)*15).sort((a,b)=>b.distance-a.distance)[0];if(target)model.userData.head.rotation.y=Math.atan2(model.position.x-target.x,model.position.z-target.y);}
    const alive=new Set(game.enemies);
    for(const [e,model] of operatorModels)if(!alive.has(e)){disposeObject(model);operatorModels.delete(e);}
    for(const e of game.enemies){let model=operatorModels.get(e);if(!model){model=person();operatorModels.set(e,model);}model.visible=playing;model.position.set(e.x,2,e.y);const p=position(e.distance+1);model.rotation.y=Math.atan2(e.x-p.x,e.y-p.y);const stride=Math.sin(e.distance*.18)*.28;model.position.y+=Math.sin(e.distance*.36)*.45;model.rotation.z=Math.sin(e.distance*.18)*.045;model.userData.left.rotation.x=stride;model.userData.right.rotation.x=-stride;model.userData.arms[0].rotation.x=1.15+stride*.25;model.userData.arms[1].rotation.x=.95-stride*.3;model.userData.arms[0].rotation.z=-.15;model.userData.arms[1].rotation.z=.2;model.userData.torso.material=e.slow?slowVest:vest;}
    let count=0;for(const e of game.effects.slice(0,9)){effectPositions.set([e.x,32,e.y,e.tx,22,e.ty],count*6);count++;}effectGeometry.attributes.position.needsUpdate=true;effectGeometry.setDrawRange(0,playing?count*2:0);
    const width=Math.max(320,canvas.clientWidth||innerWidth),height=Math.max(240,canvas.clientHeight||innerHeight);
    if(canvas.width!==Math.round(width*renderer.getPixelRatio())||canvas.height!==Math.round(height*renderer.getPixelRatio()))renderer.setSize(width,height,false);
    camera.aspect=width/height;camera.zoom=zoom*Math.min(1,camera.aspect/(16/9));camera.setViewOffset(width,height,playing&&width>850?130:0,playing&&width<=850?height*.19:0,width,height);camera.updateProjectionMatrix();
    const labelSize=18*2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/(height*camera.zoom);
    padLabels.forEach((sprite,i)=>{sprite.visible=playing;sprite.scale.set(labelSize,labelSize,1);sprite.material.color.set(i===selected?'#ffdc83':'#ffffff');});
    renderer.render(scene,camera);
  }
  const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();let drag=null;
  canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;drag={x:e.clientX,y:e.clientY,yaw,zoom,moved:false};canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x;if(Math.abs(dx)>5||Math.abs(e.clientY-drag.y)>5)drag.moved=true;if(drag.moved){yaw=THREE.MathUtils.clamp(drag.yaw-dx*.002,-.6,.6);cameraUpdate();}});
  canvas.addEventListener('pointerup',e=>{if(!drag)return;const moved=drag.moved;drag=null;if(moved)return;const b=canvas.getBoundingClientRect();pointer.set((e.clientX-b.left)/b.width*2-1,-(e.clientY-b.top)/b.height*2+1);ray.setFromCamera(pointer,camera);const hits=ray.intersectObjects([...pads,...towerModels.values()],true);if(hits.length){let o=hits[0].object;while(o&&o.userData.slot===undefined)o=o.parent;if(o)onPick(o.userData.slot);}});
  canvas.addEventListener('pointercancel',()=>{drag=null;});
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();onFailure();});
  function cameraAction(action){if(action==='reset'){yaw=.08;zoom=1.2;}else if(action==='detail'){yaw=.08;zoom=1.6;}else zoom=THREE.MathUtils.clamp(zoom+(action==='in'?.16:-.16),.8,1.8);cameraUpdate();}
  function snapshot(ctx,game){cameraDirty=true;render(game,0,'rapid',false);ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(canvas,0,0,ctx.canvas.width,ctx.canvas.height);}
  return {canvas,render,cameraAction,snapshot,dispose(){const geometries=new Set(),materials=new Set();scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());env.dispose();renderer.dispose();},projectSlot(i){const p=new THREE.Vector3(slots[i][0],4,slots[i][1]).project(camera);return {x:(p.x+1)/2,y:(1-p.y)/2};}};
}
