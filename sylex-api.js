'use strict';
const express=require('express');
const crypto=require('node:crypto');
const {replay}=require('./public/sylex-score');
const RULES=2;
const TTL=2*60*60*1000;
class MemorySylexStore{
 constructor(){this.runs=new Map();this.results=new Map();}
 ready(){return true;}
 async createRun(run){this.runs.set(run.id,structuredClone(run));}
 async getRun(id){return this.runs.get(id);}
 async getResult(id){return this.results.get(id);}
 async saveResult(row){if(!this.results.has(row.runId))this.results.set(row.runId,structuredClone(row));return this.results.get(row.runId);}
 async leaderboard(){const best=new Map();for(const r of this.results.values())if(r.rules===RULES)if(!best.has(r.player)||r.score>best.get(r.player).score)best.set(r.player,r);return [...best.values()].sort((a,b)=>b.score-a.score||a.createdAt-b.createdAt).slice(0,20);}
}
function createMongoSylexStore(mongoose){
 const runs=new mongoose.Schema({id:{type:String,unique:true},player:String,name:String,rules:Number,startedAt:Number,expiresAt:{type:Date,index:{expires:0}}});
 const scores=new mongoose.Schema({runId:{type:String,unique:true},player:{type:String,index:true},name:String,rules:Number,score:Number,kills:Number,waves:Number,createdAt:Number});scores.index({score:-1,createdAt:1});
 const Run=mongoose.models.SylexRun||mongoose.model('SylexRun',runs),Score=mongoose.models.SylexResult||mongoose.model('SylexResult',scores);
 return {ready:()=>mongoose.connection.readyState===1,createRun:r=>Run.create(r),getRun:id=>Run.findOne({id}).lean(),getResult:runId=>Score.findOne({runId}).lean(),async saveResult(row){try{await Score.updateOne({runId:row.runId},{$setOnInsert:row},{upsert:true});}catch(e){if(e.code!==11000)throw e;}return Score.findOne({runId:row.runId}).lean();},leaderboard:()=>Score.aggregate([{$match:{rules:RULES}},{$sort:{score:-1,createdAt:1}},{$group:{_id:'$player',row:{$first:'$$ROOT'}}},{$replaceRoot:{newRoot:'$row'}},{$sort:{score:-1,createdAt:1}},{$limit:20}])};
}
function createSylexRouter({store,now=Date.now,rateLimits=true}){
 const router=express.Router(),buckets=new Map();router.use(express.json({limit:'64kb'}));
 const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
 router.use((req,res,next)=>{res.set('Cache-Control','no-store');if(!store.ready())return res.status(503).json({ok:false,error:'Rebríček je dočasne nedostupný. Skús obnoviť neskôr.'});
  if(req.method==='POST'){if(!req.is('application/json'))return res.status(415).json({ok:false,error:'Očakáva sa JSON.'});if(req.get('origin')){try{if(new URL(req.get('origin')).host!==req.get('host'))throw Error();}catch{return res.status(403).json({ok:false,error:'Požiadavka musí pochádzať z tejto stránky.'});}}}
  const match=(req.headers.cookie||'').match(/(?:^|;\s*)sylex_player=([a-f0-9]{64})(?:;|$)/);req.sylexPlayer=match?.[1]||null;
  const time=now();for(const [k,v]of buckets)if(v.until<time)buckets.delete(k);
  function allow(key,maximum){if(!rateLimits)return true;let bucket=buckets.get(key);if(!bucket){if(buckets.size>10000)return false;buckets.set(key,bucket={until:time+60000,count:0});}return ++bucket.count<=maximum;}
  // A broad ingress/IP cap tolerates shared office networks and reverse proxies.
  // The tighter limit belongs to the browser identity, never a shared proxy IP.
  const ip=req.ip||'unknown',isPost=req.method==='POST';
  if(!allow('ip:'+ip+':'+req.method,isPost?1200:3000)||(req.sylexPlayer&&!allow('player:'+req.sylexPlayer+':'+req.method,isPost?30:90)))return res.status(429).json({ok:false,error:'Príliš veľa požiadaviek. Chvíľu počkaj.'});
  next();});
 router.get('/',wrap(async(req,res)=>{const rows=await store.leaderboard();res.json({ok:true,rows:rows.map((r,i)=>({rank:i+1,name:r.name,score:r.score,kills:r.kills,waves:r.waves,isMe:r.player===req.sylexPlayer}))});}));
 router.post('/runs',wrap(async(req,res)=>{if(!req.body||typeof req.body.name!=='string'||Object.keys(req.body).some(k=>k!=='name'))return res.status(400).json({ok:false,error:'Zadaj prezývku.'});const name=req.body.name.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g,'').trim().slice(0,30);if(!name)return res.status(400).json({ok:false,error:'Zadaj prezývku.'});const player=req.sylexPlayer||crypto.randomBytes(32).toString('hex'),id=crypto.randomBytes(24).toString('hex');await store.createRun({id,player,name,rules:RULES,startedAt:now(),expiresAt:new Date(now()+TTL)});if(!req.sylexPlayer)res.cookie('sylex_player',player,{httpOnly:true,sameSite:'lax',secure:req.secure||process.env.NODE_ENV==='production',maxAge:365*86400000,path:'/api/sylex'});res.json({ok:true,id});}));
 router.post('/runs/:id/finish',wrap(async(req,res)=>{const {id}=req.params;if(!/^[a-f0-9]{48}$/.test(id))return res.status(400).json({ok:false,error:'Neplatná hra.'});const run=await store.getRun(id);if(!run||run.player!==req.sylexPlayer)return res.status(404).json({ok:false,error:'Hra sa nenašla.'});if(run.rules!==RULES)return res.status(409).json({ok:false,error:'Pravidlá hry sa zmenili. Obnov stránku a začni novú obranu.'});const previous=await store.getResult(id);if(previous)return res.json({ok:true,result:{score:previous.score,kills:previous.kills,waves:previous.waves}});if(+new Date(run.expiresAt)<now())return res.status(410).json({ok:false,error:'Platnosť hry vypršala. Začni novú hru.'});
  const body=req.body;if(!body||Object.keys(body).some(k=>!['actions','steps'].includes(k))||body.steps>(now()-run.startedAt)/1000*60+120)return res.status(400).json({ok:false,error:'Neplatný čas hry.'});let verified;try{verified=replay(body.actions,body.steps);}catch(e){return res.status(400).json({ok:false,error:e.message});}const saved=await store.saveResult({runId:id,rules:RULES,player:run.player,name:run.name,...verified,createdAt:now()});res.json({ok:true,result:{score:saved.score,kills:saved.kills,waves:saved.waves}});
 }));
 router.use((err,req,res,next)=>{if(res.headersSent)return next(err);const bad=err.type==='entity.too.large'||err instanceof SyntaxError;res.status(bad?400:503).json({ok:false,error:bad?'Neplatný záznam hry.':'Výsledok sa nepodarilo uložiť. Skús znova.'});});return router;
}
module.exports={createSylexRouter,createMongoSylexStore,MemorySylexStore};
