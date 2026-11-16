const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const express = require('express');
const { parseLupo, parseNevadzka, selectDay } = require('../menu-parsers');
const { todaySK, getRestaurant } = require('../restaurants');
const { createRestaurantState } = require('../restaurant-state');
const { validSelection } = require('../menu-selection');
const { vypocitajCenu } = require('../paysquare');
const pricing = require('../public/menu-pricing');
const { formatEmail } = require('../mailer');
const fixture = id => fs.readFileSync(path.join(__dirname, 'fixtures', id + '.html'), 'utf8');
const lupo = parseLupo(fixture('lupo')), nevadzka = parseNevadzka(fixture('nevadzka'));
const dates = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'];
for (const [id, days, counts, soup] of [['lupo', lupo, [10,9,9,9,10], 2], ['nevadzka', nevadzka, [4,4,4,4,4], 1]]) {
  test(`${id}: päť dátumov bez miešania dní`, () => assert.deepEqual(Object.keys(days), dates));
  dates.forEach((date, i) => test(`${id}: ${date}, polievky, hlavné jedlá, ceny a číslovanie`, () => {
    const menu = selectDay(days, date), main = menu.sekcie.find(s => s.nazov === 'Hlavné jedlo');
    assert.equal(menu.date, date);
    assert.equal(menu.sekcie.find(s => s.nazov === 'Polievka').polozky.length, soup);
    assert.equal(main.polozky.length, counts[i]);
    assert.deepEqual(main.polozky.map(p => p.cislo), Array.from({ length: counts[i] }, (_, i) => i + 1));
    for (const p of main.polozky) { assert.ok(p.nazov); assert.ok(p.hmotnost); assert.ok(p.cena > 0); assert.doesNotMatch(p.nazov, /^\d+g/); }
  }));
  test(`${id}: víkend a nezverejnený týždeň nevrátia staré menu`, () => {
    for (const date of ['2026-11-21', '2026-11-23', '2026-11-15']) assert.equal(selectDay(days, date).sekcie.length, 0);
  });
}
test('LUPO: rôzne ceny, prílohy a dezerty; ostatné kategórie zostávajú informačné', () => {
  const menu = lupo[dates[0]], main = menu.sekcie[1].polozky;
  assert.equal(main[2].cena, 8.9);
  assert.equal(menu.pricing.soup, 2.8);
  assert.equal(menu.pricing.withoutSoupDiscount, 1);
  assert.ok(main[3].sideOptions.includes('Ryža dusená'));
  assert.equal(menu.sekcie[2].polozky[0].cena, 1.9);
  assert.ok(menu.informational.some(i => i.category === 'Šaláty'));
});
test('Nevädzka: rímske čísla, hmotnosť bez medzery a alergény', () => {
  const p = nevadzka[dates[2]].sekcie[1].polozky[2];
  assert.equal(p.cislo, 3); assert.match(p.hmotnost, /^240g \(1,3\)$/);
  assert.equal(nevadzka[dates[0]].informational.length, 3);
  assert.equal(nevadzka[dates[4]].informational.length, 2);
});
test('ceny nových jedální sú rovnaké na serveri aj v prehliadači', () => {
  const cases = [
    [lupo[dates[0]], 'P1 Polievka', 'J1 Jedlo', null, 8],
    [lupo[dates[0]], 'P2 Polievka', 'J3 Jedlo', null, 8.9],
    [lupo[dates[0]], 'P1 Polievka', 'J3 Jedlo', 'D1 Palacinka', 10.8],
    [lupo[dates[0]], null, 'J3 Jedlo', null, 7.9],
    [lupo[dates[0]], 'P1 Polievka', null, null, 2.8],
    [lupo[dates[3]], 'P1 Polievka', 'J1 Kačka', null, 9.5],
    [nevadzka[dates[0]], 'P1 Polievka', 'J4 Jedlo', null, 8],
    [nevadzka[dates[0]], null, 'J2 Jedlo', null, 7.4],
    [nevadzka[dates[0]], 'P1 Polievka', null, null, 2.5]
  ];
  for (const [menu, soup, main, dessert, expected] of cases) {
    assert.equal(vypocitajCenu(soup, main, null, dessert, menu).celkom, expected);
    assert.deepEqual(vypocitajCenu(soup, main, null, dessert, menu), pricing.calculate(soup, main, null, dessert, menu));
  }
  assert.equal(vypocitajCenu('P1 x','J99 x',null,null,nevadzka[dates[0]]), null);
  assert.equal(vypocitajCenu('P1 x','J1 x',null,null,{restaurant:getRestaurant('nevadzka'),sekcie:[]}), null);
  assert.equal(vypocitajCenu('P1 x','J1 x',null,null,{sekcie:[]}).celkom, 6.5);
});
test('príloha je povinná iba pri jedlách s voľnou prílohou; staré meno položky sa odmietne', () => {
  const menu = lupo[dates[0]], item = menu.sekcie[1].polozky[3], value = 'J4 ' + item.nazov;
  assert.equal(validSelection(value, 'hlavné', 'J', menu), false);
  assert.equal(validSelection(value + ' — príloha: Ryža dusená', 'hlavné', 'J', menu), true);
  assert.equal(validSelection(value + ' — príloha: Pizza', 'hlavné', 'J', menu), false);
  assert.equal(validSelection('J4 Staré jedlo', 'hlavné', 'J', menu), false);
});
test('dátum je v Bratislave aj okolo polnoci a letného času', () => {
  assert.equal(todaySK(new Date('2026-11-15T23:30:00Z')), '2026-11-16');
  assert.equal(todaySK(new Date('2026-06-01T22:30:00Z')), '2026-06-02');
});
test('poškodená stránka, chýbajúci dátum a Cloudflare nevytvoria menu', () => {
  assert.deepEqual(parseLupo('<h2>Menu</h2>'), {});
  assert.deepEqual(parseNevadzka('<title>Just a moment...</title>'), {});
});
test('súhrnný e-mail používa názov vybranej jedálne', () => {
  for (const id of ['lupo','nevadzka']) {
    const menu = { ...selectDay(id === 'lupo' ? lupo : nevadzka, dates[0]), restaurant:getRestaurant(id) };
    const email = formatEmail({ test: {meno:'Test',polievka:'P1 Polievka',jedlo:'J1 Jedlo'} }, menu);
    assert.match(email.subject, new RegExp(menu.restaurant.name));
    assert.ok(email.html.includes(menu.restaurant.name)); assert.ok(email.text.includes(menu.restaurant.name.toUpperCase()));
    assert.doesNotMatch(email.html, /Fantozzi/);
  }
});
async function harness(t) {
  let doc = null, orders = {}, clears = 0;
  const store = { findOne: async () => doc, findOneAndUpdate: async (_, update) => { doc = { ...doc, ...update.$set, revision:(doc?.revision || 0) + (update.$inc?.revision || 0) }; } };
  const state = createRestaurantState({store,loadOrders:async()=>orders,adminPassword:'test-only',clearCache:()=>clears++});
  const app = express(); app.use(express.json()); app.use('/api',state.router);
  const server = app.listen(0, '127.0.0.1'); await new Promise(r=>server.once('listening',r)); t.after(()=>server.close());
  const request = async (method,body) => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/${method === 'GET' ? 'restaurant' : 'admin/restaurant'}`, {method,headers:{'Content-Type':'application/json'},body:method==='GET'?undefined:JSON.stringify(body)});
    return {status:res.status, ...await res.json()};
  };
  return {state,store,request,setOrders:o=>{orders=o;},clears:()=>clears};
}
test('API: autentifikácia, whitelist, prepnutie, perzistencia a zmena revízie aj pri návrate', async t => {
  const h = await harness(t), initial = await h.request('GET');
  assert.equal(initial.restaurant.id,'fantozzi');
  assert.equal((await h.request('POST',{restaurantId:'lupo'})).status,401);
  assert.equal((await h.request('POST',{adminPass:'test-only',restaurantId:'http://localhost'})).status,400);
  const lupo = await h.request('POST',{adminPass:'test-only',restaurantId:'lupo'});
  assert.equal(lupo.restaurant.id,'lupo'); assert.notEqual(lupo.key,initial.key);
  const restored = createRestaurantState({store:h.store,loadOrders:async()=>({}),adminPassword:'test-only',clearCache:()=>{}});
  assert.equal((await restored.selection()).id,'lupo');
  const back = await h.request('POST',{adminPass:'test-only',restaurantId:'fantozzi'});
  assert.notEqual(back.key,initial.key); assert.equal(h.clears(),2);
});
test('API: objednávky blokujú prepnutie, rovnaká jedáleň nemení revíziu', async t => {
  const h = await harness(t); h.setOrders({test:{jedlo:'J1 Test'}});
  assert.equal((await h.request('POST',{adminPass:'test-only',restaurantId:'nevadzka'})).status,409);
  assert.equal((await h.request('POST',{adminPass:'test-only',restaurantId:'fantozzi'})).status,200);
  assert.equal(h.clears(),0);
});
test('produkčný zápis objednávky odmieta starú jedáleň, falošné jedlá a ukladá zdroj', async () => {
  const src=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
  let handler, saved;
  const menu={...lupo[dates[0]],key:'lupo:1:2026-11-16'};
  const context={key:menu.key,restaurant:getRestaurant('lupo')};
  vm.runInNewContext(src.slice(src.indexOf("app.post('/api/orders'"),src.indexOf('// DELETE /api/orders/:meno')),{
    app:{post:(_,h)=>{handler=h;}},restaurantState:{exclusive:fn=>fn(),context:async()=>context},validSelection,
    isTodayBlocked:async()=>({blocked:false}),isOrderingOpen:()=>true,fetchMenu:async()=>menu,
    loadOrders:async()=>({}),loadTodayHistory:async()=>[],getCasSK:()=> '09:00',saveOrders:async o=>{saved=o;}
  });
  async function send(body) { let status=200,data; const res={status:c=>{status=c;return res;},json:v=>{data=v;}}; await handler({body},res);return {status,data}; }
  const order={meno:'Test',polievka:'P1 '+menu.sekcie[0].polozky[0].nazov,jedlo:'J1 '+menu.sekcie[1].polozky[0].nazov};
  assert.equal((await send({...order,menuKey:'fantozzi:0:2026-11-16'})).status,409);
  assert.equal((await send({...order,menuKey:context.key,jedlo:'J1 Staré menu'})).status,400);
  assert.equal((await send({...order,menuKey:context.key})).status,200);
  assert.equal(saved.Test.restaurantId,'lupo');
});
