"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {createAuthOutboxJob,cryptoConfigFromEnv,POLL_MS}=require("./authOutboxJob");
const ENABLED_ENV={AUTH_OUTBOX_WORKER_ENABLED:"true",AUTH_OUTBOX_WORKER_DRY_RUN:"false",EMAIL_ENABLED:"true",EMAIL_DRY_RUN:"false"};
function fixture(env={...ENABLED_ENV},extra={}){
 const calls=[],logs=[];let tick,run=async()=>calls.push("run");
 const worker={readiness:()=>"ready",runOnce:()=>run(),stop:async()=>calls.push("stop")};
 const job=createAuthOutboxJob({env,consumer:{ready:true,buildMail:()=>{}},createWorker:()=>{calls.push("factory");return worker;},log:x=>logs.push(x),
 timers:{setInterval(fn,ms){assert.equal(ms,30000);tick=fn;return {unref(){calls.push("unref");}};},clearInterval(){calls.push("clear");}},...extra});
 return {job,calls,logs,worker,env,tick:()=>tick?.(),setRun:fn=>run=fn};
}
for(const flag of [undefined,false,"false","0","NAO","não","No","OFF",0])test("disabled by default or recognized false / "+String(flag),async()=>{
 const f=fixture({...ENABLED_ENV,AUTH_OUTBOX_WORKER_ENABLED:flag});assert.equal(f.job.start().status,"disabled");await f.job.stop();assert.deepEqual(f.calls,[]);
});
test("dry-run creates no worker, claims, crypto or SMTP",async()=>{const f=fixture({...ENABLED_ENV,AUTH_OUTBOX_WORKER_DRY_RUN:"true"});assert.equal(f.job.start().status,"dry-run");await f.job.stop();assert.deepEqual(f.calls,[]);});
test("current backend cannot bypass missing V3 consumers via environment",async()=>{
 const f=fixture({...ENABLED_ENV,AUTH_V3_TOKENS_READY:"true"},{consumer:null});assert.equal(f.job.start().status,"blocked-consumer");await f.job.stop();assert.deepEqual(f.calls,[]);assert.deepEqual(f.logs,["AUTH_OUTBOX_V3_CONSUMER_UNAVAILABLE"]);
});
test("polling, duplicate start, stop and fresh restart",async()=>{
 const f=fixture();assert.equal(POLL_MS,30000);assert.equal(f.job.start().status,"running");assert.equal(f.job.start().status,"running");await f.tick();
 assert.equal(f.calls.filter(x=>x==="factory").length,1);await f.job.stop();assert.equal(f.calls.filter(x=>x==="stop").length,1);
 assert.equal(f.job.start().status,"running");await f.job.stop();assert.equal(f.calls.filter(x=>x==="factory").length,2);
});
test("poll does not overlap; shutdown cancels before waiting; restart fenced during stop",async()=>{
 const f=fixture();let release,entered;const waiting=new Promise(r=>release=r);const ready=new Promise(r=>entered=r);
 f.setRun(async()=>{f.calls.push("running");entered();await waiting;});f.job.start();await ready;
 f.tick();f.tick();assert.equal(f.calls.filter(x=>x==="running").length,1);
 const stopped=f.job.stop();assert.equal(f.job.start().status,"stopping");await Promise.resolve();assert.ok(f.calls.includes("stop"));release();await stopped;
});
test("job logs fixed code and never cause/token/URL",async()=>{
 const f=fixture();f.setRun(async()=>{throw Object.assign(new Error("SYNTHETIC_SECRET https://test.invalid/token"),{code:"SECRET"});});f.job.start();await f.tick();await f.job.stop();assert.deepEqual(f.logs,["AUTH_OUTBOX_WORKER_FAILURE"]);
});
test("incomplete config blocks before polling",async()=>{const f=fixture();f.worker.readiness=()=>"blocked-config";assert.equal(f.job.start().status,"blocked-config");await f.job.stop();assert.deepEqual(f.calls,["factory"]);});
test("bad factory sanitized",async()=>{const f=fixture(undefined,{createWorker:()=>{throw new Error("SECRET");}});assert.equal(f.job.start().status,"blocked-config");assert.deepEqual(f.logs,["AUTH_OUTBOX_CONFIG_INVALID"]);});
for(const keys of [undefined,"null","{}","[]","[{}]",'[{"secret":"invalid"}]'])test("key configuration fails closed / "+String(keys),()=>{
 if(keys==="[]") {assert.deepEqual(cryptoConfigFromEnv({AUTH_OUTBOX_CRYPTO_KEYS_JSON:keys}).keys,[]);return;}
 assert.throws(()=>cryptoConfigFromEnv({AUTH_OUTBOX_CRYPTO_KEYS_JSON:keys}));
});
test("explicit keyring uses base64 32-byte external keys",()=>{
 const config=cryptoConfigFromEnv({AUTH_OUTBOX_CRYPTO_ACTIVE_KEY_ID:"aes1",AUTH_OUTBOX_CRYPTO_KEYS_JSON:JSON.stringify([{keyId:"aes1",secret:Buffer.alloc(32,9).toString("base64")}])});
 assert.equal(config.activeKeyId,"aes1");assert.equal(config.keys[0].secret.length,32);
});
test("existing event and room jobs retained; HTTP shutdown awaits auth job before DB shutdown",()=>{
 const source=fs.readFileSync(path.join(__dirname,"../server.js"),"utf8");
 for(const name of ["iniciarLembreteEventoJob","iniciarConfirmacaoUsoSalaJob","pararLembreteEventoJob","pararConfirmacaoUsoSalaJob"])assert.ok(source.includes(name+"();"));
 assert.ok(source.indexOf("await authOutboxStopped;")<source.indexOf("await db.shutdown();"));
});

const TRUE_FLAGS=[true,1,"true","TRUE","True","1","sim","SIM","s","S","yes","YES","y","Y","on","ON"," true "];
const FALSE_FLAGS=[false,0,"false","FALSE","False","0","nao","NAO","não","NÃO","n","N","no","NO","off","OFF"," false "];
const INVALID_FLAGS=[""," ",null,"invalid","true,false","yes/no","1.0","00",2,-1,NaN,Infinity,{},[],new Boolean(false)];
for(const name of ["AUTH_OUTBOX_WORKER_DRY_RUN","EMAIL_DRY_RUN"]) {
 for(const value of TRUE_FLAGS)test("dry-run blocks factory/poll/outbox / "+name+" / "+String(value),async()=>{
  const f=fixture({...ENABLED_ENV,[name]:value});assert.equal(f.job.start().status,"dry-run");assert.equal(f.tick(),undefined);
  await f.job.stop();assert.deepEqual(f.calls,[]);assert.deepEqual(f.logs,[]);
 });
 for(const value of FALSE_FLAGS)test("recognized explicit false dry-run / "+name+" / "+String(value),async()=>{
  const f=fixture({...ENABLED_ENV,[name]:value});assert.equal(f.job.start().status,"running");await f.tick();await f.job.stop();assert.ok(f.calls.includes("run"));
 });
}
for(const name of ["AUTH_OUTBOX_WORKER_ENABLED","EMAIL_ENABLED"]) {
 for(const value of TRUE_FLAGS)test("recognized enable flag still needs consumer / "+name+" / "+String(value),async()=>{
  const f=fixture({...ENABLED_ENV,[name]:value},{consumer:null});assert.equal(f.job.start().status,"blocked-consumer");await f.job.stop();assert.deepEqual(f.calls,[]);
 });
 for(const value of FALSE_FLAGS)test("recognized false cannot start / "+name+" / "+String(value),async()=>{
  const f=fixture({...ENABLED_ENV,[name]:value});assert.equal(f.job.start().status,"disabled");await f.job.stop();assert.deepEqual(f.calls,[]);
 });
}
for(const name of Object.keys(ENABLED_ENV)) {
 for(const value of INVALID_FLAGS)test("invalid flag blocks all effects / "+name+" / "+String(value),async()=>{
  const f=fixture({...ENABLED_ENV,[name]:value});assert.equal(f.job.start().status,"blocked-config");await f.job.stop();assert.deepEqual(f.calls,[]);
 });
 test("absent flag stays safe / "+name,async()=>{
  const env={...ENABLED_ENV};delete env[name];const f=fixture(env);
  assert.equal(f.job.start().status,name.endsWith("DRY_RUN")?"dry-run":"disabled");await f.job.stop();assert.deepEqual(f.calls,[]);
 });
}
test("empty configuration never initializes worker",async()=>{const f=fixture({});assert.equal(f.job.start().status,"disabled");await f.job.stop();assert.deepEqual(f.calls,[]);});
test("poll rechecks dry-run and invalid flags before invoking worker",async()=>{
 const f=fixture();f.job.start();await f.tick();const count=f.calls.filter(x=>x==="run").length;
 f.env.EMAIL_DRY_RUN="SIM";assert.equal(f.tick(),null);assert.equal(f.calls.filter(x=>x==="run").length,count);
 f.env.EMAIL_DRY_RUN="false";f.env.AUTH_OUTBOX_WORKER_DRY_RUN="invalid";assert.equal(f.tick(),null);
 f.env.AUTH_OUTBOX_WORKER_DRY_RUN="OFF";await f.tick();assert.equal(f.calls.filter(x=>x==="run").length,count+1);await f.job.stop();
});
