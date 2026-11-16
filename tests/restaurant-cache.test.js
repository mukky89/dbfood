const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const axios = require('axios');
const translator = require('../translator');
translator.translateMenu = async () => {};
const scraper = require('../scraper');
const {getRestaurant} = require('../restaurants');
let context, fail = false, calls = 0;
const originalGet = axios.get;
axios.get = async () => {
  calls++;
  if (fail) throw new Error('Testovaný výpadok');
  return {status:200,data:fs.readFileSync(path.join(__dirname,'fixtures',context.restaurant.id+'.html'),'utf8')};
};
function select(id, date = '2026-11-16') { context={restaurant:getRestaurant(id),date,key:`${id}:1:${date}`}; }
test.after(()=>{axios.get=originalGet;});
test('cache je oddelená podľa jedálne a dátumu, stará cache zostáva iba pre ten istý deň', async () => {
  scraper.configureRestaurants(async()=>context);
  select('lupo'); const lupo=await scraper.fetchMenu();
  const count=calls; assert.equal((await scraper.fetchMenu()).key,lupo.key);assert.equal(calls,count);
  select('nevadzka'); const neva=await scraper.fetchMenu();assert.equal(neva.sekcie[0].polozky.length,1);
  fail=true; const cached=await scraper.fetchMenu();assert.equal(cached.key,neva.key);
  // Vynútime expiráciu TTL bez čakania a potvrdíme príznak neaktuálnosti.
  const originalNow=Date.now;Date.now=()=>originalNow()+31*60*1000;
  try { assert.equal((await scraper.fetchMenu()).stale,true); } finally { Date.now=originalNow; }
  select('lupo');assert.equal((await scraper.fetchMenu()).sekcie.length,0);
  select('nevadzka','2026-11-17');assert.equal((await scraper.fetchMenu()).sekcie.length,0);
  fail=false;assert.match((await scraper.fetchMenu()).sekcie[1].polozky[0].nazov,/Jemné hydinové/);
});
test('ručné menu sa ukladá trvalo; iný deň a iná jedáleň ho neprevezmú', async () => {
  const saved=new Map();
  const store={findOne:async({key})=>saved.get(key),findOneAndUpdate:async({key},u)=>saved.set(key,u.$set)};
  scraper.configureRestaurants(async()=>context,store); select('lupo');
  const menu=await scraper.fetchMenu();await scraper.setManualMenu(menu);scraper.clearCache();fail=true;
  assert.equal((await scraper.fetchMenu()).key,menu.key);
  select('nevadzka');assert.equal((await scraper.fetchMenu()).sekcie.length,0);
  select('lupo','2026-11-17');assert.equal((await scraper.fetchMenu()).sekcie.length,0);
  await assert.rejects(scraper.setManualMenu({...menu,date:'2026-11-16'}),/dnešný dátum/);
  fail=false;
});
test('chýbajúca cena sa nevymyslí z pôvodného Fantozzi cenníka', () => {
  const {parseNevadzka}=require('../menu-parsers');
  const html=fs.readFileSync(path.join(__dirname,'fixtures/nevadzka.html'),'utf8').replace(/7,40\s*€/g,'cena na vyžiadanie');
  const menu=parseNevadzka(html)['2026-11-16'];
  assert.equal(require('../public/menu-pricing').calculate('P1 x','J1 x',null,null,menu),null);
});
