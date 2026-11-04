(function(root){
  'use strict';
  const engine=typeof module!=='undefined'&&module.exports?require('./sylex-engine'):root.SylexTD;
  const {Game,slots,types,targeting}=engine;
  const STEP=1/30,MAX_STEPS=54000,MAX_ACTIONS=1500;
  const KEYS=['t','action','slot','type','mode','spec'];
  const NEEDS={build:['slot','type'],upgrade:['slot'],sell:['slot'],target:['slot','mode'],specialize:['slot','spec'],call:[],drone:[]};
  function result(game){const waves=Math.max(0,game.wave-(game.state==='ready'||game.state==='won'?0:1));return {score:game.points+waves*100,kills:game.kills,waves};}
  function validate(a,previous,steps){
    if(!a||typeof a!=='object'||Array.isArray(a)||Object.keys(a).some(k=>!KEYS.includes(k))||!Number.isInteger(a.t)||a.t<previous||a.t>steps||!Object.hasOwn(NEEDS,a.action))throw Error('Neplatná akcia.');
    const needs=NEEDS[a.action];if(Object.keys(a).some(k=>k!=='t'&&k!=='action'&&!needs.includes(k)))throw Error('Neplatná akcia.');
    if(needs.includes('slot')&&(!Number.isInteger(a.slot)||a.slot<0||a.slot>=slots.length))throw Error('Neplatné miesto.');
    if(needs.includes('type')&&!Object.hasOwn(types,a.type))throw Error('Neplatná veža.');
    if(needs.includes('mode')&&!Object.hasOwn(targeting,a.mode))throw Error('Neplatné cielenie.');
    if(needs.includes('spec')&&typeof a.spec!=='string')throw Error('Neplatná špecializácia.');
  }
  function replay(actions,steps,seed=0){
    if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw Error('Neplatný záznam hry.');
    if(!Array.isArray(actions)||actions.length>MAX_ACTIONS||!Number.isInteger(steps)||steps<0||steps>MAX_STEPS)throw Error('Neplatný záznam hry.');
    let previous=0;for(const a of actions){validate(a,previous,steps);previous=a.t;}
    const game=new Game({automatic:true,seed});let index=0;
    for(let t=0;t<=steps;t++){while(index<actions.length&&actions[index].t===t){if(!game.apply(actions[index++]))throw Error('Záznam obsahuje nepovolenú akciu.');}if(t<steps)game.tick(STEP);}
    if(!game.wave)throw Error('Najprv odohraj aspoň jednu vlnu.');return result(game);
  }
  const api={STEP,MAX_STEPS,MAX_ACTIONS,RULES:engine.RULES,result,replay};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SylexScore=api;
})(typeof window!=='undefined'?window:globalThis);
