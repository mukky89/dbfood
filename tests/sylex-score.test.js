const test=require('node:test');const assert=require('node:assert/strict');const express=require('express');
const {Game}=require('../public/sylex-engine');const {replay,result,STEP,MAX_STEPS,RULES}=require('../public/sylex-score');
const {createSylexRouter,MemorySylexStore}=require('../sylex-api');
function winningRun(){const game=new Game({automatic:true}),actions=[];for(const slot of [1,3,6]){game.build(slot,'rapid');actions.push({t:0,action:'build',slot,type:'rapid'});}let steps=0;while((!game.wave||game.state==='wave')&&steps<MAX_STEPS){game.tick(STEP);steps++;}return {actions,steps,expected:result(game)};}
test('server replay recomputes first-wave score from actual deliveries and waves',()=>{const run=winningRun();assert.deepEqual(run.expected,{score:240,kills:9,waves:1});assert.deepEqual(replay(run.actions,run.steps),run.expected);});
test('replay rejects overspending, backwards times, invalid slots and oversized simulation',()=>{assert.throws(()=>replay([{t:0,action:'build',slot:0,type:'pulse'},{t:0,action:'build',slot:1,type:'pulse'}],1));assert.throws(()=>replay([{t:2,action:'call'},{t:1,action:'call'}],3));assert.throws(()=>replay([{t:0,action:'build',slot:99,type:'rapid'}],1));assert.throws(()=>replay([],MAX_STEPS+1));assert.throws(()=>replay([],1));});
test('replay verifies selling, targeting, specialization and early calls',()=>{
 const ok=[{t:0,action:'build',slot:3,type:'rapid'},{t:0,action:'target',slot:3,mode:'strong'},{t:0,action:'build',slot:4,type:'rapid'},{t:1,action:'sell',slot:4},{t:2,action:'call'}];
 const r=replay(ok,1500);assert.ok(r.waves>=0&&r.score>=30);
 assert.throws(()=>replay([{t:0,action:'sell',slot:3},{t:1,action:'call'}],10),/nepovolenú/);
 assert.throws(()=>replay([{t:0,action:'build',slot:3,type:'rapid'},{t:0,action:'target',slot:3,mode:'random'},{t:1,action:'call'}],10),/cielenie/);
 assert.throws(()=>replay([{t:0,action:'build',slot:3,type:'rapid'},{t:0,action:'specialize',slot:3,spec:'twin'},{t:1,action:'call'}],10),/nepovolenú/);
 assert.throws(()=>replay([{t:0,action:'build',slot:3,type:'rapid',mode:'first'},{t:1,action:'call'}],10),/Neplatná akcia/);
 assert.throws(()=>replay([{t:0,action:'call'},{t:1,action:'call'}],10),/nepovolenú/);
 assert.throws(()=>replay([{t:0,action:'build',slot:3,type:'nuke'}],10),/veža/);
 assert.equal(RULES,4);
});
async function fixture(t,rateLimits=false){let now=100000;const store=new MemorySylexStore(),app=express();app.use('/api/sylex',createSylexRouter({store,now:()=>now,rateLimits}));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>{server.closeAllConnections();server.close();});const base='http://127.0.0.1:'+server.address().port+'/api/sylex';return {store,advance:ms=>now+=ms,async call(path='',body,cookie,origin){const response=await fetch(base+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookie?{cookie}:{}),...(origin?{origin}:{})},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};}};}
test('shared scoreboard persists one verified result per run and selects each player best',async t=>{const api=await fixture(t),a=await api.call('/runs',{name:'Marek'}),run=winningRun();assert.equal(a.status,200);api.advance(run.steps*STEP*1000);const payload={actions:run.actions,steps:run.steps};const first=await api.call('/runs/'+a.data.id+'/finish',payload,a.cookie);assert.equal(first.status,200);assert.equal(first.data.result.score,240);const duplicate=await api.call('/runs/'+a.data.id+'/finish',payload,a.cookie);assert.equal(duplicate.data.result.score,240);assert.equal(api.store.results.size,1);
 const b=await api.call('/runs',{name:'Jana'});api.advance(run.steps*STEP*1000);await api.call('/runs/'+b.data.id+'/finish',payload,b.cookie);const board=await api.call('',null,a.cookie);assert.equal(board.data.rows.length,2);assert.equal(board.data.rows[0].name,'Marek');assert.equal(board.data.rows[0].isMe,true);assert.equal('player' in board.data.rows[0],false);
 const again=await api.call('/runs',{name:'Marek'},a.cookie);api.advance(31000);await api.call('/runs/'+again.data.id+'/finish',{actions:[],steps:930},a.cookie);assert.equal((await api.call()).data.rows.length,2);assert.equal((await api.call()).data.rows[0].score,240);
});
test('another player, forged score, accelerated time, cross-origin and expired runs are rejected',async t=>{const api=await fixture(t),a=await api.call('/runs',{name:'Obranca'}),b=await api.call('/runs',{name:'Iný'}),run=winningRun();const endpoint='/runs/'+a.data.id+'/finish',payload={actions:run.actions,steps:run.steps};assert.equal((await api.call(endpoint,payload,b.cookie)).status,404);assert.equal((await api.call(endpoint,payload,a.cookie)).status,400);api.advance(run.steps*STEP*1000);assert.equal((await api.call(endpoint,{...payload,score:999999},a.cookie)).status,400);assert.equal((await api.call('/runs',{name:'X'},a.cookie,'https://elsewhere.invalid')).status,403);api.advance(7200001);assert.equal((await api.call(endpoint,payload,a.cookie)).status,410);assert.equal(api.store.results.size,0);});
test('database failures remain retryable and never report a saved score',async t=>{const api=await fixture(t),a=await api.call('/runs',{name:'Obranca'}),run=winningRun();api.advance(run.steps*STEP*1000);api.store.saveResult=async()=>{throw Error('database unavailable');};assert.equal((await api.call('/runs/'+a.data.id+'/finish',{actions:run.actions,steps:run.steps},a.cookie)).status,503);assert.equal(api.store.results.size,0);});

test('players sharing one reverse-proxy IP have independent request budgets',async t=>{const api=await fixture(t,true);let cookie;for(let i=0;i<35;i++){const r=await api.call('/runs',{name:'Hráč '+i});assert.equal(r.status,200);if(i===0)cookie=r.cookie;}for(let i=0;i<30;i++)assert.equal((await api.call('/runs',{name:'Opakovanie'},cookie)).status,200);assert.equal((await api.call('/runs',{name:'Limit'},cookie)).status,429);assert.equal((await api.call('/runs',{name:'Ďalší kolega'})).status,200);});

test('automatic waves share exact preparation intervals and replay rejects manual starts',()=>{
 const a=new Game({automatic:true}),b=new Game({automatic:true});
 for(let i=0;i<899;i++){a.tick(STEP);b.tick(STEP);}assert.equal(a.wave,0);assert.equal(b.wave,0);
 a.tick(STEP);b.tick(STEP);assert.equal(a.wave,1);assert.equal(b.wave,1);
 a.queue=[];a.enemies=[];a.tick(STEP);assert.equal(a.state,'ready');assert.equal(a.countdown,15);assert.equal(a.credits,220+35);assert.equal(a.health,300);
 for(let i=0;i<449;i++)a.tick(STEP);assert.equal(a.wave,1);a.tick(STEP);assert.equal(a.wave,2);
 assert.throws(()=>replay([{t:0,action:'wave'}],900));assert.throws(()=>replay([{t:900,action:'wave'}],901));
});
test('leaderboard excludes legacy manual-wave results without deleting them',async t=>{
 const api=await fixture(t);api.store.results.set('legacy',{runId:'legacy',player:'old',score:99999,name:'Old',createdAt:0});
 assert.equal((await api.call()).data.rows.length,0);assert.equal(api.store.results.size,1);
});

test('server hands every run a seed and replays with it',async t=>{const api=await fixture(t),a=await api.call('/runs',{name:'Seed'});assert.ok(Number.isInteger(a.data.seed));assert.equal(api.store.runs.get(a.data.id).seed,a.data.seed);
 const {Game}=require('../public/sylex-engine');const g=new Game({automatic:true,seed:a.data.seed});const actions=[{t:0,action:'build',slot:3,type:'rapid'},{t:0,action:'build',slot:1,type:'rapid'},{t:0,action:'build',slot:6,type:'rapid'}];actions.forEach(x=>g.apply(x));let steps=0;while((g.wave<2||g.state==='wave')&&steps<MAX_STEPS&&g.state!=='over'){g.tick(STEP);steps++;}
 api.advance(steps*STEP*1000+1000);const r=await api.call('/runs/'+a.data.id+'/finish',{actions,steps},a.cookie);assert.equal(r.status,200);assert.deepEqual(r.data.result,result(g));
 assert.throws(()=>replay(actions,10,-1));assert.throws(()=>replay(actions,10,1.5));});
test('replay accepts drone launches only when they are legal',()=>{assert.throws(()=>replay([{t:0,action:'drone'}],10),/nepovolenú/);assert.throws(()=>replay([{t:0,action:'drone',slot:1}],10),/Neplatná akcia/);});
test('contest standings freeze at the deadline and name the winner',async t=>{let now=Date.parse('2026-11-30T12:00:00+01:00');const store=new MemorySylexStore(),app=express();app.use('/api/sylex',createSylexRouter({store,now:()=>now,rateLimits:false,contest:{endsAt:'2026-12-01T00:00:00+01:00',prize:'Balíček'}}));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>{server.closeAllConnections();server.close();});const base='http://127.0.0.1:'+server.address().port+'/api/sylex';
 const row=(id,player,score,createdAt)=>store.results.set(id,{runId:id,rules:RULES,player,name:player,score,kills:1,waves:1,createdAt});
 row('a','Jana',500,now-1000);let r=await (await fetch(base)).json();assert.equal(r.contest.ended,false);assert.equal(r.contest.winner,null);assert.equal(r.contest.prize,'Balíček');
 now=Date.parse('2026-12-01T00:00:00+01:00');row('b','Peter',900,now+1);r=await (await fetch(base)).json();assert.equal(r.contest.ended,true);assert.deepEqual(r.contest.winner,{name:'Jana',score:500});assert.deepEqual(r.rows.map(x=>x.name),['Jana']);});
