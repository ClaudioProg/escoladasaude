"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { inspect } = require("node:util");
const { fixture, START, SID, TOKEN, stamp, micros } = require("./authRestrictedContext.fixture");
const { enabledValue, initializeRestrictedContext, RestrictedContextError } = require("./authRestrictedContextService");

for (const [value, expected] of [[undefined, false], ["false", false], ["true", true]])
test("explicit opt-in / " + String(value), () => assert.equal(enabledValue(value), expected));
for (const value of ["", "TRUE", "0", "1", "yes", " true ", null, true, false, 1, 0])
test("ambiguous activation fails closed / " + String(value), () => assert.throws(() => enabledValue(value), RestrictedContextError));

for (const [seconds, offset, permitted] of [[1799,999999n,true],[1800,0n,false],[1800,1n,false]])
test("strict idle boundary with microseconds / " + seconds + "/" + offset, async () => {
  const f = fixture(); f.at(seconds,offset);
  if (permitted) assert.equal((await f.access()).permitted,true);
  else await assert.rejects(f.access(), { code:"AUTH_RESTRICTED_INVALID" });
});
for (const [seconds, offset, permitted] of [[7199,999999n,true],[7200,0n,false],[7200,1n,false]])
for (const persistent of [false,true])
test("strict absolute boundary independent of remember-me / " + seconds + "/" + offset + "/" + persistent, async () => {
  const f=fixture();f.at(seconds,offset);
  f.state.session.manter_conectado=persistent;
  f.state.session.limite_absoluto_em=persistent?stamp(micros(START)+2592000000000n):null;
  f.state.context.ultimo_uso_em=stamp(micros(START)+6900000000n);
  f.state.context.expira_em=f.state.context.limite_absoluto_em;
  if(permitted) {
    const out=await f.access();assert.equal(out.absoluteExpiresAt,stamp(micros(START)+7200000000n));
    assert.equal(out.expiresAt,out.absoluteExpiresAt);
  } else await assert.rejects(f.access(),{code:"AUTH_RESTRICTED_INVALID"});
});
test("allowed activity slides idle only; denied module does not renew",async()=>{
 const f=fixture();f.at(60);const absolute=f.state.context.limite_absoluto_em;
 const out=await f.access();assert.equal(out.expiresAt,stamp(micros(START)+1860000000n));
 assert.equal(out.absoluteExpiresAt,absolute);const before=structuredClone(f.state);
 f.at(120);assert.equal((await f.access({allowedOperation:false})).permitted,false);assert.deepEqual(f.state,before);
});
for(const mutate of [
 f=>f.state.context=null,f=>f.state.session.revogada_em=START,f=>f.state.user.deleted_at=START,
 f=>f.state.user.auth_version++,f=>f.state.session.expira_em=START,
 f=>f.state.session.limite_absoluto_em=START,f=>f.state.context.auth_version_esperada=2,
 f=>f.state.context.iniciada_em=stamp(micros(START)+1n),
 f=>f.state.context.limite_absoluto_em=stamp(micros(START)+7200000001n),
 f=>f.state.context.expira_em=stamp(micros(START)+1800000001n),
 f=>f.state.context.ultimo_uso_em=stamp(micros(START)+1n),f=>f.state.context.expira_em="infinity",
 f=>f.state.session.revogada_em=undefined,f=>f.state.user.email_confirmado_em="invalid",
 f=>f.state.user.cadastro_pendente_expira_em="infinity",
])test("invalid/revoked/unbound context never authorized / "+String(mutate),async()=>{
 const f=fixture();mutate(f);await assert.rejects(f.access(),{code:"AUTH_RESTRICTED_INVALID"});
 assert.equal(f.calls.some(call=>call.tag==="touch"),false);
});
for(const key of ["id","auth_version","deleted_at","email_confirmado_em","cadastro_pendente_expira_em",
 "cargo_id","unidade_id","data_nascimento","escolaridade_id","deficiencia_id"])
test("missing mandatory account evidence / "+key,async()=>{const f=fixture();delete f.state.user[key];await assert.rejects(f.access(),{code:"AUTH_RESTRICTED_INVALID"});});
for(const token of ["","invalid","x".repeat(42),"x".repeat(44),TOKEN+" ","x".repeat(43)])
test("invalid/unknown cookie / "+token.length,async()=>{const f=fixture();await assert.rejects(f.access({cookieToken:token}),{code:"AUTH_RESTRICTED_INVALID"});});
test("no cookie and no authenticated identity is not restricted authentication",async()=>{
 const f=fixture();await assert.rejects(f.access({cookieToken:undefined}),{code:"AUTH_RESTRICTED_INVALID"});assert.equal(f.calls.length,0);
});
test("authenticated Bearer alone cannot authorize regularization or modules",async()=>{
 const f=fixture();for(const allowedOperation of [true,false]){
  assert.equal((await f.access({cookieToken:undefined,identity:{id:7,authVersion:1},allowedOperation})).permitted,false);
 }
 assert.equal(f.calls.some(call=>call.tag==="context"||call.tag==="touch"),false);
});
for(const identity of [{id:8,authVersion:1},{id:7,authVersion:2},{id:7,sessionId:"different"},{id:"7"}, {id:7,authVersion:null}])
test("cookie/Bearer identity conflict / "+JSON.stringify(identity),async()=>{const f=fixture();await assert.rejects(f.access({identity}),{code:"AUTH_RESTRICTED_INVALID"});});
test("matching validated identities share one persisted account",async()=>{
 const f=fixture();assert.equal((await f.access({identity:{id:7,sessionId:SID,authVersion:1}})).permitted,true);
});
for(const profile of ["usuario","gestor","administrador","diagnostico","cai_administrador","organizador"])
test("profiles do not override pending proof / "+profile,async()=>{
 const f=fixture();f.profiles=profile==="usuario"?["usuario"]:["usuario",profile];
 f.state.user.email_confirmado_em=START;
 const result=await f.access();assert.equal(result.restricted,true);
 assert.equal(result.progress.revisaoComprovada,false);assert.equal(result.progress.politicasComprovadas,false);
 assert.equal((await f.access({allowedOperation:false})).permitted,false);
 if(["gestor","administrador","diagnostico","cai_administrador"].includes(profile))assert.equal(result.progress.mfaExigido,true);
});
for(const profiles of [[],["gestor"],["usuario","inventado"],["usuario","usuario"]])
test("missing/invalid server grants fail closed / "+JSON.stringify(profiles),async()=>{
 const f=fixture();f.profiles=profiles;await assert.rejects(f.access(),{code:"AUTH_RESTRICTED_INVALID"});
});
test("progress comes only from current persisted fields and survives new authentication",async()=>{
 const f=fixture();f.state.user.cadastro_pendente_expira_em=stamp(micros(START)+86400000000n);
 let out=await f.access();assert.ok(out.pending.includes("email"));assert.ok(out.pending.includes("cadastro"));
 f.state.user.email_confirmado_em=START;f.state.user.cadastro_pendente_expira_em=null;
 f.state.user.cargo_id=null;out=await f.access();assert.equal(out.progress.dadosPreenchidos,false);
 f.at(7200);await assert.rejects(f.access(),{code:"AUTH_RESTRICTED_INVALID"});
 const fresh=fixture();fresh.state.user=structuredClone(f.state.user);
 fresh.state.session.id="00000000-0000-4000-8000-000000000014";
 out=await fresh.access();assert.equal(out.progress.emailConfirmado,true);
 assert.equal(out.progress.dadosPreenchidos,false);assert.equal(out.progress.politicasComprovadas,false);
});
for(const tag of ["hint","user","profiles","session","context","clock","touch","touch-session"])
test("database failure is sanitized and rolls back / "+tag,async()=>{
 const f=fixture(),before=structuredClone(f.state);f.fail=tag;
 await assert.rejects(f.access(),error=>error.code==="AUTH_RESTRICTED_FAILURE"&&!inspect(error).includes("SECRET")&&!error.cause);
 assert.deepEqual(f.state,before);
});
test("expiry while waiting cannot pass final write fence",async()=>{
 const f=fixture();f.onQuery=tag=>{if(tag==="touch")f.at(1800);};
 await assert.rejects(f.access(),{code:"AUTH_RESTRICTED_INVALID"});
});
test("concurrent activity serializes and preserves fixed absolute deadline",async()=>{
 const f=fixture();f.at(100);const absolute=f.state.context.limite_absoluto_em;
 const results=await Promise.all([f.access(),f.access(),f.access()]);
 assert.ok(results.every(result=>result.absoluteExpiresAt===absolute));
 assert.equal(f.state.context.ultimo_uso_em,f.now());
 assert.deepEqual(f.calls.filter(call=>["user","session","context"].includes(call.tag)).map(call=>call.tag),
  Array(3).fill(["user","session","context"]).flat());
});
test("logout queued before access prevents reuse",async()=>{
 const f=fixture();await Promise.all([
  f.db.tx(tx=>tx.raw.query("/* restricted:revoke */ UPDATE fixture SET revoked=true")),
  assert.rejects(f.access(),{code:"AUTH_RESTRICTED_INVALID"}),
 ]);
});
test("initialization uses raw executor, snapshot version, INSERT only, without recreation",async()=>{
 const calls=[];const raw={async query(sql,params){calls.push({sql,params});return {rowCount:1,rows:[{sessao_id:SID}]};}};
 await initializeRestrictedContext({raw,client:raw},{sessionId:SID,usuarioId:7,authVersion:1});
 assert.match(calls[0].sql,/s\.criada_em \+ interval '120 minutes'/);
 assert.match(calls[0].sql,/u\.auth_version = \$3/);assert.doesNotMatch(calls[0].sql,/ON CONFLICT|UPDATE public/);
 assert.deepEqual(calls[0].params,[SID,7,1]);
 await assert.rejects(initializeRestrictedContext({query:raw.query},{sessionId:SID,usuarioId:7,authVersion:1}));
});
test("initialization refuses an unproven session rather than creating context",async()=>{
 const raw={query:async()=>({rowCount:0,rows:[]})};
 await assert.rejects(initializeRestrictedContext({raw,client:raw},{sessionId:SID,usuarioId:7,authVersion:1}),{code:"AUTH_RESTRICTED_INVALID"});
});
test("legacy logout revocation is honored by D2",async()=>{
 const {createAuthSessionService}=require("./authSessionService");const f=fixture();
 const legacy=createAuthSessionService({db:{...f.db,query:async()=>f.db.tx(tx=>tx.raw.query("/* restricted:revoke */ UPDATE fixture SET revoked=true"))}});
 await legacy.revokeSession(7,SID,"logout");await assert.rejects(f.access(),{code:"AUTH_RESTRICTED_INVALID"});
});

test("legacy critical invalidation removes context and cannot reopen through old cookie",async()=>{
 const f=fixture();await f.access();
 // Efeito do trigger modelado; a execucao real do trigger exige rehearsal PostgreSQL.
 f.state.context=null;
 await assert.rejects(f.access(),{code:"AUTH_RESTRICTED_INVALID"});
 assert.equal(f.state.user.auth_version,1);
});
