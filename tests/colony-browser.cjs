// Isolated local fixture only: node tests/preview-server.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { replay } = require('../public/colony-challenge');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:8766';
const output = path.join(__dirname, '../test-results/anthill');
fs.mkdirSync(output, { recursive: true });
const state = page => page.evaluate(() => JSON.parse(localStorage.getItem('fob_anthill_v1')));
const sandboxSnapshot = s => ({ food:s.food,water:s.water,delivered:s.delivered,foods:s.foods,rooms:s.rooms,population:s.ants.length,time:s.time });
async function advance(page, milliseconds) {
  await page.evaluate(()=>{window.colonyTestDraw=ColonyRenderer.draw;ColonyRenderer.draw=()=>{};});
  await page.clock.runFor(milliseconds);
  await page.evaluate(()=>{ColonyRenderer.draw=window.colonyTestDraw;delete window.colonyTestDraw;window.dispatchEvent(new Event('resize'));});
}

(async () => {
  const browser = await chromium.launch({ headless:true,channel:process.env.BROWSER_CHANNEL || 'msedge' });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport:{width:1440,height:1060} });
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
      localStorage.setItem('fantozzi_user','Test kolónia');
      const checkpoint=sessionStorage.getItem('colony_test_checkpoint');
      if(checkpoint){localStorage.setItem('fob_colony_run_v1',checkpoint);sessionStorage.setItem('fob_colony_run_v1',checkpoint);sessionStorage.removeItem('colony_test_checkpoint');}
    });
    await page.clock.install(); await page.clock.pauseAt(new Date());
    await page.goto(base+'/?colony=1');
    await page.locator('#ant-game').waitFor({state:'visible'});
    await page.evaluate(() => ColonyRenderer.ready);
    await page.screenshot({path:path.join(output,'natural-desktop.png')});
    console.log('Desktop screenshot ready: test-results/anthill/natural-desktop.png');
    const canvas=page.locator('#ant-canvas'), tool=name=>page.locator('#ant-game [data-tool='+name+']');
    const initial=await state(page);
    await tool('food').click(); await canvas.focus(); await canvas.press('Enter');
    let s=await state(page);
    assert.ok(s.foods.some(f=>f.type==='fruit'&&f.x===480),'keyboard food placement');
    assert.equal(s.food,initial.food,'clicking food does not credit reserves');
    await tool('water').click(); await canvas.focus(); await canvas.press('Enter');
    assert.match(await page.locator('#ant-status').innerText(),/Ďalšia porcia/);
    await advance(page,3200);
    for(let i=0;i<8;i++)await canvas.press('ArrowRight');
    await canvas.press('Enter');
    assert.ok((await state(page)).foods.some(f=>f.type==='water'&&f.x===624),'keyboard water placement after cooldown');
    await tool('build').click(); await canvas.focus(); await canvas.press('Enter');
    assert.equal((await state(page)).rooms.find(r=>r.slot===4).progress,0);
    console.log('Keyboard food/water and room plan accepted.');
    await advance(page,18000);
    await tool('observe').click(); await page.locator('#ant-game [data-action=pause]').click();
    s=await state(page);
    assert.ok(s.rooms.find(r=>r.slot===4).progress>0,'workers physically excavate the planned room');
    const paused=s.time;
    await page.clock.runFor(3000);
    await page.locator('#ant-paths').check();
    assert.equal((await state(page)).time,paused,'pause freezes the simulation');
    await page.locator('#ant-game [data-action=queen]').click();
    assert.equal(await page.locator('#ant-zoom').innerText(),'200 %');
    assert.equal(await page.locator('#ant-detail-title').innerText(),'Komora kráľovnej');
    await page.locator('#ant-game [data-action=center]').click();
    const sandbox=sandboxSnapshot(await state(page));
    console.log('Sandbox excavation, pause and queen inspection passed.');

    let finishCalls=0,verified;
    await page.route('**/api/colony/runs', route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,id:'browser-test-run-12345',seed:123,expiresAt:Date.now()+86400000})}));
    await page.route('**/api/colony/runs/*/finish',async route=>{
      finishCalls++;
      verified=replay(123,route.request().postDataJSON().actions);
      const body=finishCalls===1?{ok:false,code:'RUN_TOO_EARLY',remainingMs:1000,error:'Počkaj.'}:finishCalls===2?{ok:false,error:'Dočasná chyba uloženia.'}:finishCalls===4?{ok:false,code:'RUN_FINISHED',error:'Už uložené.'}:{ok:true,score:verified.score,improved:true};
      await route.fulfill({status:finishCalls===1?425:finishCalls===2?503:finishCalls===4?409:200,contentType:'application/json',body:JSON.stringify(body)});
    });
    await page.locator('#ant-game [data-mode=daily]').click();
    assert.equal(await page.locator('#ant-speed').isDisabled(),true);
    await page.locator('#ant-game [data-action=start-daily]').click();
    await page.locator('#ant-daily-intro').waitFor({state:'hidden'});
    await tool('food').click(); await canvas.focus(); await canvas.press('ArrowLeft'); await canvas.press('Enter');
    await page.locator('#ant-game [data-mode=sandbox]').click();
    assert.deepEqual(sandboxSnapshot(await state(page)),sandbox,'daily start and player actions preserve the saved sandbox');
    await page.locator('#ant-game [data-mode=daily]').click();
    // Exercise the production resume path near the end of a run. Restoration
    // replays every prior tick; the last second still runs through the real RAF
    // controller. The engine suite independently checks all1800 browser ticks.
    await page.evaluate(()=>{const saved=JSON.parse(localStorage.getItem('fob_colony_run_v1'));saved.frame=1790;sessionStorage.setItem('colony_test_checkpoint',JSON.stringify(saved));});
    await page.reload();
    await page.locator('#ant-game [data-mode=daily]').click();
    await advance(page,2200);
    console.log('Daily completion state:',await page.locator('#ant-title').innerText(),await page.locator('#ant-day').innerText(),'finish calls',finishCalls);
    await page.locator('#ant-result-message').filter({hasText:'Uloženie skús'}).waitFor();
    assert.equal(finishCalls,1);
    assert.equal(await tool('food').isDisabled(),true);
    assert.equal(await page.locator('#ant-game [data-action=pause]').isDisabled(),true);
    assert.equal(await page.locator('#ant-speed').isDisabled(),true);
    await page.locator('#ant-game [data-action=submit]').click();
    await page.locator('#ant-result-message').filter({hasText:'Dočasná chyba'}).waitFor();
    assert.equal(await page.locator('#ant-game [data-action=submit]').isEnabled(),true,'failed submission remains retryable');
    await page.locator('#ant-game [data-action=submit]').click();
    await page.locator('#ant-result-message').filter({hasText:'Uložené:'}).waitFor();
    assert.equal(finishCalls,3);
    assert.ok(verified.score>0);
    assert.equal(await page.locator('#ant-game [data-action=submit]').isDisabled(),true);
    await page.locator('#ant-game [data-mode=sandbox]').click();
    assert.deepEqual(sandboxSnapshot(await state(page)),sandbox);
    await page.evaluate(()=>{const saved=JSON.parse(localStorage.getItem('fob_colony_run_v1'));saved.submitted=false;sessionStorage.setItem('colony_test_checkpoint',JSON.stringify(saved));});
    await page.reload();await page.locator('#ant-game [data-mode=daily]').click();
    await page.locator('#ant-result-message').filter({hasText:'už uložený'}).waitFor();
    assert.equal(finishCalls,4,'lost-response retry recovers an already-saved result');
    assert.equal(await page.locator('#ant-game [data-action=submit]').isDisabled(),true);
    await page.evaluate(()=>{const saved=JSON.parse(localStorage.getItem('fob_colony_run_v1'));saved.submitted=false;saved.run.expiresAt=Date.now()-1;sessionStorage.setItem('colony_test_checkpoint',JSON.stringify(saved));});
    await page.reload();await page.locator('#ant-game [data-mode=daily]').click();
    assert.equal(await page.locator('#ant-daily-intro').isVisible(),true,'expired run returns to the start screen');
    await page.close();

    for(const width of[320,390]) {
      const mobile=await browser.newPage({viewport:{width,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
      mobile.on('pageerror',e=>errors.push(e.message));
      await mobile.clock.install();await mobile.clock.pauseAt(new Date());
      await mobile.goto(base+'/?colony=1');
      await mobile.locator('#ant-game').waitFor({state:'visible'});
      await mobile.locator('input[name=jedlo]').first().waitFor();
      await mobile.evaluate(()=>ColonyRenderer.ready);
      const bounds=()=>mobile.locator('#ant-game').evaluate(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return{x:r.x,y:r.y,right:r.right,width:r.width,viewport:innerWidth,position:s.position,inset:s.inset};});
      const initialBounds=await bounds();
      await mobile.clock.runFor(64);
      const stableBounds=await bounds();
      console.log('Mobile'+width+' dialog bounds:',{initial:initialBounds,stable:stableBounds});
      assert.equal(stableBounds.viewport,width,'underlying page does not enlarge the mobile layout viewport');
      assert.ok(stableBounds.x>=-.5&&stableBounds.right<=stableBounds.viewport+.5,'modal stays within the '+width+'px viewport');
      assert.equal(await mobile.locator('#ant-game').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,'dialog fits '+width+'px');
      assert.equal(await mobile.locator('.ant-sidebar').isVisible(),false);
      await mobile.screenshot({path:path.join(output,'natural-mobile-'+width+'.png')});
      await mobile.locator('#ant-game [data-tool=food]').tap();
      await mobile.locator('#ant-canvas').focus();
      await mobile.locator('#ant-canvas').press('Enter');
      assert.ok((await state(mobile)).foods.some(f=>f.x===480),'touch tool plus keyboard placement');
      await mobile.locator('#ant-game [data-action=scoreboard]').tap();
      assert.equal(await mobile.locator('.ant-sidebar').isVisible(),true);
      assert.equal(await mobile.locator('#ant-game [data-action=scoreboard]').getAttribute('aria-expanded'),'true');
      assert.equal(await mobile.locator('#ant-game').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,'expanded mobile scoreboard fits');
      await mobile.locator('#ant-game [data-action=close]').tap();
      assert.equal(await mobile.locator('#ant-game').isVisible(),false);
      assert.equal(await mobile.evaluate(()=>document.body.classList.contains('colony-open')),false);
      await mobile.close();
    }
    assert.deepEqual(errors,[]);
    console.log('PASS: food/water keyboard input, excavation, queen inspection, pause, sandbox isolation, daily completion/replay-verified submission retries, mobile320/390 and reduced motion.');
  } finally {
    await Promise.race([browser.close(),new Promise(resolve=>setTimeout(resolve,2000))]);
  }
})().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
