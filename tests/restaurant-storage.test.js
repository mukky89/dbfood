const test=require('node:test');
const assert=require('node:assert/strict');
const {createRestaurantSettingsStore,createEmbeddedArchiveStore}=require('../restaurant-storage');
test('nové nastavenie využije existujúci dokument vzhľadu a zachová tému',async()=>{
  const doc={_id:'appearance',tema:'sylex',designVersion:2};
  const primary={findOne:async()=>null,updateOne:async()=>assert.fail('Nesmie písať do primárnej kolekcie')};
  const writes=[];
  const appearance={findOne:async()=>structuredClone(doc),updateOne:async(q,u)=>{
    writes.push({q,u});
    for(const [k,v] of Object.entries(u.$set||{})){if(k==='restaurantSelection')doc.restaurantSelection=v;else doc.restaurantSelection[k.split('.')[1]]=v;}
    for(const [k,v] of Object.entries(u.$inc||{}))doc.restaurantSelection[k.split('.')[1]]+=v;
    return{matchedCount:1};
  }};
  const store=createRestaurantSettingsStore(primary,appearance);
  await store.findOneAndUpdate({},{$set:{restaurantId:'nevadzka'},$inc:{revision:1}});
  assert.equal(doc.tema,'sylex');assert.equal(doc.designVersion,2);assert.equal((await store.findOne()).restaurantId,'nevadzka');
  await store.findOneAndUpdate({},{$set:{restaurantId:'lupo'},$inc:{revision:1}});
  assert.equal((await store.findOne()).revision,2);assert.equal(writes.length,2);
  assert.deepEqual(writes[1].u,{$set:{'restaurantSelection.restaurantId':'lupo'},$inc:{'restaurantSelection.revision':1}});
});
test('pôvodné samostatné nastavenie má prednosť a nemení vzhľad',async()=>{
  let write;
  const primary={findOne:async()=>({_id:'primary',key:'restaurant',restaurantId:'lupo',revision:4}),updateOne:async(q,u)=>{write={q,u};return{matchedCount:1};}};
  const appearance={findOne:async()=>assert.fail('Nemá čítať zálohu'),updateOne:async()=>assert.fail('Nemá meniť vzhľad')};
  const store=createRestaurantSettingsStore(primary,appearance);
  assert.equal((await store.findOne()).restaurantId,'lupo');
  await store.findOneAndUpdate({},{$set:{restaurantId:'nevadzka'},$inc:{revision:1}});
  assert.equal(write.q.revision,4);assert.equal(write.q._storage,undefined);
});
test('archív je vložený do existujúceho dokumentu bez novej kolekcie a zachová aktívne polia',async()=>{
  const doc={_id:'day',orders:{Test:{jedlo:'J1 Test'}},history:[{akcia:'NOVA'}]};
  const calls=[];
  const collection={findOne:async()=>structuredClone(doc),updateOne:async(q,u)=>{calls.push({q,u});if(u.$push)(doc.restaurantArchives||=[]).push(structuredClone(u.$push.restaurantArchives));else Object.assign(doc.restaurantArchives[0],Object.fromEntries(Object.entries(u.$set).map(([k,v])=>[k.split('.').pop(),v])));return{matchedCount:1};}};
  const store=createEmbeddedArchiveStore(collection),snapshot={_id:'test-task',daily:structuredClone(doc),count:1,status:'pending'};
  await store.create(snapshot);assert.equal(Object.keys(doc.orders).length,1);assert.equal(doc.history.length,1);
  await store.updateOne({_id:'test-task'},{$set:{status:'complete'}});
  assert.equal((await store.findById('test-task')).status,'complete');assert.equal(calls[0].q._id,'day');
});
test('štatistiky čítajú iba súhrnné veľkosti a netvoria kolekcie',async()=>{
  const commands=[];
  const db={listCollections:()=>({toArray:async()=>[{name:'a'},{name:'b'}]}),command:async q=>{commands.push(q);return q.dbStats?{dataSize:100,storageSize:200,indexSize:30,fsUsedSize:300,fsTotalSize:500}:{count:2,size:50,storageSize:q.collStats==='a'?80:120,totalIndexSize:15};}};
  const result=await require('../scripts/database-stats.cjs').databaseStats(db);
  assert.equal(result.collections[0].name,'b');assert.equal(result.dataSize,100);
  assert.ok(commands.every(c=>c.dbStats===1||typeof c.collStats==='string'));
});
