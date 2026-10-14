"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { createAuthOutboxWorker, nextAttempt, AuthOutboxWorkerError } = require("./authOutboxWorker");
const { createAuthOutboxCrypto } = require("./authOutboxCrypto");
const NOW = "2026-10-14T17:00:00.123456Z";
const id = n => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
const cfg = () => ({ activeKeyId: "aes1", keys: [{ keyId: "aes1", secret: Buffer.alloc(32, 9) }] });
function micros(t) { return BigInt(Date.parse(t)) * 1000n + BigInt(t.slice(23, 26)); }
function stamp(t) { return new Date(Number(t / 1000n)).toISOString().slice(0,20) + String(t % 1000000n).padStart(6,"0") + "Z"; }
function clone(v) {
  if (Buffer.isBuffer(v)) return Buffer.from(v);
  if (Array.isArray(v)) return v.map(clone);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,clone(x)]));
  return v;
}
function deferred() { let resolve; const promise = new Promise(r=>{resolve=r;}); return { promise, resolve }; }
// Modelo transacional deliberado: locks SKIP LOCKED simulados, sem PostgreSQL/SMTP.
// Invariantes de estados sao verificadas independentemente das queries do worker.
function fixture(purpose="recuperacao") {
  let now = micros(NOW), failure = null;
  const token = Buffer.alloc(32,7).toString("base64url");
  const user = {id:7,email:"synthetic@example.invalid",auth_version:2,email_version:3,excluido:false,confirmado:purpose!=="confirmacao",cadastro_pendente:false};
  const destination=purpose==="alteracao" ? "candidate@example.invalid" : user.email;
  const challenge={id:id(1),usuario_id:7,finalidade:purpose,token_hash:crypto.createHash("sha256").update(token).digest(),auth_version_esperada:2,email_version_esperada:3,
    email_candidato:destination,expira_em:stamp(now+(purpose==="recuperacao"?1800000000n:86400000000n)),consumida_em:null,invalidada_em:null};
  const encrypted=createAuthOutboxCrypto(cfg()).cifrar({mensagemId:id(1),desafioId:id(1),finalidade:purpose,emailDestino:destination},Buffer.from(JSON.stringify({v:1,token})));
  let state={id:id(1),confirmacao_id:purpose==="recuperacao"?null:id(1),recuperacao_id:purpose==="recuperacao"?id(1):null,email_destino:destination,
    conteudo_cifrado:encrypted.conteudoCifrado,nonce:encrypted.nonce,auth_tag:encrypted.authTag,key_id:encrypted.keyId,
    criada_em:NOW,proxima_tentativa_em:NOW,ultima_tentativa_em:null,status:"pending",tentativas:0,lease_id:null,lease_adquirida_em:null,lease_expira_em:null,
    finalizada_em:null,ultimo_erro_codigo:null,ultimo_erro_smtp_status:null};
  const locks=new Map(),calls=[],sent=[]; let serial=0,active=0;
  const f={user,challenge,calls,sent,token,get row(){return state;},get active(){return active;},onQuery:null,onSend:null,onBuild:null,
    advance(seconds){now+=BigInt(seconds)*1000000n;},now:()=>stamp(now),fail(tag){failure=tag;}};
  function invariants(old,r) {
    assert.ok(r.tentativas>=old.tentativas);
    assert.equal(r.ultima_tentativa_em===null,r.tentativas===0);
    for(const k of ["id","confirmacao_id","recuperacao_id","email_destino","criada_em"]) assert.deepEqual(r[k],old[k]);
    if(r.status==="processing") {
      assert.ok(r.tentativas>0); assert.equal(r.proxima_tentativa_em,null); assert.equal(r.finalizada_em,null);
      assert.ok(r.lease_id); assert.equal(r.lease_adquirida_em,r.ultima_tentativa_em);
      assert.ok(micros(r.lease_expira_em)>micros(r.lease_adquirida_em));
    } else { for(const k of ["lease_id","lease_adquirida_em","lease_expira_em"]) assert.equal(r[k],null); }
    if(r.status==="pending") {assert.ok(r.proxima_tentativa_em);assert.equal(r.finalizada_em,null);}
    if(["sent","failed"].includes(r.status)) {
      assert.ok(r.finalizada_em);assert.equal(r.proxima_tentativa_em,null);
      for(const k of ["conteudo_cifrado","nonce","auth_tag","key_id"]) assert.equal(r[k],null);
      if(r.status==="sent"){assert.equal(r.ultimo_erro_codigo,null);assert.ok(r.tentativas>0);}
      else assert.ok(r.ultimo_erro_codigo);
    }
  }
  f.db={async tx(action){
    const tx=++serial,owned=[],order=[];let staged=null;active++;
    function take(k){if(locks.has(k)&&locks.get(k)!==tx)return false;locks.set(k,tx);owned.push(k);return true;}
    function result(rows=[],count=rows.length){return {rows:clone(rows),rowCount:count};}
    const raw={async query(sql,v=[]){
      const tag=sql.match(/worker:(\w+)/)?.[1]||sql;calls.push({tag,sql});
      if(f.onQuery) await f.onQuery(tag,v);
      if(failure===tag){failure=null;throw Object.assign(new Error("SYNTHETIC_SECRET token@example.invalid"),{detail:"SYNTHETIC_SECRET"});}
      if(sql.startsWith("SET "))return result();
      const row=staged||state;
      if(tag==="candidates")return result((row.status==="pending"&&micros(row.proxima_tentativa_em)<=now || row.status==="processing"&&micros(row.lease_expira_em)<=now)?[{id:row.id,usuario_id:7}]:[]);
      if(tag==="user"){order.push("user");return result(take("user")?[user]:[]);}
      if(tag==="reference")return result([{confirmacao_id:row.confirmacao_id,recuperacao_id:row.recuperacao_id}]);
      if(tag==="challenge"){assert.equal(order[0],"user");order.push("challenge");return result(take("challenge")?[challenge]:[]);}
      if(tag==="message"){assert.deepEqual(order,["user","challenge"]);order.push("message");return result(take("message")?[row]:[]);}
      if(tag==="clock")return result([{instante:stamp(now)}]);
      if(tag==="claim"){
        staged={...clone(row),status:"processing",tentativas:row.tentativas+1,ultima_tentativa_em:v[1],proxima_tentativa_em:null,
          lease_id:v[2],lease_adquirida_em:v[1],lease_expira_em:stamp(micros(v[1])+180000000n),
          ultimo_erro_codigo:row.status==="processing"?"LEASE_EXPIRED":row.ultimo_erro_codigo,
          ultimo_erro_smtp_status:row.status==="processing"?null:row.ultimo_erro_smtp_status};
        return result([{id:row.id}]);
      }
      if(tag==="settle"){
        if(row.status!==v[7]||row.lease_id!==v[1]||v[8]&&micros(row.lease_expira_em)<=now)return result();
        const terminal=["sent","failed"].includes(v[2]);
        staged={...clone(row),status:v[2],proxima_tentativa_em:v[3],finalizada_em:terminal?v[4]:null,
          lease_id:null,lease_adquirida_em:null,lease_expira_em:null,ultimo_erro_codigo:v[5],ultimo_erro_smtp_status:v[6]};
        if(terminal)for(const k of ["conteudo_cifrado","nonce","auth_tag","key_id"])staged[k]=null;
        return result([{id:row.id}]);
      }
      throw new Error("UNMODELLED_QUERY");
    }};
    try {
      const output=await action({raw,client:raw,query:()=>assert.fail("Sensitive queries must bypass facade")});
      if(failure==="commit"){failure=null;throw new Error("SYNTHETIC_SECRET");}
      if(staged){invariants(state,staged);state=staged;}
      return output;
    } finally {for(const key of owned)if(locks.get(key)===tx)locks.delete(key);active--;}
  }};
  f.transport={maxDurationMs:120000,ready:()=>true,cancel:async()=>{},async send(mail){
    assert.equal(locks.has("message"),false,"No transaction held over SMTP");
    assert.equal(state.status,"processing","Claim must already be durable");
    sent.push(clone(mail));return f.onSend?f.onSend(mail):{kind:"accepted"};
  }};
  f.consumer={ready:true,buildMail:args=>{f.onBuild?.(args);return {subject:"Teste V3",text:"https://v3.example.invalid/consume#token="+args.token};}};
  f.worker=(overrides={})=>createAuthOutboxWorker({db:f.db,enabled:true,cryptoConfig:cfg(),transport:f.transport,consumer:f.consumer,...overrides});
  return f;
}

for(const purpose of ["confirmacao","alteracao","recuperacao"]) {
  test("real crypto, immutable recipient, terminal cleanup / "+purpose,async()=>{
    const f=fixture(purpose);assert.deepEqual(await f.worker().runOnce(),{status:"sent"});
    assert.equal(f.sent.length,1);assert.equal(f.sent[0].to,f.row.email_destino);assert.ok(f.sent[0].text.includes(f.token));
    assert.equal(f.row.tentativas,1);assert.equal(f.row.ultima_tentativa_em,NOW);
  });
  test("six absolute attempts, including initial / "+purpose,async()=>{
    const f=fixture(purpose);f.onSend=()=>({kind:"temporary",smtpStatus:451});
    const times=purpose==="recuperacao"?[0,1,3,7,15,25]:[0,1,5,15,60,180];
    let previous=0;
    for(let i=0;i<times.length;i++){
      f.advance((times[i]-previous)*60);previous=times[i];
      assert.equal((await f.worker().runOnce()).status,i===5?"failed":"pending");
      assert.equal(f.row.tentativas,i+1);
      if(i<5)assert.equal(f.row.proxima_tentativa_em,stamp(micros(NOW)+BigInt(times[i+1])*60000000n));
    }
    assert.equal(f.sent.length,6);assert.equal(f.row.ultimo_erro_codigo,"RETRY_EXHAUSTED");
  });
}
for(const flag of [undefined,false,"true",1])test("disabled gate / "+String(flag),async()=>{
  const f=fixture();assert.equal((await f.worker({enabled:flag}).runOnce()).status,"disabled");assert.equal(f.calls.length,0);assert.equal(f.sent.length,0);
});
for(const override of [{dryRun:true},{consumer:null},{consumer:{ready:true}},{cryptoConfig:{}},{transport:{}}])test("inactive configuration has no effects / "+Object.keys(override)[0]+JSON.stringify(override),async()=>{
 const f=fixture();assert.notEqual((await f.worker(override).runOnce()).status,"sent");assert.equal(f.calls.length,0);assert.equal(f.sent.length,0);assert.equal(f.row.tentativas,0);
});
test("exclusive concurrent claim, followers skip current processing",async()=>{
 const f=fixture(),entered=deferred(),finish=deferred();f.onSend=async()=>{entered.resolve();await finish.promise;return {kind:"accepted"};};
 const first=f.worker().runOnce();await entered.promise;
 assert.deepEqual(await Promise.all([f.worker().runOnce(),f.worker().runOnce()]),[{status:"idle"},{status:"idle"}]);finish.resolve();await first;assert.equal(f.sent.length,1);
});
test("uncommitted claim is invisible; SKIP LOCKED follows user-first order",async()=>{
 const f=fixture(),entered=deferred(),release=deferred();let block=true;
 f.onQuery=async tag=>{if(tag==="claim"&&block){block=false;entered.resolve();await release.promise;}};
 const first=f.worker().runOnce();await entered.promise;assert.equal(f.row.status,"pending");assert.equal(f.sent.length,0);
 assert.equal((await f.worker().runOnce()).status,"idle");release.resolve();await first;assert.equal(f.sent.length,1);
});
test("late SMTP result cannot ack after reclaim; UUID changes",async()=>{
 const f=fixture(),entered=deferred(),finish=deferred();let sends=0;
 f.onSend=async()=>{if(++sends===1){entered.resolve();await finish.promise;}return {kind:"accepted"};};
 const old=f.worker().runOnce();await entered.promise;const oldLease=f.row.lease_id;
 f.advance(181);assert.equal((await f.worker().runOnce()).status,"sent");assert.equal(f.row.tentativas,2);
 const claims=f.calls.filter(c=>c.tag==="claim");assert.equal(claims.length,2);
 finish.resolve();assert.equal((await old).status,"stale");assert.equal(f.row.status,"sent");assert.ok(oldLease);
});
test("ack at exact lease expiry rejected",async()=>{
 const f=fixture();f.onSend=()=>{f.advance(180);return {kind:"accepted"};};
 assert.equal((await f.worker().runOnce()).status,"stale");assert.equal(f.row.status,"processing");
});
test("crash before SMTP is reclaimed after restart; abandoned possession consumes attempt",async()=>{
 const f=fixture();f.onBuild=()=>f.fail("user");
 await assert.rejects(f.worker().runOnce(),AuthOutboxWorkerError);assert.equal(f.row.tentativas,1);assert.equal(f.sent.length,0);
 const lease=f.row.lease_id;f.onBuild=null;assert.equal((await f.worker().runOnce()).status,"idle");
 f.advance(181);let reclaimed;f.onSend=()=>{reclaimed=f.row.lease_id;return {kind:"temporary",smtpStatus:450};};
 assert.equal((await f.worker().runOnce()).status,"pending");assert.notEqual(reclaimed,lease);assert.equal(f.row.tentativas,2);
 assert.equal(f.row.proxima_tentativa_em,stamp(micros(NOW)+7n*60000000n));
});
test("crash after SMTP/failed result persistence leaves recoverable processing",async()=>{
 const f=fixture();f.onSend=()=>{f.fail("user");return {kind:"accepted"};};
 await assert.rejects(f.worker().runOnce(),AuthOutboxWorkerError);assert.equal(f.row.status,"processing");assert.equal(f.sent.length,1);
 f.onSend=null;f.advance(181);assert.equal((await f.worker().runOnce()).status,"sent");assert.equal(f.sent.length,2);
});
test("delayed retry skips expired slots; no burst",async()=>{
 const f=fixture();f.advance(4*60);f.onSend=()=>({kind:"temporary",smtpStatus:421});
 assert.equal((await f.worker().runOnce()).status,"pending");assert.equal(f.row.proxima_tentativa_em,stamp(micros(NOW)+7n*60000000n));
 assert.equal((await f.worker().runOnce()).status,"idle");assert.equal(f.sent.length,1);
});
for(const kind of ["temporary","indeterminate","dry-run","bogus"])test("uncertain/non-success outcome never sent / "+kind,async()=>{
 const f=fixture();f.onSend=()=>({kind,smtpStatus:450,response:"SYNTHETIC_SECRET"});
 assert.equal((await f.worker().runOnce()).status,"pending");assert.equal(f.row.ultimo_erro_codigo,kind==="temporary"?"SMTP_TRANSIENT":"INTERNAL_FAILURE");
});
test("transport throws: indeterminate sanitized and retryable",async()=>{const f=fixture();f.onSend=()=>{throw new Error("SYNTHETIC_SECRET");};assert.equal((await f.worker().runOnce()).status,"pending");});
test("permanent failure immediately terminal and sanitized",async()=>{const f=fixture();f.onSend=()=>({kind:"permanent",smtpStatus:550,response:"SECRET"});assert.equal((await f.worker().runOnce()).status,"failed");assert.equal(f.row.ultimo_erro_codigo,"SMTP_PERMANENT");assert.equal(f.row.ultimo_erro_smtp_status,550);});
for(const [name,change] of [
 ["expired",f=>f.challenge.expira_em=f.now()], ["consumed",f=>f.challenge.consumida_em=NOW], ["invalidated",f=>f.challenge.invalidada_em=NOW],
 ["deleted",f=>f.user.excluido=true], ["pending signup",f=>f.user.cadastro_pendente=true], ["version",f=>f.user.auth_version++],
 ["unconfirmed recovery",f=>f.user.confirmado=false], ["recipient changed",f=>f.user.email="changed@example.invalid"],
 ["purpose inconsistent",f=>f.challenge.finalidade="confirmacao"], ["identity inconsistent",f=>f.challenge.id=id(2)]
])test("invalid challenge never emits / "+name,async()=>{const f=fixture();change(f);assert.equal((await f.worker().runOnce()).status,"failed");assert.equal(f.row.ultimo_erro_codigo,"CHALLENGE_INVALID");assert.equal(f.sent.length,0);assert.equal(f.row.tentativas,0);});
for(const purpose of ["confirmacao","alteracao","recuperacao"])test("version change between claim and SMTP / "+purpose,async()=>{
 const f=fixture(purpose);f.onBuild=()=>{if(purpose==="recuperacao")f.user.auth_version++;else f.user.email_version++;};
 assert.equal((await f.worker().runOnce()).status,"failed");assert.equal(f.row.ultimo_erro_codigo,"CHALLENGE_INVALID");assert.equal(f.sent.length,0);
});
for(const mutate of [f=>f.row.auth_tag[0]^=1,f=>f.row.nonce[0]^=1,f=>f.row.conteudo_cifrado[1]^=1,f=>f.row.key_id="missing",f=>f.challenge.token_hash[0]^=1])test("cryptographic authentication failure clears terminal envelope",async()=>{
 const f=fixture();mutate(f);assert.equal((await f.worker().runOnce()).status,"failed");assert.equal(f.row.ultimo_erro_codigo,"CRYPTO_FAILURE");assert.equal(f.sent.length,0);
});
for(const point of ["candidates","user","reference","challenge","message","clock","claim"])test("transactional failure rolls back / "+point,async()=>{
 const f=fixture();const before=clone(f.row);f.fail(point);await assert.rejects(f.worker().runOnce(),e=>e.code==="AUTH_OUTBOX_WORKER_FAILURE"&&!e.message.includes("SYNTHETIC"));assert.deepEqual(f.row,before);assert.equal(f.sent.length,0);
});
test("commit failure prevents SMTP and rolls back claim",async()=>{const f=fixture();f.onQuery=tag=>{if(tag==="claim")f.fail("commit");};const before=clone(f.row);await assert.rejects(f.worker().runOnce(),AuthOutboxWorkerError);assert.deepEqual(f.row,before);assert.equal(f.sent.length,0);});
test("ack failure rolls back terminal cleanup",async()=>{const f=fixture();f.onSend=()=>{f.fail("settle");return {kind:"accepted"};};await assert.rejects(f.worker().runOnce(),AuthOutboxWorkerError);assert.equal(f.row.status,"processing");assert.ok(f.row.conteudo_cifrado);});
test("expiry exactly during ack update rejects stale fencing",async()=>{const f=fixture();f.onQuery=tag=>{if(tag==="settle")f.advance(180);};assert.equal((await f.worker().runOnce()).status,"stale");assert.equal(f.row.status,"processing");});
test("pre-SMTP margin prevents starting transport after long build",async()=>{const f=fixture();f.onBuild=()=>f.advance(56);assert.equal((await f.worker().runOnce()).status,"pending");assert.equal(f.sent.length,0);});
test("expired future slots fail without scheduling beyond challenge TTL",async()=>{const f=fixture();f.advance(26*60);f.onSend=()=>({kind:"temporary"});assert.equal((await f.worker().runOnce()).status,"failed");assert.equal(f.row.ultimo_erro_codigo,"RETRY_EXHAUSTED");assert.equal(f.sent.length,1);});
test("crashes cannot create unlimited sends after six claims",async()=>{const f=fixture();f.row.status="processing";f.row.tentativas=6;f.row.ultima_tentativa_em=NOW;f.row.proxima_tentativa_em=null;f.row.lease_id=id(9);f.row.lease_adquirida_em=NOW;f.row.lease_expira_em=stamp(micros(NOW)+180000000n);f.advance(181);assert.equal((await f.worker().runOnce()).status,"failed");assert.equal(f.row.tentativas,6);assert.equal(f.sent.length,0);});
test("stop prevents further claims and cancels transport",async()=>{const f=fixture();let cancel=0;f.transport.cancel=async()=>cancel++;const w=f.worker();await w.stop();assert.equal(cancel,1);assert.equal((await w.runOnce()).status,"disabled");assert.equal(f.calls.length,0);});
test("scheduling preserves microseconds and excludes exact TTL boundary",()=>{
 const row={finalidade:"recuperacao",tentativas:1,criada_em:NOW,expira_em:stamp(micros(NOW)+60000000n)};assert.equal(nextAttempt(row,NOW),null);
 row.expira_em=stamp(micros(NOW)+60000001n);assert.equal(nextAttempt(row,NOW),stamp(micros(NOW)+60000000n));
 assert.equal(nextAttempt({...row,tentativas:6},NOW),null);
});

test("challenge invalidated between claim and transport cannot send",async()=>{
 const f=fixture();f.onBuild=()=>f.challenge.invalidada_em=f.now();assert.equal((await f.worker().runOnce()).status,"failed");assert.equal(f.sent.length,0);
});
test("readiness exception sanitized before claim",async()=>{
 const f=fixture();f.transport.ready=()=>{throw new Error("SYNTHETIC_SECRET");};assert.equal((await f.worker().runOnce()).status,"blocked-config");assert.equal(f.calls.length,0);
});
test("SQL uses skip for claim, waits in same lock order for ack, always fenced",async()=>{
 const f=fixture();await f.worker().runOnce();
 const reads=f.calls.filter(c=>["user","challenge","message"].includes(c.tag));
 assert.ok(reads.slice(0,3).every(c=>c.sql.includes("FOR UPDATE SKIP LOCKED")));
 assert.ok(reads.slice(3).every(c=>c.sql.includes("FOR UPDATE")&&!c.sql.includes("SKIP LOCKED")));
 const ack=f.calls.find(c=>c.tag==="settle");assert.match(ack.sql,/lease_id IS NOT DISTINCT FROM/);assert.match(ack.sql,/lease_expira_em > clock_timestamp/);
});

for(const value of ["TRUE","true","sim","FALSE","false","0",0,1,null,{},[]])test("programmatic ambiguous dryRun cannot touch outbox / "+String(value),async()=>{
 const f=fixture();const before=clone(f.row);assert.equal((await f.worker({dryRun:value}).runOnce()).status,"blocked-config");
 assert.deepEqual(f.row,before);assert.equal(f.calls.length,0);assert.equal(f.sent.length,0);
});
