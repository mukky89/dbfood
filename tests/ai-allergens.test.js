const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createAllergenEnricher,sourceAllergens}=require('../ai-allergens');
const settings=()=>({openaiApiKey:'test-key',openaiAllergenModel:'gpt-4.1-mini'});
const menu=()=>({restaurant:{id:'lupo'},date:'2026-11-18',pricing:{soupIncluded:true},sekcie:[{nazov:'Hlavné jedlo',polozky:[
  {cislo:1,nazov:'Vyprážaný syr, príloha',hmotnost:'120g',cena:8,sideOptions:['Ryža','Hranolky']},
  {cislo:2,nazov:'Buchty',hmotnost:'240g (1,3,7)',cena:8},
  {cislo:3,nazov:'Palacinka',hmotnost:'120g',cena:8}
]}]});
const reply=items=>({data:{status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({items})}]}]}});
const variant=(id,allergens=[1,3,7],basis='Možný variant: múka, vajcia a mlieko')=>({id,variants:allergens.length?[{basis,allergens}]:[]});
const regularPost=async(_,body)=>reply(JSON.parse(body.input).map(i=>variant(i.id)));

test('všetky položky sa posielajú bez objednávok; zdrojové údaje aj ceny ostanú zachované',async()=>{
  let calls=0;const enrich=createAllergenEnricher({settings,post:async(url,body,opts)=>{
    calls++;assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(body.store,false);assert.equal(opts.timeout,20000);
    const data=JSON.parse(body.input);assert.deepEqual(data.map(i=>i.id),['0:0','0:1','0:2']);assert.deepEqual(data[1].declared,[1,3,7]);assert.deepEqual(data[0].sides,['Ryža','Hranolky']);assert.ok(!body.input.includes('Secret'));
    return regularPost(url,body);
  }});
  const input=menu();input.orders={meno:'Secret'};const result=await enrich(input);
  assert.equal(input.sekcie[0].polozky[0].aiAllergens,undefined);assert.deepEqual(result.sekcie[0].polozky[1],input.sekcie[0].polozky[1]);assert.deepEqual(result.pricing,input.pricing);
  result.sekcie[0].polozky[0].aiAllergens.push(14);assert.deepEqual((await enrich(menu())).sekcie[0].polozky[0].aiAllergens,[1,3,7]);assert.equal(calls,1);
});

test('neúplné zdrojové alergény sa doplnia bez prepisovania alebo duplicít',async()=>{
  const input=menu();input.sekcie[0].polozky[1].hmotnost='240g (1,3)';
  const result=await createAllergenEnricher({settings,post:regularPost})(input);const item=result.sekcie[0].polozky[1];
  assert.equal(item.hmotnost,'240g (1,3)');assert.deepEqual(item.aiAllergens,[7]);
  assert.deepEqual(sourceAllergens({hmotnost:'120g (1,3)',nazov:'Jedlo alergény: 3,7'}),[1,3,7]);
});

test('nový deň, iná jedáleň, model aj zmenené menu spustia nový odhad',async()=>{
  let calls=0,model='gpt-4.1-mini';const enrich=createAllergenEnricher({settings:()=>({...settings(),openaiAllergenModel:model}),post:async(...args)=>{calls++;return regularPost(...args);}});
  await enrich(menu());await enrich(menu());assert.equal(calls,1);
  for(const id of ['nevadzka','fantozzi']){const m=menu();m.restaurant.id=id;await enrich(m);}assert.equal(calls,3);
  const tomorrow=menu();tomorrow.date='2026-11-19';await enrich(tomorrow);assert.equal(calls,4);
  const other=menu();other.sekcie[0].polozky[0].nazov='Iné';await enrich(other);assert.equal(calls,5);
  model='other';await enrich(other);assert.equal(calls,6);
});

test('súbežné rovnaké menu zdieľa volanie a iná jedáleň sa nepreskočí',async()=>{
  let calls=0,active=0,max=0;const enrich=createAllergenEnricher({settings,post:async(...args)=>{calls++;max=Math.max(max,++active);await new Promise(r=>setImmediate(r));active--;return regularPost(...args);}});
  const other=menu();other.restaurant.id='nevadzka';const results=await Promise.all([enrich(menu()),enrich(menu()),enrich(other)]);
  assert.equal(calls,2);assert.equal(max,1);for(const result of results)assert.deepEqual(result.sekcie[0].polozky[0].aiAllergens,[1,3,7]);
});

test('bez kľúča a pri vypnutí API nevoláme; zdrojové alergény už položku nevylúčia',async()=>{
  const input=menu(),post=()=>assert.fail('must not call');
  assert.equal(await createAllergenEnricher({settings:()=>({}),post})(input),input);
  assert.equal(await createAllergenEnricher({settings:()=>({...settings(),aiAllergensEnabled:false}),post})(input),input);
  input.sekcie[0].polozky=input.sekcie[0].polozky.slice(1,2);let calls=0;
  await createAllergenEnricher({settings,post:async(...args)=>{calls++;return regularPost(...args);}})(input);assert.equal(calls,1);
});

test('veľké menu sa spracuje celé v dávkach po najviac 20 položiek',async()=>{
  const input=menu();input.sekcie[0].polozky=Array.from({length:85},(_,i)=>({cislo:i+1,nazov:'Jedlo '+i}));const sizes=[];
  const result=await createAllergenEnricher({settings,post:async(...args)=>{sizes.push(JSON.parse(args[1].input).length);return regularPost(...args);}})(input);
  assert.deepEqual(sizes,[20,20,20,20,5]);assert.equal(result.sekcie[0].polozky.filter(p=>p.aiAllergens.length).length,85);
});

test('všetky sekcie všetkých troch jedální sa spracujú každý nový deň',async()=>{
  let calls=0;const enrich=createAllergenEnricher({settings,post:async(...args)=>{calls++;return regularPost(...args);}});
  for(const id of ['fantozzi','lupo','nevadzka'])for(const date of ['2026-11-18','2026-11-19']){
    const input={restaurant:{id},date,sekcie:['Polievka','Hlavné jedlo','Pizza','Dezert'].map((nazov,i)=>({nazov,polozky:[{cislo:i+1,nazov:'Jedlo '+nazov,hmotnost:i===0?'0,33l (7)':'120g'}]}))};
    const result=await enrich(input);for(const s of result.sekcie)assert.ok(s.polozky[0].aiAllergens.length);assert.equal(result.sekcie[0].polozky[0].hmotnost,'0,33l (7)');
  }assert.equal(calls,6);
});

test('prázdne výsledky sa preveria druhýkrát iba pre konkrétne položky',async()=>{
  let calls=0;const enrich=createAllergenEnricher({settings,post:async(_,body,opts)=>{
    if(++calls===1)return reply([variant('0:0',[]),variant('0:1'),variant('0:2')]);
    assert.deepEqual(JSON.parse(body.input).map(i=>i.id),['0:0']);assert.equal(opts.timeout,8000);assert.match(body.instructions,/Druhá kontrola/);return reply([variant('0:0',[1,7])]);
  }});
  assert.deepEqual((await enrich(menu())).sekcie[0].polozky[0].aiAllergens,[1,7]);await enrich(menu());assert.equal(calls,2);
});

test('neurčený výsledok má hodinovú cache a netvrdí neprítomnosť alergénov',async()=>{
  let calls=0,time=1000;const enrich=createAllergenEnricher({settings,now:()=>time,post:async(_,body)=>{calls++;return reply(JSON.parse(body.input).map(i=>variant(i.id,[])));}});
  assert.deepEqual((await enrich(menu())).sekcie[0].polozky[0].aiAllergens,[]);await enrich(menu());assert.equal(calls,2);time+=3600001;await enrich(menu());assert.equal(calls,4);
});

test('výpadok zachová menu, používa cooldown a neloguje kľúč',async()=>{
  let calls=0,time=1000;const logs=[];const enrich=createAllergenEnricher({settings,now:()=>time,log:v=>logs.push(v),post:async()=>{calls++;throw Object.assign(Error('test-key'),{response:{status:429}});}});
  const input=menu();assert.equal(await enrich(input),input);await enrich(input);const other=menu();other.restaurant.id='nevadzka';await enrich(other);assert.equal(calls,1);time+=600001;await enrich(other);assert.equal(calls,2);assert.ok(!logs.join('').includes('test-key'));
});

test('neplatné id, čísla, dôvody, refusal a neúplné odpovede sa odmietnu',async()=>{
  for(const response of [reply([variant('wrong')]),reply([variant('0:0',[15]),variant('0:1'),variant('0:2')]),reply([variant('0:0',[7],''),variant('0:1'),variant('0:2')]),reply([variant('0:0'),variant('0:0'),variant('0:2')]),{data:{status:'incomplete'}},{data:{status:'completed',output:[{type:'message',content:[{type:'refusal'}]}]}}]){
    const input=menu();assert.equal(await createAllergenEnricher({settings,post:async()=>response,log:()=>{}})(input),input);
  }
});

test('chyba druhej kontroly zachová prvé úspešné odhady',async()=>{
  let calls=0;const result=await createAllergenEnricher({settings,log:()=>{},post:async()=>{if(++calls===1)return reply([variant('0:0',[7]),variant('0:1'),variant('0:2',[])]);throw Error('timeout');}})(menu());
  assert.deepEqual(result.sekcie[0].polozky[0].aiAllergens,[7]);assert.deepEqual(result.sekcie[0].polozky[2].aiAllergens,[]);
});

test('UI zobrazí dodatočné možné alergény aj pod zdrojovými a escapuje dôvod',()=>{
  const html=fs.readFileSync(require.resolve('../public/index.html'),'utf8');const context={ALERGENY:{7:{cls:'milk',icon:'milk'}},esc:s=>s.replaceAll('"','&quot;').replaceAll('<','&lt;'),aFull:()=> 'Mlieko',aShort:()=> 'Mlieko',uiT:key=>({aiAllergens:'Možné alergény',aiUnknown:'Alergény treba overiť v jedálni'})[key]};
  vm.createContext(context);vm.runInContext(html.slice(html.indexOf('function renderAiAllergens('),html.indexOf('function parseHmotnost(')),context);
  assert.equal(context.renderAiAllergens({aiAllergens:[]},'source'),'');assert.match(context.renderAiAllergens({aiAllergens:[7]},'source'),/Možné alergény/);
  assert.match(context.renderAiAllergens({aiAllergens:[7],aiAllergenBasis:['Možný variant: <maslo>']},''),/&lt;maslo>/);
  assert.match(context.renderAiAllergens({aiAllergens:[]},''),/treba overiť/);
});

test('ranná úloha predpripraví menu o 7:00 v Bratislave',async()=>{
  const source=fs.readFileSync(require.resolve('../server'),'utf8');let callback,prepared=0,cleared=0;
  const snippet=source.slice(source.indexOf("  cronTasks.push(cron.schedule('0 7 * * *'"),source.indexOf('  console.log(`[Cron] Nastavene'));
  vm.runInNewContext(snippet,{cronTasks:[],cron:{schedule:(pattern,fn,opts)=>{assert.equal(pattern,'0 7 * * *');assert.equal(opts.timezone,'Europe/Bratislava');callback=fn;}},cronOpts:{timezone:'Europe/Bratislava'},clearCache:()=>cleared++,prepareDailyAllergens:async()=>prepared++,console:{log:()=>{}}});
  await callback();assert.equal(cleared,1);assert.equal(prepared,1);
});

test('chyba odpovede jednej jedálne nepozastaví ďalšiu jedáleň ani nový deň',async()=>{
  let calls=0;const enrich=createAllergenEnricher({settings,log:()=>{},post:async(...args)=>{
    if(++calls===1)return reply([variant('wrong')]);return regularPost(...args);
  }});
  const input=menu();assert.equal(await enrich(input),input);
  const other=menu();other.restaurant.id='fantozzi';assert.ok((await enrich(other)).allergenReview);
  const tomorrow=menu();tomorrow.date='2026-11-19';assert.ok((await enrich(tomorrow)).allergenReview);
  await enrich(input);assert.equal(calls,3);
});

test('schéma požiadavky vynucuje platné ID, počet položiek a neprázdny odôvodnený variant',async()=>{
  const enrich=createAllergenEnricher({settings,post:async(url,body)=>{
    const schema=body.text.format.schema,rows=JSON.parse(body.input);
    assert.deepEqual(schema.properties.items.items.properties.id.enum,rows.map(r=>r.id));
    assert.equal(schema.properties.items.minItems,rows.length);assert.equal(schema.properties.items.maxItems,rows.length);
    const props=schema.properties.items.items.properties.variants.items.properties;
    assert.equal(props.basis.maxLength,240);assert.equal(props.allergens.minItems,1);
    return regularPost(url,body);
  }});assert.ok((await enrich(menu())).allergenReview);
});

test('celý týždeň skutočných LUPO a Nevädzka fixtures: žiadna položka sa nevynechá',async()=>{
  const {parseLupo,parseNevadzka}=require('../menu-parsers');let requests=0,total=0;
  const enrich=createAllergenEnricher({settings,post:async(...args)=>{requests++;total+=JSON.parse(args[1].input).length;return regularPost(...args);}});
  let expected=0;
  for(const [id,parse] of [['lupo',parseLupo],['nevadzka',parseNevadzka]]){
    const days=parse(fs.readFileSync(require.resolve('./fixtures/'+id+'.html'),'utf8'));
    assert.equal(Object.keys(days).length,5);
    for(const [date,day] of Object.entries(days)){
      const input={...day,date,restaurant:{id}},snapshot=structuredClone(input);
      expected+=input.sekcie.flatMap(s=>s.polozky).length;
      const result=await enrich(input);assert.deepEqual(input,snapshot);
      assert.equal(result.sekcie.flatMap(s=>s.polozky).length,input.sekcie.flatMap(s=>s.polozky).length);
    }
  }
  assert.equal(requests,10);assert.equal(total,expected);
});
