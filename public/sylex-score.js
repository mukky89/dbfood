(function(root){
  'use strict';
  const Game=typeof module!=='undefined'&&module.exports?require('./sylex-engine').Game:root.SylexTD.Game;
  const STEP=1/30,MAX_STEPS=54000,MAX_ACTIONS=1500;
  function result(game){const waves=Math.max(0,game.wave-(game.state==='ready'?0:1));return {score:game.kills*10+waves*100,kills:game.kills,waves};}
  function replay(actions,steps){
    if(!Array.isArray(actions)||actions.length>MAX_ACTIONS||!Number.isInteger(steps)||steps<0||steps>MAX_STEPS)throw Error('Neplatný záznam hry.');
    let previous=0;
    for(const a of actions){if(!a||typeof a!=='object'||Array.isArray(a)||Object.keys(a).some(k=>!['t','action','slot','type'].includes(k))||!Number.isInteger(a.t)||a.t<previous||a.t>steps||!['build','upgrade','wave'].includes(a.action))throw Error('Neplatná akcia.');if(a.action!=='wave'&&(!Number.isInteger(a.slot)||a.slot<0||a.slot>8))throw Error('Neplatné miesto.');if(a.action==='build'&&!['rapid','slow','pulse'].includes(a.type))throw Error('Neplatná veža.');previous=a.t;}
    const game=new Game();let index=0;
    for(let t=0;t<=steps;t++){while(index<actions.length&&actions[index].t===t){const a=actions[index++];const ok=a.action==='build'?game.build(a.slot,a.type):a.action==='upgrade'?game.upgrade(a.slot):game.start();if(!ok)throw Error('Záznam obsahuje nepovolenú akciu.');}if(t<steps)game.tick(STEP);}
    if(!game.wave)throw Error('Najprv odohraj aspoň jednu vlnu.');return result(game);
  }
  const api={STEP,MAX_STEPS,MAX_ACTIONS,result,replay};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SylexScore=api;
})(typeof window!=='undefined'?window:globalThis);
