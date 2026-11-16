const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {parseLupo,applyLupoCharges}=require('../menu-parsers');
const {calculate}=require('../public/menu-pricing');
const {vypocitajCenu,generatePayBySquareQR}=require('../paysquare');
const menu=parseLupo(fs.readFileSync(path.join(__dirname,'fixtures/lupo.html'),'utf8'))['2026-11-16'];
test('LUPO: poplatok je raz za obed; polievka a dezert ho nezdvojujú',()=>{
  assert.equal(menu.pricing.preparationFee,0.5);
  for(const [main,dessert,expected] of [['J1 Jedlo',null,8.5],['J3 Jedlo',null,9.4],['J1 Jedlo','D1 Dezert',10.4]]){
    const result=calculate('P1 Polievka',main,null,dessert,menu);
    assert.equal(result.celkom,expected);assert.equal(result.detail.filter(d=>d.startsWith('Príprava a expedícia')).length,1);
  }
  assert.match(applyLupoCharges({pricing:{},pricingNote:'stará poznámka'}).pricingNote,/započítaný/);
  const legacy={...menu,restaurant:{id:'lupo'},pricing:{...menu.pricing}};delete legacy.pricing.preparationFee;
  assert.equal(calculate('P1 Test','J1 Test',null,null,legacy).celkom,8.5);
});
test('server a samostatne načítaný prehliadačový modul sa zhodujú vrátane viacerých porcií',()=>{
  const context={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/menu-pricing.js'),'utf8'),context);
  for(const [count,expected] of [[1,8.5],[2,17],[3,25.5]]){
    assert.equal(vypocitajCenu('P1 Test','J1 Test',null,null,menu,count).celkom,expected);
    assert.equal(context.window.MenuPricing.calculate('P1 Test','J1 Test',null,null,menu,count).celkom,expected);
  }
});
test('skutočný PNG QR zakóduje cenu s poplatkom aj počet porcií',async()=>{
  const {Jimp}=require('jimp'),jsQR=require('jsqr'),{decode}=await import('bysquare/pay');
  for(const count of [1,2]){
    const cena=vypocitajCenu('P1 Test','J1 Test',null,null,menu,count);
    const png=await generatePayBySquareQR({iban:'SK0000000000000000000000',suma:cena.celkom,sprava:'Test'}, {validate:false});
    const img=await Jimp.read(Buffer.from(png.split(',')[1],'base64'));
    const qr=jsQR(new Uint8ClampedArray(img.bitmap.data),img.bitmap.width,img.bitmap.height);
    assert.ok(qr);const payment=decode(qr.data).payments[0];
    assert.equal(payment.amount,8.5*count);assert.equal(payment.currencyCode,'EUR');
  }
});
test('produkčný QR endpoint prenesie počet porcií do výpočtu aj QR',async()=>{
  const src=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');let handler,encoded,result;
  vm.runInNewContext(src.slice(src.indexOf("app.post('/api/qr'"),src.indexOf('// GET /api/easter-qr')),{
    app:{post:(_,h)=>{handler=h;}},getPlatba:async()=>({iban:'test-only'}),fetchMenu:async()=>menu,vypocitajCenu,
    qrSprava:()=> 'Test',generatePayBySquareQR:async params=>{encoded=params.suma;return 'test-image';}
  });
  const res={status:()=>res,json:value=>{result=value;}};
  await handler({body:{polievka:'P1 Test',jedlo:'J1 Test',porcie:2}},res);
  assert.equal(result.suma,17);assert.equal(encoded,17);
});
test('QR potvrdenej objednávky zachová uložené porcie aj keď boli ovládače formulára resetované',async()=>{
  const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');let sent;
  const elements=new Map();const element=id=>{
    if(!elements.has(id))elements.set(id,{style:{display:id==='order-confirmed'?'block':'none'},classList:{add:()=>{}},value:''});
    return elements.get(id);
  };
  const context={currentQROrder:{polievka:'P1 Test',jedlo:'J1 Test',porcie:2},porcieCount:1,currentUser:'Test',currentEmail:'',getCookie:()=>'',
    document:{getElementById:element,querySelector:()=>({value:'J1 Test'})},
    fetch:async(_,options)=>{sent=JSON.parse(options.body);return{json:async()=>({ok:false})};}
  };
  vm.createContext(context);vm.runInContext(html.slice(html.indexOf('async function showQR()'),html.indexOf('async function sendQREmail()')),context);
  await context.showQR();assert.equal(sent.porcie,2);
});
