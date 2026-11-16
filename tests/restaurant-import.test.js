const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {parseLupo,parseNevadzka,selectDay} = require('../menu-parsers');
const {getRestaurant} = require('../restaurants');
const source = fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
function harness() {
  let handler, id='nevadzka', orders={}, saved;
  vm.runInNewContext(source.slice(source.indexOf("app.post('/api/admin/menu-import'"),source.indexOf('// Feedback od používateľov')),{
    app:{post:(_,h)=>{handler=h;}},config:{adminPassword:'test-only'},parseLupo,parseNevadzka,selectDay,
    restaurantState:{exclusive:fn=>fn(),context:async()=>({restaurant:getRestaurant(id),date:'2026-11-16'})},
    loadOrders:async()=>orders,setManualMenu:async menu=>{saved=menu;}
  });
  return {id:value=>{id=value;},orders:value=>{orders=value;},saved:()=>saved,
    async send(body) { let status=200,data; const res={status:c=>{status=c;return res;},json:v=>{data=v;}}; await handler({body},res);return {status,data}; }
  };
}
test('produkčný import: admin, dnešný dátum, správny parser a zachovanie objednávok', async () => {
  const h=harness(), html=fs.readFileSync(path.join(__dirname,'fixtures/nevadzka.html'),'utf8');
  assert.equal((await h.send({html})).status,401);
  assert.equal((await h.send({adminPass:'test-only',html:'<title>Just a moment...</title>'})).status,400);
  assert.equal((await h.send({adminPass:'test-only',html:html.replaceAll('2026','2025')})).status,400);
  assert.equal((await h.send({adminPass:'test-only',html})).status,200);
  assert.equal(h.saved().date,'2026-11-16');assert.equal(h.saved().sekcie[1].polozky.length,4);
  h.orders({test:{jedlo:'J1 Test'}});
  assert.equal((await h.send({adminPass:'test-only',html})).status,409);
  h.orders({});h.id('lupo');
  assert.equal((await h.send({adminPass:'test-only',html})).status,400);
  assert.equal((await h.send({adminPass:'test-only',html:fs.readFileSync(path.join(__dirname,'fixtures/lupo.html'),'utf8')})).status,200);
  assert.equal(h.saved().sekcie[1].polozky.length,10);
});
