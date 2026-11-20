const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createSourceLoader, LUPO_API, READER } = require('../menu-source');
const { getRestaurant } = require('../restaurants');
const { parseLupo, parseNevadzka, selectDay } = require('../menu-parsers');
const fixture = id => fs.readFileSync(path.join(__dirname, 'fixtures', id + '.html'), 'utf8');
const forbidden = () => { throw Object.assign(new Error('HTTP 403'), { response: {status:403} }); };

test('Nevädzka: po HTTP 403 automaticky použije čerstvé HTML cez Reader a pôvodný parser', async () => {
  let request;
  const load = createSourceLoader({ readerEnabled:()=>true, readerKey:()=>'', get:async (url, options)=>{
    request={url,options}; return {status:200,data:fixture('nevadzka')};
  }});
  const result=await load(getRestaurant('nevadzka').url, forbidden);
  assert.equal(result.menuSource.transport,'reader');
  assert.equal(request.url,READER+getRestaurant('nevadzka').url);
  assert.equal(request.options.headers['X-No-Cache'],'true');
  assert.equal(request.options.headers['X-Return-Format'],'html');
  assert.equal(request.options.headers.Authorization,undefined);
  assert.equal(result.sourceAttempts[0].httpStatus,403);
  assert.equal(Object.keys(parseNevadzka(result.data)).length,5);
});
test('LUPO: verejné WordPress API je primárne a nevyžaduje Reader', async () => {
  let calls=0;
  const load=createSourceLoader({get:async url=>{calls++;assert.equal(url,LUPO_API);return {status:200,data:{content:{rendered:fixture('lupo')}}};}});
  const result=await load(getRestaurant('lupo').url,()=>assert.fail('Nemá sťahovať úvodnú stránku'));
  assert.equal(calls,1);assert.equal(result.menuSource.transport,'wordpress');
  assert.equal(Object.keys(parseLupo(result.data)).length,5);
});
test('LUPO: pri blokovaní API aj stránky použije cez Reader JSON text a zachová všetky ceny', async () => {
  const load=createSourceLoader({readerEnabled:()=>true, readerKey:()=>'', get:async(url,options)=>{
    if(url===LUPO_API)return forbidden();
    assert.equal(url,READER+LUPO_API);assert.equal(options.headers['X-Return-Format'],'text');
    return {status:200,data:JSON.stringify({content:{rendered:fixture('lupo')}})};
  }});
  const result=await load(getRestaurant('lupo').url,forbidden);
  assert.equal(result.menuSource.transport,'reader');
  const menu=parseLupo(result.data)['2026-11-16'];assert.equal(menu.sekcie[1].polozky[2].cena,8.9);
  assert.deepEqual(result.sourceAttempts.map(a=>a.httpStatus),[403,403,200]);
});
test('Reader HTTP 200 s antirobot stránkou alebo chybným JSON sa nepovažuje za úspech', async () => {
  const load=createSourceLoader({readerEnabled:()=>true,readerKey:()=>'',get:async()=>({status:200,data:'<title>Just a moment...</title>'})});
  for(const id of ['nevadzka','lupo']) await assert.rejects(load(getRestaurant(id).url,forbidden),/nie sú dostupné/);
});
test('súbežné požiadavky na rovnaký zdroj zdieľajú jedno sťahovanie', async () => {
  let calls=0,release;
  const wait=new Promise(resolve=>{release=resolve;});
  const load=createSourceLoader({get:async()=>{calls++;await wait;return {status:200,data:{content:{rendered:fixture('lupo')}}};}});
  const a=load(getRestaurant('lupo').url,forbidden),b=load(getRestaurant('lupo').url,forbidden);release();
  assert.equal((await a).data,(await b).data);assert.equal(calls,1);
});
test('záložnú službu možno vypnúť; ľubovoľné URL sa neposielajú Readeru', async () => {
  let calls=0;
  const load=createSourceLoader({readerEnabled:()=>false,get:async()=>{calls++;return forbidden();}});
  const response=await load('https://www.fantozzi.sk/dennemenu',async()=>({status:200,data:fixture('fantozzi')}));
  assert.equal(response.data,fixture('fantozzi'));assert.equal(calls,0);
  assert.equal((await load('https://example.test/menu',async()=>({data:'other'}))).data,'other');
  await assert.rejects(load(getRestaurant('fantozzi').url,forbidden));assert.equal(calls,0);
  await assert.rejects(load(getRestaurant('nevadzka').url,forbidden));assert.equal(calls,0);
});

test('Fantozzi: timeout priamej stránky použije HTML tej istej pevnej URL cez Reader',async()=>{
  let calls=0;
  const load=createSourceLoader({readerEnabled:()=>true,readerKey:()=>'',get:async(url,options)=>{
    calls++;assert.equal(url,READER+getRestaurant('fantozzi').url);assert.equal(options.headers['X-Return-Format'],'html');assert.equal(options.headers['X-No-Cache'],'true');
    return {status:200,data:fixture('fantozzi')};
  }});
  const result=await load(getRestaurant('fantozzi').url,async()=>{throw Object.assign(Error('timeout'),{code:'ECONNABORTED'});});
  assert.equal(result.menuSource.transport,'reader');assert.equal(calls,1);assert.equal(result.data,fixture('fantozzi'));
});

test('Fantozzi: úspešný priamy zdroj nepotrebuje Reader; antirobot HTML sa odmietne',async()=>{
  const load=createSourceLoader({readerEnabled:()=>true,readerKey:()=>'',get:async()=>({status:200,data:'<h1>Just a moment</h1>'})});
  assert.equal((await load(getRestaurant('fantozzi').url,async()=>({status:200,data:fixture('fantozzi')}))).menuSource.transport,'direct');
  await assert.rejects(load(getRestaurant('fantozzi').url,async()=>({status:200,data:'<h1>Challenge</h1>'})),/nie sú dostupné/);
});
test('zdroj so starým týždňom nikdy neposkytne dnešnú ponuku cez selectDay', async () => {
  const load=createSourceLoader({readerEnabled:()=>true,readerKey:()=>'',get:async()=>({status:200,data:fixture('nevadzka').replaceAll('2026','2025')})});
  const result=await load(getRestaurant('nevadzka').url,forbidden);
  assert.equal(selectDay(parseNevadzka(result.data),'2026-11-16').sekcie.length,0);
});
