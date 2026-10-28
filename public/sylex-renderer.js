/* Smooth, deterministic 2.5D rendering. The terrain is cached once; only actors
 * and combat effects are repainted during simulation. Logical map: 960 x 540. */
(function () {
  'use strict';
  const {path, slots, types, position} = window.SylexTD;
  const SCALE = 2;
  function random(seed) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
  function gradient(c, x, y, w, h, stops) {
    const g = c.createLinearGradient(x,y,x+w,y+h);
    stops.forEach((color,i) => g.addColorStop(i/(stops.length-1),color)); return g;
  }
  function ellipse(c,x,y,rx,ry,fill) { c.fillStyle=fill; c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fill(); }
  function box(c,x,y,w,h,r,fill,stroke) {
    c.beginPath();c.roundRect(x,y,w,h,r);c.fillStyle=fill;c.fill();
    if(stroke){c.strokeStyle=stroke;c.lineWidth=.7;c.stroke();}
  }
  function line(c, points, color, width=1) {
    c.beginPath();points.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.strokeStyle=color;c.lineWidth=width;c.stroke();
  }
  function polygon(c, points, fill) { c.beginPath();points.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.closePath();c.fillStyle=fill;c.fill(); }
  function shadow(c,x,y,rx,ry) {
    c.save();c.translate(x,y);c.scale(1,ry/rx);ellipse(c,0,0,rx,rx,(()=>{const f=c.createRadialGradient(0,0,0,0,0,rx);f.addColorStop(0,'#17231b80');f.addColorStop(1,'#17231b00');return f;})());c.restore();
  }
  function tree(c,x,y,size,seed) {
    const rand=random(seed);shadow(c,x+18,y+8,size*1.15,size*.42);
    line(c,[[x,y],[x-2,y-size*.7]],'#524c35',5);
    line(c,[[x-1,y-3],[x-4,y-size*.65]],'#a59665',1.5);
    for(let i=0;i<9;i++){
      const a=rand()*Math.PI*2,r=size*(.25+rand()*.5);
      line(c,[[x,y-8],[x+Math.cos(a)*r,y-size*.5+Math.sin(a)*r*.6]],'#565137',2);
    }
    // Layered leaf clusters have individually lit crowns and irregular edges.
    const clusters=Array.from({length:23},()=>({x:(rand()-.5)*size*1.55,y:(rand()-.5)*size, r:size*(.18+rand()*.16)})).sort((a,b)=>a.y-b.y);
    for(const p of clusters){
      const px=x+p.x,py=y-size*.75+p.y;
      const g=c.createRadialGradient(px-p.r*.4,py-p.r*.5,1,px,py,p.r);
      g.addColorStop(0,'#8ca256');g.addColorStop(.45,'#5d813f');g.addColorStop(1,'#2e5637');ellipse(c,px,py,p.r,p.r*.85,g);
      for(let j=0;j<16;j++){const a=rand()*6.28,r=Math.sqrt(rand())*p.r;ellipse(c,px+Math.cos(a)*r,py+Math.sin(a)*r*.8,1.1+rand(),.6+rand(),rand()>.5?'#abc06b65':'#173f2d45');}
    }
  }
  function car(c,x,y,color,angle=0){
    c.save();c.translate(x,y);c.rotate(angle);shadow(c,8,6,23,30);
    for(const tx of [-13,10])for(const ty of [-16,13])box(c,tx,ty,4,10,1.5,'#19242a');
    box(c,-12,-27,24,54,6,gradient(c,-12,0,24,0,['#263743',color,'#e1e4db',color,'#34464e']),'#263c45');
    box(c,-10,-24,20,12,4,gradient(c,0,-24,0,14,[color,'#d5dcd1',color]));
    polygon(c,[[-9,-12],[9,-12],[8,-3],[-8,-3]],gradient(c,0,-12,12,10,['#c3dae1','#254454']));
    box(c,-8,-3,16,18,3,gradient(c,-8,0,16,0,[color,'#d9e0d8',color]));
    polygon(c,[[-8,15],[8,15],[9,21],[-9,21]],'#294855');
    line(c,[[-6,-11],[5,-10]],'#e7f6f3a0');line(c,[[-10,-9],[-10,16]],'#eff6ed90');
    for(const tx of [-10,5]){box(c,tx,-25,5,3,1,'#f6edc9');box(c,tx,23,5,2,1,'#ad3f36');}
    box(c,-15,-7,4,3,1,color);box(c,11,-7,4,3,1,color);box(c,-5,25,10,2,0,'#c8d3cb');
    line(c,[[-8,3],[-8,12]],'#657c83',.5);line(c,[[8,3],[8,12]],'#657c83',.5);c.restore();
  }
  function building(c){
    // Roof, sidewall and façade use one light source from upper left.
    c.save();c.shadowColor='#12232750';c.shadowBlur=9;c.shadowOffsetX=13;c.shadowOffsetY=13;
    box(c,577,27,350,120,0,'#bdc5c4');c.restore();
    polygon(c,[[577,27],[595,7],[945,7],[927,27]],gradient(c,0,7,0,25,['#c7d1cd','#8d9d9e']));
    polygon(c,[[927,27],[945,7],[945,127],[927,147]],gradient(c,927,0,18,0,['#819493','#4f6366']));
    box(c,577,27,350,120,0,gradient(c,0,27,0,120,['#dfe2db','#9daead','#c7cfca']));
    for(let y=30;y<145;y+=3){line(c,[[579,y],[927,y]],'#687c7b55',.7);line(c,[[579,y+1],[927,y+1]],'#ffffff65',.6);}
    box(c,470,50,106,60,0,'#c6cbb6');polygon(c,[[470,50],[489,34],[594,34],[576,50]],'#e1e3d6');
    box(c,470,50,106,8,0,'#bac080');
    for(let x=478;x<574;x+=22)for(const y of [63,89])box(c,x,y,16,16,0,gradient(c,0,y,0,16,['#9fb9c4','#42606c']),'#e5e8da');
    for(const y of [43,79,115]){
      box(c,591,y-2,153,23,0,'#6c8080');box(c,591,y-2,153,2,0,'#f1f2e7');
      for(let x=594;x<741;x+=24){box(c,x,y,21,17,0,gradient(c,x,y,16,17,['#aac6d2','#7597a6','#3b5965']));line(c,[[x+2,y+2],[x+17,y+2]],'#dae9e4',.7);box(c,x+20,y,2,19,0,'#d5dbce');}
      box(c,866,y+4,45,11,0,'#d5ded5');box(c,868,y+5,41,8,0,gradient(c,0,y+5,0,8,['#afc7cd','#426575']));line(c,[[888,y+5],[888,y+13]],'#d8dfd7');
    }
    box(c,760,29,93,116,0,gradient(c,760,29,80,116,['#c4dce0','#618c9e','#2f5663']));
    // Reflected sky streaks and softly reflected tree line, clipped to atrium.
    c.save();c.beginPath();c.rect(760,29,93,116);c.clip();
    polygon(c,[[760,30],[797,30],[853,80],[853,95]],'#ffffff19');
    for(let i=0;i<12;i++)ellipse(c,765+i*8,116+(i%3)*4,9,17,'#284d3e42');
    for(let x=761;x<=853;x+=15.3){line(c,[[x,29],[x,144]],'#d2dcd4',1.4);line(c,[[x+2,29],[x+2,144]],'#34515b',.8);}
    for(let y=29;y<=145;y+=19)line(c,[[760,y],[853,y]],'#b9cbc4',1.4);c.restore();
    for(const y of [63,100]){polygon(c,[[756,y],[853,y],[859,y-4],[762,y-4]],'#9bb3a9');box(c,756,y,98,2,0,'#304e55');}
    box(c,796,122,24,23,0,'#1e3e4c');box(c,798,124,20,20,0,gradient(c,798,124,20,20,['#b5cbd0','#4c717d']));line(c,[[808,123],[808,145]],'#d9e4d8',1.7);
    for(let i=0;i<3;i++){box(c,785-i*4,146+i*3,48+i*8,3,0,i%2?'#9fa99c':'#dce0cf');}
    // Photographed red triangular roof logo.
    line(c,[[603,25],[623,1],[641,25],[603,25]],'#9e2532',2);c.font='bold 17px Georgia';c.fillStyle='#ad2938';c.fillText('sylex',602,21);
    for(const x of [745,857]){box(c,x,144,10,10,2,'#8c8470');ellipse(c,x+5,142,9,7,gradient(c,x,135,8,14,['#a3ad67','#315a3e']));}
    box(c,866,148,28,4,1,'#8d684a');line(c,[[870,151],[870,157]],'#3c504e',2);line(c,[[891,151],[891,157]],'#3c504e',2);
  }
  const terrain=document.createElement('canvas');terrain.width=960*SCALE;terrain.height=540*SCALE;
  const ground=terrain.getContext('2d');ground.scale(SCALE,SCALE);
  function terrainPaint(c){
    box(c,0,0,960,540,0,gradient(c,0,0,960,540,['#87966b','#667c53','#94a072']));
    const rand=random(3821);
    for(let i=0;i<21000;i++){
      const x=rand()*960,y=rand()*540; c.fillStyle=rand()>.5?'#d2ce8c28':'#264f3322';c.fillRect(x,y,.5+rand()*2,.4+rand());
    }
    // Paved parking, concrete curbs, drainage and asphalt aggregate.
    box(c,21,421,304,100,5,'#b1b6a3');box(c,25,425,296,92,3,gradient(c,0,425,0,92,['#586264','#3e4c50']));
    for(let x=38;x<320;x+=46){line(c,[[x,434],[x,506]],'#d1d4c5',1.4);box(c,x+10,503,22,3,1,'#a3a89b');}
    for(let i=0;i<1600;i++){const x=27+rand()*292,y=427+rand()*88;c.fillStyle=i%2?'#f0f2dc14':'#172b351a';c.fillRect(x,y,1,1);}
    ['#a9babf','#617b93','#5b6164','#bdc0b4','#73828b','#c6c9bf'].forEach((color,i)=>car(c,61+i*46,468,color));
    c.lineJoin='round';c.lineCap='round';
    c.save();c.shadowColor='#193c3140';c.shadowBlur=5;c.shadowOffsetY=3;line(c,path,'#4d5e4f',46);c.restore();
    line(c,path,'#c2c4af',43);line(c,path,'#8c988e',39);line(c,path,gradient(c,0,0,960,540,['#7a8380','#515f65']),34);
    c.save();c.beginPath();path.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.lineWidth=32;c.strokeStyle='#ffffff07';c.stroke();c.restore();
    c.setLineDash([6,16]);line(c,path,'#e4ddae',1.3);c.setLineDash([]);
    // Inset utility covers and planted beds.
    for(const [x,y] of [[150,339],[360,310],[570,300]]){box(c,x-7,y-6,14,12,2,'#445457','#a4ada0');for(let j=-4;j<6;j+=3)line(c,[[x-5,y+j],[x+5,y+j]],'#89948b',.7);}
    for(let x=28;x<925;x+=18){line(c,[[x+5,40],[x+10,45]],'#34473650',1);line(c,[[x,24],[x,42]],'#536c67',1.5);}
    line(c,[[28,28],[925,28]],'#b9c6b4',1.5);line(c,[[28,38],[925,38]],'#617d72',1);
    for(const [x,y] of [[70,400],[305,102],[620,441],[706,108]]){
      line(c,[[x,y],[x+24,y+12]],'#263e3040',3);line(c,[[x,y],[x,y-32]],'#465f60',2.5);line(c,[[x-1,y-31],[x+10,y-34]],'#a2b1a8',2);box(c,x+7,y-36,9,4,2,'#d6ddc6');
    }
    box(c,18,315,6,34,2,'#879b91');box(c,17,310,9,8,2,'#c9d0b6');
    for(let x=24;x<69;x+=7)box(c,x,311,7,3,0,x%2?'#b65343':'#ede6cd');
    building(c);
    for(const [x,y,size,seed] of [[53,110,28,1],[111,133,31,2],[230,91,30,3],[420,77,34,4],[501,171,26,5],[890,405,40,6],[847,478,34,7],[696,487,32,8],[351,510,26,9],[83,201,23,10]])tree(c,x,y,size,seed);
    slots.forEach(([x,y],i)=>{
      shadow(c,x+5,y+5,29,18);ellipse(c,x,y+3,23,16,'#526461');ellipse(c,x,y,23,16,gradient(c,x-15,y-12,30,24,['#c1c8b6','#879989']));ellipse(c,x,y,18,12,'#758a7d');
      for(let j=0;j<4;j++){const a=j*Math.PI/2+.6;ellipse(c,x+Math.cos(a)*19,y+Math.sin(a)*12,1.4,1,'#d4dac3');}
      c.font='600 12px Segoe UI';c.textAlign='center';c.fillStyle='#edf0da';c.fillText(String(i+1),x,y+4);c.textAlign='start';
    });
  }
  terrainPaint(ground);
  function tower(c,x,y,type,level,angle=0,ghost=false){
    const color=types[type].color;c.save();if(ghost)c.globalAlpha=.5;
    shadow(c,x+10,y+6,30,16);
    ellipse(c,x,y+4,19,12,'#283d43');box(c,x-19,y-4,38,8,2,gradient(c,x-19,y,38,0,['#40565c','#9aaba6','#3e555e']));ellipse(c,x,y-4,19,12,gradient(c,x-18,y-14,36,18,['#aebeb5','#536b70']));
    for(let j=0;j<6;j++){const a=j*Math.PI/3;ellipse(c,x+Math.cos(a)*15,y-4+Math.sin(a)*8,1.4,1.2,'#d2dcd1');}
    box(c,x-9,y-21,18,17,2,gradient(c,x-9,0,18,0,['#263b45','#90aaa9','#344c57']));ellipse(c,x,y-20,11,6,'#b1c3ba');
    c.save();c.translate(x,y-22);c.rotate(angle);
    if(type==='rapid'){
      box(c,-12,-9,24,19,6,gradient(c,-12,-9,20,18,['#acbdb8','#536f79','#293e4a']),'#b9c9be');
      for(const bx of [-6,3]){box(c,bx,-29,4,25,1,gradient(c,bx,0,4,0,['#263a43','#afc2bf','#465e67']));box(c,bx-1,-31,6,6,1,'#283e47');}
      box(c,-10,3,20,3,1,color);box(c,8,-4,6,7,2,'#344c56');
    }else if(type==='slow'){
      ellipse(c,0,0,13,10,'#233c50');box(c,-8,-18,16,19,4,gradient(c,-8,0,16,0,['#416580','#d1eced','#5a8aa2']));
      for(let j=0;j<4;j++){ellipse(c,0,-3-j*5,11,4,'#344e65');ellipse(c,0,-5-j*5,10,3,color);}
      ellipse(c,0,-23,6,5,'#e2f7ee');
    }else{
      box(c,-14,-11,28,23,7,gradient(c,-14,-11,28,23,['#b9c5b8','#687d7a','#30494e']),'#c0ccb9');
      box(c,-8,-32,16,25,3,gradient(c,-8,0,16,0,['#455961','#b6c4b7','#526a72']));box(c,-9,-34,18,6,2,'#344b53');box(c,-6,-34,12,2,0,'#121f2b');
      for(let j=0;j<3;j++)box(c,-14,2+j*3,28,1,0,'#253d45');box(c,-12,-9,5,7,1,color);box(c,7,-9,5,7,1,color);
    }
    c.restore();for(let j=0;j<level;j++)box(c,x-8+j*7,y+7,4,2,1,'#eac775');c.restore();
  }
  function operator(c,e){
    const next=position(e.distance+2),facing=Math.sign(next.x-e.x);
    const stride=Math.sin(e.distance*.24)*3;
    c.save();c.translate(e.x,e.y);shadow(c,7,6,14,8);
    // Shambling undead with ragged clothes, reaching arms and sunken eyes.
    box(c,-6,2+stride*.5,5,12,2,'#343c35');box(c,1,2-stride*.5,5,12,2,'#485044');
    box(c,-7,11+stride*.5,7,5,2,'#242923');box(c,0,11-stride*.5,7,5,2,'#242923');
    box(c,-7,-9,14,19,4,e.slow?'#62abc1':'#55513d');
    for(const x of [-5,0,4])box(c,x,7,2,5,1,'#343c35');box(c,2,-4,3,5,.5,'#8b9d68');
    box(c,-12,-10-stride*.3,4,13,2,'#8b9d68');box(c,8,-13+stride*.3,4,13,2,'#8b9d68');
    ellipse(c,-10,-11-stride*.3,3,3,'#a3af7d');ellipse(c,10,-14+stride*.3,3,3,'#8b9d68');
    ellipse(c,1,-13,5,6,'#8b9d68');ellipse(c,-1,-14,1.7,1.5,'#38452f');ellipse(c,3,-14,1.7,1.5,'#38452f');
    ellipse(c,-1,-14,.6,.6,'#d7d885');ellipse(c,3,-14,.6,.6,'#d7d885');line(c,[[-1,-10],[3,-9]],'#303c29',1.5);c.restore();
    box(c,e.x-11,e.y-27,22,3,1,'#253a40');box(c,e.x-11,e.y-27,Math.max(.1,22*e.hp/e.max),3,1,'#a9d9a0');
  }
  function paint(c,game,selected,type,playing){
    c.setTransform(c.canvas.width/960,0,0,c.canvas.height/540,0,0);c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';
    c.drawImage(terrain,0,0,960,540);
    if(!playing)return;
    const selectedTower=game.towers.find(t=>t.slot===selected),spec=types[selectedTower?.type||type],p=slots[selected];
    c.beginPath();c.arc(p[0],p[1],spec.range+((selectedTower?.level||1)-1)*15,0,Math.PI*2);c.fillStyle='#c9e3ce0b';c.fill();c.strokeStyle='#e2e7c766';c.lineWidth=1;c.setLineDash([4,5]);c.stroke();c.setLineDash([]);
    ellipse(c,p[0],p[1],25,17,'#ffe08b30');c.strokeStyle='#f2d999';c.lineWidth=1.5;c.stroke();
    if(!selectedTower)tower(c,...p,type,1,0,true);
    const actors=[...game.towers.map(t=>({y:slots[t.slot][1],draw:()=>{
      const [x,y]=slots[t.slot];const target=game.enemies.filter(e=>Math.hypot(e.x-x,e.y-y)<types[t.type].range+(t.level-1)*15).sort((a,b)=>b.distance-a.distance)[0];
      const angle=target?Math.atan2(target.y-y,target.x-x)+Math.PI/2:0;tower(c,x,y,t.type,t.level,angle);
    }})),...game.enemies.map(e=>({y:e.y,draw:()=>operator(c,e)}))].sort((a,b)=>a.y-b.y);
    actors.forEach(a=>a.draw());
    for(const e of game.effects){c.save();c.globalAlpha=Math.min(1,e.life/.12);line(c,[[e.x,e.y-22],[e.tx,e.ty]],e.color,1.6);ellipse(c,e.tx,e.ty,4,3,'#fff0be');c.restore();}
  }
  function icon(type){const el=document.createElement('canvas');el.width=100;el.height=100;const c=el.getContext('2d');c.scale(1.6,1.6);tower(c,31,47,type,1,0);return el.toDataURL();}
  window.SylexRenderer={paint,icon};
})();
