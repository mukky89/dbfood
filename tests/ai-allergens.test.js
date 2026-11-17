const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createAllergenEnricher, hasSourceAllergens } = require('../ai-allergens');
const settings = () => ({ openaiApiKey:'test-key', openaiAllergenModel:'gpt-4.1-mini' });
const menu = () => ({ restaurant:{id:'lupo'}, date:'2026-11-17', pricing:{soupIncluded:true}, sekcie:[{nazov:'Hlavné jedlo',polozky:[
  {cislo:1,nazov:'Vyprážaný syr, príloha',hmotnost:'120g',cena:8,sideOptions:['Ryža','Hranolky']},
  {cislo:2,nazov:'Buchty',hmotnost:'240g (1,3,7)',cena:8},
  {cislo:3,nazov:'Prekvapenie šéfkuchára',hmotnost:'120g',cena:8}
]}] });
function reply(items) { return {data:{status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({items})}]}]}}; }
const good = [{id:'0:0',allergens:[7,3,1,7]},{id:'0:2',allergens:[]}];

test('OpenAI dostane iba verejné názvy bez objednávok; zdrojové alergény a ceny ostávajú zachované', async () => {
  let calls=0;
  const enrich=createAllergenEnricher({settings,post:async(url,body,opts)=>{
    calls++;assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(body.store,false);
    assert.equal(body.text.format.strict,true);assert.equal(opts.timeout,12000);
    const data=JSON.parse(body.input);assert.deepEqual(data.map(v=>v.id),['0:0','0:2']);
    assert.deepEqual(data[0].sides,['Ryža','Hranolky']);assert.ok(!body.input.includes('Secret'));
    return reply(good);
  }});
  const original=menu();original.orders={meno:'Secret'};
  const result=await enrich(original);
  assert.equal(original.sekcie[0].polozky[0].aiAllergens,undefined);
  assert.deepEqual(result.sekcie[0].polozky[0].aiAllergens,[1,3,7]);
  assert.deepEqual(result.sekcie[0].polozky[1],original.sekcie[0].polozky[1]);
  assert.deepEqual(result.sekcie[0].polozky[2].aiAllergens,[]);
  assert.deepEqual(result.pricing,original.pricing);assert.equal(result.sekcie[0].polozky[0].cena,8);
  result.sekcie[0].polozky[0].aiAllergens.push(14);
  assert.deepEqual((await enrich(menu())).sekcie[0].polozky[0].aiAllergens,[1,3,7]);assert.equal(calls,1);
});

test('súbežné otvorenia stránky zdieľajú volanie; zmena názvu alebo modelu vytvorí nový odhad',async()=>{
  let calls=0,model='gpt-4.1-mini';
  const enrich=createAllergenEnricher({settings:()=>({...settings(),openaiAllergenModel:model}),post:async()=>{calls++;await new Promise(r=>setImmediate(r));return reply(good);}});
  await Promise.all([enrich(menu()),enrich(menu()),enrich(menu())]);assert.equal(calls,1);
  const other=menu();other.sekcie[0].polozky[0].nazov='Rezeň';await enrich(other);assert.equal(calls,2);
  model='other-model';await enrich(other);assert.equal(calls,3);
});

test('bez kľúča, pri vypnutí a pri kompletných zdrojových alergénoch sa API nevolá',async()=>{
  const post=()=>{throw Error('must not call');};
  const input=menu();assert.equal(await createAllergenEnricher({settings:()=>({}),post})(input),input);
  assert.equal(await createAllergenEnricher({settings:()=>({...settings(),aiAllergensEnabled:false}),post})(input),input);
  input.sekcie[0].polozky=input.sekcie[0].polozky.slice(1,2);
  assert.equal(await createAllergenEnricher({settings,post})(input),input);
  assert.equal(hasSourceAllergens({nazov:'Jedlo (1, 3, 7)'}),true);
});

test('neplatné čísla, zamenené id, chýbajúce položky, refusal a neúplné odpovede sa nezobrazia',async()=>{
  for(const response of [reply([{id:'0:0',allergens:[15]},{id:'0:2',allergens:[]}]),reply([{id:'0:0',allergens:['7']},{id:'0:2',allergens:[]}]),reply([{id:'0:0',allergens:[7]},{id:'0:0',allergens:[]}]),reply([{id:'0:1',allergens:[7]},{id:'0:2',allergens:[]}]),reply([]),{data:{status:'incomplete'}},{data:{status:'completed',output:[{type:'message',content:[{type:'refusal'}]}]}}]) {
    const input=menu();const enrich=createAllergenEnricher({settings,post:async()=>response,log:()=>{}});
    assert.equal(await enrich(input),input);
  }
});

test('výpadok nezablokuje menu, opakovania majú cooldown aj pri zmene menu a log neobsahuje kľúč',async()=>{
  let time=1000,calls=0;const logs=[];
  const enrich=createAllergenEnricher({settings,now:()=>time,log:v=>logs.push(v),post:async()=>{calls++;throw Object.assign(Error('test-key'),{response:{status:429}});}});
  const input=menu();assert.equal(await enrich(input),input);await enrich(input);
  const other=menu();other.sekcie[0].polozky[0].nazov='Iné';await enrich(other);assert.equal(calls,1);
  time+=600001;await enrich(other);assert.equal(calls,2);assert.ok(!logs.join('').includes('test-key'));
});

test('UI oddeľuje AI od údajov jedálne a prázdny odhad netvrdí neprítomnosť alergénov',()=>{
  const html=fs.readFileSync(require.resolve('../public/index.html'),'utf8');
  const context={ALERGENY:{7:{cls:'a-mlieko',icon:'milk'}},esc:s=>s,aFull:()=> 'Mlieko',aShort:()=> 'Mlieko',uiT:key=>({aiAllergens:'Možné alergény',aiUnknown:'Alergény neuvedené'})[key]};
  vm.createContext(context);vm.runInContext(html.slice(html.indexOf('function renderAiAllergens('),html.indexOf('function parseHmotnost(')),context);
  assert.equal(context.renderAiAllergens({aiAllergens:[7]},'source'), '');
  assert.match(context.renderAiAllergens({aiAllergens:[7]},''),/Možné alergény/);
  assert.match(context.renderAiAllergens({aiAllergens:[7]},''),/Mlieko/);
  assert.match(context.renderAiAllergens({aiAllergens:[]},''),/Alergény neuvedené/);
});
