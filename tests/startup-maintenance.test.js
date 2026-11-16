const test=require('node:test');
const assert=require('node:assert/strict');
const {start}=require('../scripts/start.cjs');
test('vypnutá údržba spustí server bez údržbového procesu alebo jeho modelov',()=>{
  let started=0;
  start({config:{},spawn:()=>assert.fail('Údržba sa nesmie spustiť'),startServer:()=>started++});
  assert.equal(started,1);
});
test('údržba beží v samostatnom Node procese a následne sa spustí server aj pri chybe',()=>{
  for(const mode of ['success','failure','throw']){
    const events=[];
    start({config:{maintenanceRestaurantTarget:'nevadzka'},spawn:(exe,args,options)=>{
      events.push('child');assert.equal(exe,process.execPath);assert.match(args[0],/archive-switch-restaurant\.cjs$/);assert.equal(options.stdio,'inherit');
      if(mode==='throw')throw new Error('Testovaný problém');
      return{status:mode==='success'?0:1};
    },startServer:()=>events.push('server'),log:()=>events.push('error')});
    assert.deepEqual(events,mode==='success'?['child','server']:['child','error','server']);
  }
});
