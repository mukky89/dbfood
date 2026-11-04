/* Sylex Tower Defence — deterministic simulation shared by the browser and the
 * server replay (sylex-score.js). No Math.random(), Date or Math.hypot: every
 * distance uses Math.sqrt so all engines round identically. Logical map 960×540. */
(function(root){
'use strict';
const RULES=4;
// Four portals; every route joins the main road before the gate at (805,150).
// 0 west, 1 south, 2 east (over the bridge), 3 north-west.
const routes=[
 [[20,340],[170,340],[170,210],[360,210],[360,390],[570,390],[570,240],[740,240],[740,150],[805,150]],
 [[460,525],[460,390],[570,390],[570,240],[740,240],[740,150],[805,150]],
 [[935,470],[860,470],[860,390],[570,390],[570,240],[740,240],[740,150],[805,150]],
 [[70,55],[170,55],[170,210],[360,210],[360,390],[570,390],[570,240],[740,240],[740,150],[805,150]]
];
const portals=routes.map(r=>r[0]);
// Scenery shared by both renderers (not used by the simulation).
const river=[[835,600],[865,540],[890,470],[915,400],[980,350],[1060,330]],dataCentre=[906,208];
const routeNames=['západ','juh','východ','sever'];
const path=routes[0];
const slots=[[100,260],[235,280],[290,145],[425,280],[510,315],[635,320],[660,175],[800,300],[230,150],[300,300],[250,392],[395,460],[525,470],[720,330]];
const TOTAL_WAVES=20,START_CREDITS=220,CREDIT_CAP=1500,HEALTH=300,FIRST_COUNTDOWN=30,BREAK=15,SELL_RATE=.7,EFFECT_LIMIT=60;
// Drone strike: launched from the data centre, each drone chases and strafes zombies.
const DRONES={cost:80,cooldown:40,count:3,time:8,speed:220,range:40,damage:28,rate:.5,home:[906,208]};
const targeting={first:'Prvý',last:'Posledný',strong:'Najsilnejší',close:'Najbližší'};
const types={
 rapid:{name:'Impulzná',role:'Rýchla streľba na jeden cieľ, slabá proti pancieru',cost:70,range:135,damage:14,rate:.38,color:'#68e0d0',
  specs:{pierce:{name:'Prierazná',desc:'+40 % poškodenie a ignoruje pancier'},twin:{name:'Dvojhlavňová',desc:'Strieľa na dva ciele naraz'}}},
 slow:{name:'Spomaľovacia',role:'Kryogénny postrek: spomalí o 40 % na 2 s',cost:85,range:120,damage:6,rate:.8,slow:.6,slowTime:2,color:'#92baff',
  specs:{freeze:{name:'Kryogénna',desc:'Spomalenie o 60 % na 2,5 s'},field:{name:'Pole',desc:'Zasiahne všetkých v dosahu'}}},
 pulse:{name:'Pulzná',role:'Mínomet: pomalý, plošný zásah s oneskoreným dopadom',cost:120,range:155,damage:34,rate:1.8,splash:60,flight:.6,color:'#f6ca68',
  specs:{heavy:{name:'Ťažká',desc:'+60 % poškodenie a väčší dopad'},shock:{name:'Otrasová',desc:'Spomalí zasiahnutých a strieľa rýchlejšie'}}},
 laser:{name:'Laserová',role:'Súvislý lúč, sila rastie, kým drží cieľ; prepáli pancier',cost:200,range:140,dps:30,ramp:45,maxDps:120,color:'#ff7b72',
  specs:{focus:{name:'Fokus',desc:'Rýchlejší nábeh a o 50 % vyššie maximum'},prism:{name:'Hranol',desc:'Lúč preskočí na druhý cieľ s polovičnou silou'}}},
 radar:{name:'Radarová',role:'Bez útoku: +15 % dosah okolitých veží, odhalí maskovaných',cost:90,range:130,buff:.15,support:true,color:'#c6a7ff',
  specs:{boost:{name:'Zosilňovač',desc:'Veže v dosahu +15 % poškodenie a +10 % dosah'},scan:{name:'Zameriavač',desc:'Väčší dosah; odhalení dostávajú +20 % poškodenie'}}}
};
const enemyTypes={
 walker:{name:'Zombík',hp:50,speed:34,armor:0,reward:10,points:10,leak:10},
 runner:{name:'Bežec',hp:30,speed:62,armor:0,reward:8,points:10,leak:6},
 armored:{name:'Obrnený',hp:110,speed:24,armor:8,reward:18,points:25,leak:15},
 swarm:{name:'Roj',hp:16,speed:46,armor:0,reward:3,points:3,leak:3},
 cloaked:{name:'Maskovaný',hp:60,speed:40,armor:0,reward:15,points:20,leak:10,cloak:true},
 crawler:{name:'Plazivec',hp:24,speed:50,armor:0,reward:6,points:8,leak:6,noSlow:true},
 spore:{name:'Výtrusník',hp:140,speed:20,armor:0,reward:20,points:25,leak:20,heal:.3},
 leader:{name:'Vodca hordy',hp:320,speed:24,armor:3,reward:40,points:60,leak:30},
 boss:{name:'Kolos',hp:800,speed:19,armor:4,reward:80,points:150,leak:60,split:true},
 brute:{name:'Úlomok',hp:0,speed:28,armor:4,reward:20,points:30,leak:15}
};
// Waves are data: [kind, count, gap seconds, delay seconds]. Portals are
// drawn per run from a seeded generator, so the entrance is never known ahead.
const WAVES=[
 [['walker',8,.9]],
 [['walker',8,.9],['runner',4,.8,4]],
 [['walker',10,.8],['crawler',8,.45,3]],
 [['walker',8,.9],['armored',3,2.2],['runner',6,.7,6]],
 [['walker',10,.8,2],['spore',2,3,4],['boss',1,1,14]],
 [['walker',10,.8],['cloaked',4,1.5,2],['crawler',10,.4,8]],
 [['armored',6,1.6],['swarm',16,.3,2],['spore',3,2.5,6]],
 [['walker',12,.7],['armored',5,1.8,3],['cloaked',6,1.2,4]],
 [['runner',14,.5],['swarm',20,.25,3],['crawler',12,.35,6]],
 [['cloaked',6,1.2,3],['armored',6,1.6,5],['spore',4,2,6],['boss',2,6,16]]
];
// A 32-bit mixing generator: identical results in every JavaScript engine.
function rng(seed){let a=seed>>>0;return ()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
function portalCount(n){return Math.min(routes.length,1+Math.floor(n/2));}
function wavePlan(n,seed=0){
 if(n<1)return [];
 let rows;
 if(n<=WAVES.length)rows=WAVES[n-1].map(([kind,count,gap,delay=0])=>({kind,count,gap,delay}));
 else{const cycle=Math.floor((n-WAVES.length-1)/5)+1,template=WAVES[5+(n-WAVES.length-1)%5];rows=template.map(([kind,count,gap,delay=0])=>({kind,count:Math.round(count*(1+.3*cycle)),gap,delay}));}
 // Every wave ends with a leader unless a colossus already closes it.
 const end=Math.max(...rows.map(g=>g.delay+(g.count-1)*g.gap));
 if(!rows.some(g=>g.kind==='boss'))rows.push({kind:'leader',count:n>15?2:1,gap:4,delay:end+4});
 const random=rng(seed^Math.imul(n,0x9E3779B1)),open=portalCount(n),out=[];
 for(const g of rows){const route=Math.floor(random()*open);
  // Larger groups may split between two portals.
  if(g.count>=6&&open>1&&random()<.5){const other=(route+1+Math.floor(random()*(open-1)))%open,half=Math.ceil(g.count/2);out.push({...g,count:half,route},{...g,count:g.count-half,route:other,delay:g.delay+g.gap/2});}
  else out.push({...g,route});}
 return out;
}
function waveSummary(n){const out={};for(const g of wavePlan(n))out[g.kind]=(out[g.kind]||0)+g.count;return out;}
const hpScale=n=>Math.pow(1.13,n-1),speedScale=n=>1+Math.min(.15,(n-1)*.01);

const dist=(ax,ay,bx,by)=>Math.sqrt((ax-bx)*(ax-bx)+(ay-by)*(ay-by));
const lengths=routes.map(r=>r.slice(1).map((p,i)=>dist(p[0],p[1],r[i][0],r[i][1])));
const totals=lengths.map(l=>l.reduce((a,b)=>a+b,0));
const total=totals[0];
function position(distance,route=0){const r=routes[route]||routes[0],l=lengths[route]||lengths[0];for(let i=0;i<l.length;i++){if(distance<=l[i]){const t=distance/l[i];return {x:r[i][0]+(r[i+1][0]-r[i][0])*t,y:r[i][1]+(r[i+1][1]-r[i][1])*t};}distance-=l[i];}const end=r[r.length-1];return {x:end[0],y:end[1]};}

function upgradeCost(t){return t.level<3?types[t.type].cost*t.level:null;}
function specCost(t){return Math.round(types[t.type].cost*1.5);}
function sellValue(t){return Math.floor(t.spent*SELL_RATE);}
function radarRange(t){return types.radar.range+(t.level-1)*12+(t.spec==='scan'?30:0);}

class Game{
 constructor({automatic=false,seed=0}={}){this.automatic=automatic;this.seed=seed>>>0;this.countdown=FIRST_COUNTDOWN;this.credits=START_CREDITS;this.health=HEALTH;this.wave=0;this.kills=0;this.points=0;this.towers=[];this.enemies=[];this.shells=[];this.effects=[];this.queue=[];this.time=0;this.nextId=1;this.state='ready';this.maxHealth=HEALTH;this.total=TOTAL_WAVES;this.drones=[];this.droneCooldown=0;}
 get pending(){return this.queue.length;}
 earn(n){this.credits=Math.min(CREDIT_CAP,this.credits+n);}
 tower(slot){return this.towers.find(t=>t.slot===slot);}
 build(slot,type){const spec=types[type];if(!spec||!slots[slot]||this.health<=0||this.tower(slot)||this.credits<spec.cost)return false;this.credits-=spec.cost;this.towers.push({slot,type,level:1,cooldown:0,spent:spec.cost,target:'first',spec:null,beam:0,beamTime:0});return true;}
 upgrade(slot){const t=this.tower(slot);if(!t||t.level>=3||this.health<=0)return false;const cost=upgradeCost(t);if(this.credits<cost)return false;this.credits-=cost;t.spent+=cost;t.level++;return true;}
 specialize(slot,spec){const t=this.tower(slot);if(!t||t.level<3||t.spec||this.health<=0||!Object.hasOwn(types[t.type].specs,spec))return false;const cost=specCost(t);if(this.credits<cost)return false;this.credits-=cost;t.spent+=cost;t.spec=spec;return true;}
 sell(slot){const t=this.tower(slot);if(!t||this.health<=0)return false;this.earn(sellValue(t));this.towers=this.towers.filter(x=>x!==t);return true;}
 setTarget(slot,mode){const t=this.tower(slot);if(!t||!Object.hasOwn(targeting,mode)||types[t.type].support)return false;t.target=mode;return true;}
 launchDrones(){if(this.state!=='wave'||this.health<=0||this.droneCooldown>0||this.credits<DRONES.cost)return false;this.credits-=DRONES.cost;this.droneCooldown=DRONES.cooldown;
  for(let i=0;i<DRONES.count;i++)this.drones.push({id:this.nextId++,x:DRONES.home[0]+(i-1)*12,y:DRONES.home[1],time:DRONES.time,cool:i*.15,target:0});return true;}
 callWave(){if(this.state!=='ready'||this.health<=0||this.wave>=TOTAL_WAVES)return false;const early=Math.floor(this.countdown);this.earn(early*2);this.points+=early;return this.start();}
 // One entry point for UI and server replay; unknown actions are rejected.
 apply(a){switch(a.action){case 'build':return this.build(a.slot,a.type);case 'upgrade':return this.upgrade(a.slot);case 'sell':return this.sell(a.slot);case 'target':return this.setTarget(a.slot,a.mode);case 'specialize':return this.specialize(a.slot,a.spec);case 'call':return this.callWave();case 'drone':return this.launchDrones();default:return false;}}
 start(){if(this.state!=='ready'||this.health<=0||this.wave>=TOTAL_WAVES)return false;this.wave++;this.time=0;this.queue=[];
  wavePlan(this.wave,this.seed).forEach((g,gi)=>{for(let i=0;i<g.count;i++)this.queue.push({at:g.delay+i*g.gap,kind:g.kind,route:g.route,order:gi*1000+i});});
  this.queue.sort((a,b)=>a.at-b.at||a.order-b.order);this.state='wave';return true;}
 spawn(kind,route,distance=0,hp){const k=enemyTypes[kind],max=hp??Math.round(k.hp*hpScale(this.wave));const e={id:this.nextId++,kind,route,distance,hp:max,max,armor:k.armor,speed:k.speed*speedScale(this.wave),slow:0,slowFactor:1,cloak:!!k.cloak,revealed:!k.cloak,marked:false,...position(distance,route)};this.enemies.push(e);return e;}
 stats(t){
  const s=types[t.type],lv=t.level;let range=s.range+(lv-1)*12,dmg=1+.5*(lv-1),buff=0,boost=1;
  if(s.support)return {range:radarRange(t),damage:0,rate:0};
  for(const r of this.towers){if(r.type!=='radar'||r===t)continue;const a=slots[r.slot],b=slots[t.slot];if(dist(a[0],a[1],b[0],b[1])>radarRange(r))continue;buff=Math.max(buff,types.radar.buff+.05*(r.level-1)+(r.spec==='boost'?.1:0));if(r.spec==='boost')boost=1.15;}
  range*=1+buff;dmg*=boost;let rate=s.rate;
  if(t.spec==='pierce')dmg*=1.4;if(t.spec==='heavy')dmg*=1.6;if(t.spec==='shock')rate*=.75;
  return {range,damage:dmg,rate};
 }
 hit(e,amount,pierce=false){if(e.hp<=0||!e.revealed)return;if(e.marked)amount*=1.2;if(!pierce&&e.armor)amount=Math.max(amount*.25,amount-e.armor);e.hp-=amount;}
 chill(e,factor,time){if(e.hp<=0||!e.revealed||enemyTypes[e.kind].noSlow)return;if(e.slow<=0||factor<=e.slowFactor){e.slowFactor=factor;e.slow=Math.max(e.slow,time);}}
 targets(t,range){const [x,y]=slots[t.slot];const list=[];for(const e of this.enemies){if(e.hp<=0||!e.revealed)continue;const d=dist(e.x,e.y,x,y);if(d<=range)list.push({e,d,left:totals[e.route]-e.distance});}
  const by={first:(a,b)=>a.left-b.left,last:(a,b)=>b.left-a.left,strong:(a,b)=>b.e.hp-a.e.hp,close:(a,b)=>a.d-b.d}[t.target]||((a,b)=>a.left-b.left);
  return list.sort((a,b)=>by(a,b)||a.e.id-b.e.id).map(o=>o.e);}
 effect(x,y,tx,ty,color,life,kind){this.effects.push({x,y,tx,ty,color,life,kind});}
 tick(dt){
  dt=Math.min(.1,Math.max(0,dt));
  if(this.state==='ready'){if(this.automatic){this.countdown=Math.max(0,this.countdown-dt);if(this.countdown<1e-8){this.countdown=0;this.start();}}return;}
  if(this.state!=='wave')return;
  this.time+=dt;while(this.queue.length&&this.queue[0].at<=this.time+1e-9){const q=this.queue.shift();this.spawn(q.kind,q.route);}
  // Radar reveal and marking are recomputed every step.
  const radars=this.towers.filter(t=>t.type==='radar');
  for(const e of this.enemies){e.revealed=!e.cloak;e.marked=false;for(const r of radars){const p=slots[r.slot];if(dist(e.x,e.y,p[0],p[1])<=radarRange(r)){e.revealed=true;if(r.spec==='scan')e.marked=true;}}}
  for(const e of this.enemies){if(e.slow>0){e.slow=Math.max(0,e.slow-dt);if(!e.slow)e.slowFactor=1;}e.distance+=dt*e.speed*(e.slow>0?e.slowFactor:1);Object.assign(e,position(e.distance,e.route));if(e.distance>=totals[e.route]&&e.hp>0){this.health=Math.max(0,this.health-enemyTypes[e.kind].leak);e.hp=0;e.escaped=true;}}
  for(const s of this.shells){s.t-=dt;if(s.t>1e-9)continue;for(const e of this.enemies)if(e.hp>0&&dist(e.x,e.y,s.tx,s.ty)<=s.radius){this.hit(e,s.damage);if(s.shock)this.chill(e,.7,1.5);}this.effect(s.tx,s.ty,s.tx,s.ty,'#ffd27a',.3,'blast');}
  this.shells=this.shells.filter(s=>s.t>1e-9);
  this.droneCooldown=Math.max(0,this.droneCooldown-dt);
  for(const d of this.drones){d.time-=dt;d.cool=Math.max(0,d.cool-dt);
   let t=this.enemies.find(e=>e.id===d.target&&e.hp>0&&e.revealed);
   if(!t){t=null;let best=Infinity;for(const e of this.enemies){if(e.hp<=0||!e.revealed)continue;const v=dist(e.x,e.y,d.x,d.y);if(v<best||(v===best&&e.id<t.id)){best=v;t=e;}}d.target=t?t.id:0;}
   const hx=t?t.x:DRONES.home[0],hy=t?t.y:DRONES.home[1],v=dist(hx,hy,d.x,d.y),stepLen=DRONES.speed*dt;
   if(v>DRONES.range*.6){const k=Math.min(1,stepLen/v);d.x+=(hx-d.x)*k;d.y+=(hy-d.y)*k;}
   if(t&&v<=DRONES.range&&d.cool<=0){this.hit(t,DRONES.damage);d.cool=DRONES.rate;this.effect(d.x,d.y,t.x,t.y,'#7fe8ff',.12,'drone');}}
  this.drones=this.drones.filter(d=>d.time>1e-9);
  for(const t of this.towers){
   const s=types[t.type];if(s.support)continue;const st=this.stats(t),[x,y]=slots[t.slot];t.cooldown=Math.max(0,t.cooldown-dt);
   const list=this.targets(t,st.range);
   if(t.type==='laser'){
    const target=list[0];if(!target){t.beam=0;t.beamTime=0;continue;}
    if(t.beam===target.id)t.beamTime+=dt;else{t.beam=target.id;t.beamTime=0;}
    const focus=t.spec==='focus'?1.5:1,dps=Math.min(s.maxDps*focus,s.dps+s.ramp*focus*t.beamTime)*st.damage;
    this.hit(target,dps*dt,true);this.effect(x,y,target.x,target.y,s.color,.05,'beam');
    if(t.spec==='prism'){const second=this.enemies.filter(e=>e!==target&&e.hp>0&&e.revealed&&dist(e.x,e.y,target.x,target.y)<=80).sort((a,b)=>dist(a.x,a.y,target.x,target.y)-dist(b.x,b.y,target.x,target.y)||a.id-b.id)[0];if(second){this.hit(second,dps*dt*.5,true);this.effect(target.x,target.y,second.x,second.y,s.color,.05,'beam');}}
    continue;
   }
   if(t.cooldown>0||!list.length)continue;
   t.cooldown=st.rate;const damage=s.damage*st.damage;
   if(t.type==='rapid'){for(const e of list.slice(0,t.spec==='twin'?2:1)){this.hit(e,damage,t.spec==='pierce');this.effect(x,y,e.x,e.y,s.color,.18,'shot');}}
   else if(t.type==='slow'){const factor=t.spec==='freeze'?.4:s.slow,time=t.spec==='freeze'?2.5:s.slowTime;for(const e of t.spec==='field'?list:list.slice(0,1)){this.hit(e,damage);this.chill(e,factor,time);this.effect(x,y,e.x,e.y,s.color,.18,'frost');}}
   else if(t.type==='pulse'){const e=list[0],lead=position(e.distance+e.speed*(e.slow>0?e.slowFactor:1)*s.flight,e.route);this.shells.push({x,y,tx:lead.x,ty:lead.y,t:s.flight,flight:s.flight,damage,radius:s.splash+(t.spec==='heavy'?15:0),shock:t.spec==='shock'});this.effect(x,y,lead.x,lead.y,s.color,.18,'shell');}
  }
  // A colossus breaks into two fragments once it falls to half health.
  for(const e of [...this.enemies]){if(e.kind!=='boss'||e.escaped||e.hp>e.max/2)continue;e.hp=Math.min(e.hp,0);const hp=Math.round(e.max*.3);this.spawn('brute',e.route,e.distance,hp);this.spawn('brute',e.route,Math.max(0,e.distance-10),hp);}
  // A dying spore carrier bursts and heals the zombies around it.
  for(const e of this.enemies)if(e.hp<=0&&!e.escaped&&e.kind==='spore'&&!e.burst){e.burst=true;for(const o of this.enemies)if(o.hp>0&&dist(o.x,o.y,e.x,e.y)<=70)o.hp=Math.min(o.max,o.hp+o.max*enemyTypes.spore.heal);this.effect(e.x,e.y,e.x,e.y,'#b7d36a',.6,'spores');}
  this.enemies=this.enemies.filter(e=>{if(e.hp>0)return true;if(!e.escaped){const k=enemyTypes[e.kind];this.kills++;this.points+=k.points;this.earn(k.reward);}return false;});
  this.effects=this.effects.filter(e=>(e.life-=dt)>0);if(this.effects.length>EFFECT_LIMIT)this.effects=this.effects.slice(-EFFECT_LIMIT);
  if(this.health<=0){this.state='over';this.effects=[];this.shells=[];this.queue=[];this.drones=[];}
  else if(!this.queue.length&&!this.enemies.length){this.shells=[];this.drones=[];this.droneCooldown=0;this.earn(30+5*this.wave);if(this.wave>=TOTAL_WAVES){this.state='won';this.countdown=0;this.points+=1000+this.health*2;}else{this.state='ready';this.countdown=BREAK;}}
 }
}
const api={RULES,TOTAL_WAVES,DRONES,river,dataCentre,HEALTH,Game,path,routes,portals,routeNames,portalCount,rng,slots,types,enemyTypes,targeting,position,total,totals,wavePlan,waveSummary,upgradeCost,specCost,sellValue,radarRange,START_CREDITS,CREDIT_CAP};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SylexTD=api;
})(typeof window!=='undefined'?window:globalThis);
