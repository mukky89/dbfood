const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {createMenuCheckRouter}=require('../menu-check');
const now=()=>new Date('2026-11-18T10:00:00Z');
async function harness(run,{available=true,complete=true}={}){
  let fetched=0,estimated=0;const contexts=[];
  const app=express();app.use(express.json());app.use('/api',createMenuCheckRouter({adminPassword:'test-only',now,
    fetchAutomaticMenu:async ctx=>{fetched++;contexts.push(ctx);return{availableDates:['2026-11-18'],menu:{...ctx,sekcie:available?[{nazov:'Hlavné jedlo',polozky:[{cislo:1,nazov:'Test'}]}]:[]}};},
    enrichMenuAllergens:async menu=>{estimated++;return complete?{...menu,allergenReview:{processed:1,date:menu.date,restaurantId:menu.restaurant.id}}:menu;}
  }));const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.on('listening',resolve));
  const request=async body=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api/admin/menu-check`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return{status:r.status,cache:r.headers.get('cache-control'),...await r.json()};};
  try{await run({request,counts:()=>({fetched,estimated}),contexts});}finally{await new Promise(resolve=>server.close(resolve));}
}
test('náhľad vyžaduje admin heslo a odmieta cudzie URL, neznáme jedálne a neplatné dátumy pred načítaním',async()=>{
  await harness(async h=>{
    assert.equal((await h.request({restaurantId:'lupo',date:'2026-11-18'})).status,401);
    for(const body of [{restaurantId:'https://example.test',date:'2026-11-18'},{restaurantId:'lupo',date:'2026-11-31'},{restaurantId:'lupo',date:'2027-11-18'},{restaurantId:'lupo',date:'yesterday'}])assert.equal((await h.request({adminPass:'test-only',...body})).status,400);
    assert.deepEqual(h.counts(),{fetched:0,estimated:0});
  });
});
test('prepnutie jedálne a dátumu je iba kontext náhľadu; kontrola používa rovnaký odhad',async()=>{
  await harness(async h=>{
    for(const restaurantId of ['lupo','fantozzi'])for(const date of ['2026-11-18','2026-11-19']){
      const r=await h.request({adminPass:'test-only',restaurantId,date});
      assert.equal(r.status,200);assert.equal(r.readOnly,true);assert.equal(r.reviewComplete,true);assert.equal(r.menu.restaurant.id,restaurantId);assert.equal(r.menu.date,date);assert.equal(r.cache,'no-store');
    }assert.deepEqual(h.counts(),{fetched:4,estimated:4});assert.ok(h.contexts.every(c=>c.key.includes(':check:')));
  });
});
test('nezverejnený nový deň sa nepreznačuje a nespustí platený odhad',async()=>{
  await harness(async h=>{
    const r=await h.request({adminPass:'test-only',restaurantId:'fantozzi',date:'2026-11-19'});
    assert.equal(r.available,false);assert.equal(r.reviewComplete,false);assert.equal(r.sourceDate,null);assert.deepEqual(r.availableDates,['2026-11-18']);assert.equal(h.counts().estimated,0);
  },{available:false});
});
test('chýbajúci kľúč či výpadok AI sa nevydáva za úspešné generovanie',async()=>{
  await harness(async h=>{const r=await h.request({adminPass:'test-only',restaurantId:'lupo',date:'2026-11-18'});assert.equal(r.available,true);assert.equal(r.reviewComplete,false);},{complete:false});
});
