const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),cheerio=require('cheerio');
const {parse}=require('../public/source-allergens'),{sourceOnlyMenu}=require('../source-only-menu'),{parseMenu}=require('../fantozzi-parser');

test('čítanie zdrojových čiarok, bodiek a neúplných oddeľovačov bez odhadovania',()=>{
  for(const [text,want] of [['130g,200g (1.3.7)',[1,3,7]],['450g (,7)',[7]],['120g (1, 3;7)',[1,3,7]],['120g (1,1,7)',[1,7]],['120g',[]],['0,33l',[]]]){
    const out=parse(text);assert.deepEqual(out.numbers,want);
    if(want.length)assert.ok(!out.hmotnostText.includes('('));
  }
});

test('Fantozzi: všetkých 14 položiek a všetky alergény sú presne zo zdrojového HTML',()=>{
  const html=fs.readFileSync(require.resolve('./fixtures/fantozzi.html'),'utf8'),$=cheerio.load(html),raw=$('#daily-menu li .daily-menu-weight').map((_,el)=>$(el).text().trim()).get();
  const menu=sourceOnlyMenu(parseMenu($)),items=menu.sekcie.flatMap(s=>s.polozky);
  assert.equal(items.length,14);assert.equal(items.length,raw.length);
  for(let i=0;i<items.length;i++){assert.equal(items[i].hmotnost,raw[i]);assert.deepEqual(items[i].allergens,parse(raw[i]).numbers);assert.ok(items[i].allergens.length);}
  assert.deepEqual(items.find(p=>p.nazov.startsWith('Segedinský')).allergens,[1,3,7]);
  assert.deepEqual(items.find(p=>p.nazov.startsWith('Kuracie plátky')).allergens,[1,7]);
});

test('staré ručné menu sa očistí od AI údajov; pri chýbajúcom zdroji sa nič nevymyslí',()=>{
  const original={allergenReview:{processed:2},sekcie:[{nazov:'Hlavné jedlo',polozky:[{nazov:'Jedlo',hmotnost:'120g (1.7)',aiAllergens:[14],aiAllergenBasis:['guess']},{nazov:'Neurčité jedlo',hmotnost:'120g',aiAllergens:[3]}]}]};
  const clean=sourceOnlyMenu(original);assert.equal(clean.allergenReview,undefined);
  assert.deepEqual(clean.sekcie[0].polozky[0].allergens,[1,7]);assert.deepEqual(clean.sekcie[0].polozky[1].allergens,[]);
  assert.equal(clean.sekcie[0].polozky[0].aiAllergens,undefined);assert.equal(clean.sekcie[0].polozky[0].aiAllergenBasis,undefined);assert.ok(original.sekcie[0].polozky[0].aiAllergens);
});

test('prehliadač zobrazí zdrojové alergény s bodkami rovnako ako server',()=>{
  const html=fs.readFileSync(require.resolve('../public/index.html'),'utf8'),ctx={SourceAllergens:{parse},ALERGENY:{1:{cls:'gluten',icon:'1'},3:{cls:'eggs',icon:'3'},7:{cls:'milk',icon:'7'}},esc:s=>s,aFull:a=>a.cls,aShort:a=>a.cls};
  vm.createContext(ctx);vm.runInContext(html.slice(html.indexOf('function parseHmotnost('),html.indexOf('// ── Init')),ctx);
  const result=ctx.parseHmotnost('130g,200g (1.3.7)');assert.equal(result.hmotnostText,'130g,200g');for(const text of ['gluten','eggs','milk'])assert.match(result.alergenyHtml,new RegExp(text));
  assert.equal(ctx.parseHmotnost('120g').alergenyHtml,'');
});
