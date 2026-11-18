const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),axios=require('axios');
require('../translator').translateMenu=async()=>{};
const scraper=require('../scraper'),{getRestaurant}=require('../restaurants');
test('automatický náhľad nečíta ručné menu ani nemení cache ostrého menu',async()=>{
  const original=axios.get;let reads=0,requests=0;
  axios.get=async url=>{requests++;const id=url.includes('lupo')?'lupo':'nevadzka';const html=fs.readFileSync(require.resolve('./fixtures/'+id+'.html'),'utf8');return{status:200,data:url.includes('wp-json')?{content:{rendered:html}}:html};};
  try{
    const context={restaurant:getRestaurant('nevadzka'),date:'2026-11-18',key:'nevadzka:5:2026-11-18'};
    scraper.configureRestaurants(async()=>context,{findOne:async()=>{reads++;return null;}});scraper.clearCache();
    const active=await scraper.fetchMenu(),before=reads;
    const preview=await scraper.fetchAutomaticMenu({restaurant:getRestaurant('lupo'),date:'2026-11-19',key:'lupo:check:2026-11-19'});
    assert.equal(preview.menu.restaurant.id,'lupo');assert.equal(preview.menu.date,'2026-11-19');assert.ok(preview.menu.sekcie.length);assert.equal(reads,before);
    const count=requests;assert.equal(await scraper.fetchMenu(),active);assert.equal(requests,count);
    const missing=await scraper.fetchAutomaticMenu({restaurant:getRestaurant('lupo'),date:'2026-11-25',key:'lupo:check:2026-11-25'});
    assert.equal(missing.menu.sekcie.length,0);assert.equal(missing.menu.unavailable,true);assert.ok(!missing.availableDates.includes('2026-11-25'));
  }finally{axios.get=original;scraper.configureRestaurants(async()=>({restaurant:getRestaurant('fantozzi')}));scraper.clearCache();}
});
