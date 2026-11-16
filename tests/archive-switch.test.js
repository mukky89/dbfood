const test = require('node:test');
const assert = require('node:assert/strict');
const { archiveAndSwitch } = require('../scripts/archive-switch-restaurant.cjs');
function harness({ count = 8, failBackup = false, changedOrders = false, failSettings = false } = {}) {
  let daily={_id:'day',datum:'Mon Nov 16 2026',orders:Object.fromEntries(Array.from({length:count},(_,i)=>['Test '+i,{meno:'Test '+i,jedlo:'J1 Testovacie jedlo',polievka:'P1 Test'}])),history:[{akcia:'NOVA',meno:'Test 0'}]},settings=null,archive=null;
  const writes=[];
  const args={target:'nevadzka',task:'test-switch-20261116',expectedCount:8,date:'2026-11-16',now:new Date('2026-11-16T12:00:00Z'),log:()=>{},
    Daily:{findOne:async()=>structuredClone(daily),updateOne:async(filter,u)=>{writes.push('daily');if(changedOrders)return{matchedCount:0};daily={...daily,...u.$set};return{matchedCount:1};}},
    Settings:{findOne:async()=>settings,create:async value=>{writes.push('settings');if(failSettings)throw new Error('Zápis jedálne zlyhal');settings=structuredClone(value);}},
    Archive:{findById:async()=>archive,create:async value=>{writes.push('archive');if(failBackup)throw new Error('Archív sa neuložil');archive=structuredClone(value);},updateOne:async(_,u)=>{writes.push('complete');archive={...archive,...u.$set};}}
  };
  return{args,writes,daily:()=>daily,settings:()=>settings,archive:()=>archive};
}
test('úplný archív je uložený pred vyčistením a prepnutím; opakovanie nič nemení',async()=>{
  const h=harness();await archiveAndSwitch(h.args);
  assert.deepEqual(h.writes,['archive','daily','settings','complete']);
  assert.equal(Object.keys(h.archive().daily.orders).length,8);assert.equal(h.archive().daily.history.length,1);
  assert.equal(h.archive().status,'complete');assert.equal(Object.keys(h.daily().orders).length,0);
  assert.equal(h.settings().restaurantId,'nevadzka');assert.equal(h.settings().revision,1);
  await archiveAndSwitch(h.args);assert.equal(h.writes.length,4);
});
test('chyba archívu, iný počet alebo iný deň nesmú zmeniť objednávky',async()=>{
  for(const options of [{failBackup:true},{count:9}]){const h=harness(options);await assert.rejects(archiveAndSwitch(h.args));assert.equal(Object.keys(h.daily().orders).length,options.count||8);assert.equal(h.settings(),null);}
  const h=harness();await assert.rejects(archiveAndSwitch({...h.args,date:'2026-11-17'}));assert.deepEqual(h.writes,[]);
});
test('súbežná úprava objednávok zastaví prepnutie; pri chybe nastavenia sa aktívne objednávky obnovia',async()=>{
  const changed=harness({changedOrders:true});await assert.rejects(archiveAndSwitch(changed.args));assert.equal(changed.settings(),null);assert.equal(Object.keys(changed.daily().orders).length,8);
  const failed=harness({failSettings:true});await assert.rejects(archiveAndSwitch(failed.args));assert.equal(Object.keys(failed.daily().orders).length,8);assert.equal(failed.archive().status,'pending');
});
