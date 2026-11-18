const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createAllergenEnricher, hasSourceAllergens } = require('../ai-allergens');
const settings = () => ({ openaiApiKey:'test-key', openaiAllergenModel:'gpt-4.1-mini' });
const menu = () => ({ restaurant:{id:'lupo'}, date:'2026-11-17', pricing:{soupIncluded:true}, sekcie:[{nazov:'Hlavné jedlo',polozky:[
  {cislo:1,nazov:'Vyprážaný syr, príloha',hmotnost:'120g',cena:8,sideOptions:['Ryža','Hranolky']},
  {cislo:2,nazov:'Buchty',hmotnost:'240g (1,3,7)',cena:8},
  {cislo:3,nazov:'Palacinka',hmotnost:'120g',cena:8}
]}] });
function reply(items) { return {data:{status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({items})}]}]}}; }
const good = [{id:'0:0',allergens:[7,3,1,7]},{id:'0:2',allergens:[1]}];

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
  assert.deepEqual(result.sekcie[0].polozky[2].aiAllergens,[1]);
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

test('prázdne odhady prejdú druhou kontrolou a hotové odhady ani údaje jedálne sa nemenia',async()=>{
  let calls=0;
  const enrich=createAllergenEnricher({settings,post:async(_,body,opts)=>{
    calls++;
    if(calls===1)return reply([{id:'0:0',allergens:[]},{id:'0:2',allergens:[1,3,7]}]);
    assert.deepEqual(JSON.parse(body.input).map(i=>i.id),['0:0']);
    assert.match(body.instructions,/Druhá kontrola/);assert.equal(opts.timeout,8000);
    return reply([{id:'0:0',variants:[{basis:'Možný variant: múka v cestíčku',allergens:[1]},{basis:'Možný variant: syr v náplni',allergens:[7]}]}]);
  }});
  const result=await enrich(menu());
  assert.deepEqual(result.sekcie[0].polozky[0].aiAllergens,[1,7]);
  assert.deepEqual(result.sekcie[0].polozky[0].aiAllergenBasis,['Možný variant: múka v cestíčku','Možný variant: syr v náplni']);
  assert.deepEqual(result.sekcie[0].polozky[2].aiAllergens,[1,3,7]);
  assert.equal(result.sekcie[0].polozky[1].hmotnost,'240g (1,3,7)');
  await enrich(menu());assert.equal(calls,2);
});

test('neurčený odhad sa po hodine automaticky preverí; otvorenia v rámci hodiny nevolajú API',async()=>{
  let time=1000,calls=0;
  const enrich=createAllergenEnricher({settings,now:()=>time,post:async(_,body)=>{
    calls++;return reply(JSON.parse(body.input).map(i=>body.text.format.schema.properties.items.items.required.includes('variants') ? {id:i.id,variants:[]} : {id:i.id,allergens:[]}));
  }});
  const result=await enrich(menu());assert.deepEqual(result.sekcie[0].polozky[0].aiAllergens,[]);
  assert.equal(calls,2);await enrich(menu());assert.equal(calls,2);
  time+=3600001;await enrich(menu());assert.equal(calls,4);
});

test('chyba alebo neplatné ID druhej kontroly nezahodí prvé odhady a nevloží vymyslené alergény',async()=>{
  for(const fail of [async()=>{throw Error('test-key');},async()=>reply([{id:'0:1',allergens:[14]}])]){
    let calls=0;const logs=[];
    const enrich=createAllergenEnricher({settings,log:v=>logs.push(v),post:async()=>{
      if(++calls===1)return reply([{id:'0:0',allergens:[7]},{id:'0:2',allergens:[]}]);
      return fail();
    }});
    const result=await enrich(menu());
    assert.deepEqual(result.sekcie[0].polozky[0].aiAllergens,[7]);
    assert.deepEqual(result.sekcie[0].polozky[2].aiAllergens,[]);
    await enrich(menu());assert.equal(calls,2);assert.ok(!logs.join('').includes('test-key'));
  }
});

test('UI oddeľuje AI od údajov jedálne a prázdny odhad netvrdí neprítomnosť alergénov',()=>{
  const html=fs.readFileSync(require.resolve('../public/index.html'),'utf8');
  const context={ALERGENY:{7:{cls:'a-mlieko',icon:'milk'}},esc:s=>s,aFull:()=> 'Mlieko',aShort:()=> 'Mlieko',uiT:key=>({aiAllergens:'Možné alergény',aiUnknown:'Alergény treba overiť v jedálni'})[key]};
  vm.createContext(context);vm.runInContext(html.slice(html.indexOf('function renderAiAllergens('),html.indexOf('function parseHmotnost(')),context);
  assert.equal(context.renderAiAllergens({aiAllergens:[7]},'source'), '');
  assert.match(context.renderAiAllergens({aiAllergens:[7]},''),/Možné alergény/);
  assert.match(context.renderAiAllergens({aiAllergens:[7]},''),/Mlieko/);
  assert.match(context.renderAiAllergens({aiAllergens:[7],aiAllergenBasis:['Možný variant: maslo']},''),/Možný variant: maslo/);
  assert.match(context.renderAiAllergens({aiAllergens:[]},''),/Alergény treba overiť v jedálni/);
});

test('J2 sa posúdi cez varianty receptúry a alergény pochádzajú z odpovede modelu',async()=>{
  const input={sekcie:[{nazov:'Hlavné jedlo',polozky:[{cislo:2,nazov:'Restovaná kuracia pečeň na cibuľke, ryža',hmotnost:'120g',cena:7.4}]}]};
  let calls=0;
  const enrich=createAllergenEnricher({settings,post:async(_,body)=>{
    if(++calls===1)return reply([{id:'0:0',allergens:[]}]);
    assert.equal(JSON.parse(body.input)[0].name,input.sekcie[0].polozky[0].nazov);
    assert.deepEqual(body.text.format.schema.properties.items.items.required,['id','variants']);
    return reply([{id:'0:0',variants:[{basis:'Možný variant: pšeničná múka na zahustenie šťavy',allergens:[1]},{basis:'Možný variant: maslo v cibuľovom základe',allergens:[7]}]}]);
  }});
  const result=await enrich(input);
  assert.deepEqual(result.sekcie[0].polozky[0].aiAllergens,[1,7]);assert.equal(result.sekcie[0].polozky[0].cena,7.4);
  assert.equal(input.sekcie[0].polozky[0].aiAllergens,undefined);
});

test('varianty bez dôvodu alebo s neplatnými alergénmi sa odmietnu',async()=>{
  for(const variants of [[{basis:'',allergens:[1]}],[{basis:'Možný variant',allergens:[15]}],[{basis:'Možný variant',allergens:[]}],Array(4).fill({basis:'Možný variant',allergens:[1]})]){
    let calls=0;const enrich=createAllergenEnricher({settings,log:()=>{},post:async()=>++calls===1?reply([{id:'0:0',allergens:[]},{id:'0:2',allergens:[1]}]):reply([{id:'0:0',variants}])});
    const result=await enrich(menu());assert.deepEqual(result.sekcie[0].polozky[0].aiAllergens,[]);assert.deepEqual(result.sekcie[0].polozky[2].aiAllergens,[1]);
  }
});
