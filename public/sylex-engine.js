(function(root){
'use strict';
const path=[[0,340],[170,340],[170,210],[360,210],[360,390],[570,390],[570,240],[740,240],[740,150],[805,150]];
const slots=[[100,260],[235,280],[290,145],[425,280],[440,450],[510,315],[635,320],[660,175],[800,300]];
const types={rapid:{name:'Impulzná',cost:70,range:135,damage:18,rate:.42,color:'#68e0d0'},slow:{name:'Spomaľovacia',cost:90,range:120,damage:8,rate:.8,color:'#92baff'},pulse:{name:'Pulzná',cost:120,range:145,damage:36,rate:1.6,color:'#f6ca68'}};
const lengths=path.slice(1).map((p,i)=>Math.hypot(p[0]-path[i][0],p[1]-path[i][1]));
const total=lengths.reduce((a,b)=>a+b,0);
function position(distance){for(let i=0;i<lengths.length;i++){if(distance<=lengths[i]){const t=distance/lengths[i];return {x:path[i][0]+(path[i+1][0]-path[i][0])*t,y:path[i][1]+(path[i+1][1]-path[i][1])*t};}distance-=lengths[i];}return {x:805,y:150};}
class Game{
 constructor(){this.credits=210;this.health=100;this.wave=0;this.kills=0;this.towers=[];this.enemies=[];this.effects=[];this.state='ready';this.pending=0;this.spawn=0;}
 build(slot,type){const spec=types[type];if(!spec||!slots[slot]||this.health<=0||this.towers.some(t=>t.slot===slot))return false;if(this.credits<spec.cost)return false;this.credits-=spec.cost;this.towers.push({slot,type,level:1,cooldown:0});return true;}
 upgrade(slot){const t=this.towers.find(t=>t.slot===slot);if(!t||t.level>=3||this.health<=0)return false;const cost=types[t.type].cost*t.level;if(this.credits<cost)return false;this.credits-=cost;t.level++;return true;}
 start(){if(this.state!=='ready')return false;this.wave++;this.pending=6+this.wave*2;this.spawn=0;this.state='wave';return true;}
 tick(dt){if(this.state!=='wave')return;dt=Math.min(.1,Math.max(0,dt));this.spawn-=dt;if(this.pending&&this.spawn<=0){const hp=45+this.wave*15;this.enemies.push({distance:0,hp,max:hp,slow:0,...position(0)});this.pending--;this.spawn=.85;}
 for(const e of this.enemies){e.slow=Math.max(0,e.slow-dt);e.distance+=dt*(35+this.wave*2)*(e.slow>0?.45:1);Object.assign(e,position(e.distance));if(e.distance>=total&&e.hp>0){this.health=Math.max(0,this.health-10);e.hp=0;e.escaped=true;}}
 for(const t of this.towers){t.cooldown-=dt;const spec=types[t.type],p=slots[t.slot];const targets=this.enemies.filter(e=>e.hp>0&&Math.hypot(e.x-p[0],e.y-p[1])<=spec.range+(t.level-1)*15).sort((a,b)=>b.distance-a.distance);if(t.cooldown<=0&&targets.length){const target=targets[0];const hit=t.type==='pulse'?this.enemies.filter(e=>e.hp>0&&Math.hypot(e.x-target.x,e.y-target.y)<65):[target];for(const e of hit){e.hp-=spec.damage*(1+(t.level-1)*.6);if(t.type==='slow')e.slow=2;}this.effects.push({x:p[0],y:p[1],tx:target.x,ty:target.y,color:spec.color,life:.18});t.cooldown=spec.rate;}}
 this.enemies=this.enemies.filter(e=>{if(e.hp>0)return true;if(!e.escaped){this.kills++;this.credits+=12;}return false;});this.effects=this.effects.filter(e=>(e.life-=dt)>0);
 if(this.health<=0){this.state='over';this.effects=[];}else if(!this.pending&&!this.enemies.length){this.state='ready';this.credits+=35;}
 }
}
const api={Game,path,slots,types,position,total};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SylexTD=api;
})(typeof window!=='undefined'?window:globalThis);
