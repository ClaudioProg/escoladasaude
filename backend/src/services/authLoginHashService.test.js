"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), util = require("node:util");
const bcrypt = require("bcrypt"), argon2 = require("argon2");
const passwords = require("./passwordService");
const { createLoginHashService } = require("./authLoginHashService");
const { fixture } = require("./authLoginHash.fixture");
const PASSWORD = "Frase sinteticamente segura 9!";
let hashes;
test.before(async () => {
  hashes = { bcrypt: await bcrypt.hash(PASSWORD, 4),
    argon2id: await passwords.createNewPasswordHash(PASSWORD, {}),
    oldArgon: await argon2.hash(PASSWORD, { type: argon2.argon2id, memoryCost: 1024, timeCost: 1, parallelism: 1 }) };
});
let logs;
test.beforeEach(t => {
  const flags = ["AUTH_RESTRICTED_CONTEXT_ENABLED", "AUTH_VERSION_MODE"];
  const saved = flags.map(k => process.env[k]);
  process.env.AUTH_RESTRICTED_CONTEXT_ENABLED = "false"; process.env.AUTH_VERSION_MODE = "bridge";
  t.after(() => flags.forEach((k,i) => { if (saved[i] === undefined) delete process.env[k]; else process.env[k] = saved[i]; }));
  logs = [];
  for (const method of ["info","log","warn","error"]) t.mock.method(console, method, (...args) => logs.push(args));
});
function status() { return logs.filter(x => x[0] === "[AUTH] credential maintenance").at(-1)?.[1]?.status; }
function sameSecurity(before, f) {
  assert.equal(f.state.user.auth_version, before.user.auth_version);
  assert.deepEqual(f.state.history, before.history);
  assert.deepEqual(f.state.sessions.filter(s => before.sessions.some(b => b.id === s.id)), before.sessions);
}
for (const [kind, hashName, expected] of [["bcrypt","bcrypt","upgraded_bcrypt"],["argon2id","oldArgon","rehashed_argon2id"]])
test("real " + kind + " technical upgrade commits with ONE session and JWT", async () => {
  const f = fixture(hashes[hashName]), before = structuredClone(f.state);
  const out = await f.run(PASSWORD);
  assert.equal(out.statusCode,200); assert.equal(out.error,null); assert.equal(out.cookies.length,1);
  assert.equal(f.jwt.length,1); assert.equal(f.state.sessions.length,before.sessions.length+1);
  assert.match(f.state.user.senha,/^\$argon2id\$v=19\$m=19456,p=1,t=2\$/);
  assert.equal((await passwords.verifyPassword(PASSWORD,f.state.user.senha)).authenticated,true);
  sameSecurity(before,f); assert.equal(status(),expected);
  assert.equal(f.calls.filter(c=>c.tag==="update").length,1);
  assert.equal(f.state.audits.length,1);
  const update = f.calls.find(c=>c.tag==="update"), audit = f.calls.find(c=>c.tag==="audit"),
    insert=f.calls.find(c=>c.tag==="session-insert");
  assert.equal(update.tx,audit.tx); assert.equal(update.tx,insert.tx); assert.equal(update.facade,false);
  assert.deepEqual(Object.keys(out.body).sort(),["code","message","ok","token","usuario"]);
  assert.equal("credentialMaintenance" in out.body,false);
});
test("current Argon2id login only revalidates; no repeated hash write/audit/security-table query", async () => {
  const f = fixture(hashes.argon2id), before=structuredClone(f.state);
  const out=await f.run(PASSWORD); assert.equal(out.statusCode,200); sameSecurity(before,f);
  assert.equal(f.state.user.senha,hashes.argon2id); assert.equal(status(),"current");
  for(const tag of ["update","security","audit"]) assert.equal(f.calls.some(c=>c.tag===tag),false);
});
test("login after a confirmed upgrade uses the canonical representation without repeating maintenance",async()=>{
  const f=fixture(hashes.bcrypt);
  await f.run(PASSWORD); const hash=f.state.user.senha; await f.run(PASSWORD);
  assert.equal(f.state.user.senha,hash); assert.equal(f.calls.filter(c=>c.tag==="update").length,1);
  assert.equal(f.jwt.length,2);
});
for (const password of ["curta","\uff26rase antiga \u00e9!","\u00e9".repeat(35)+"x"])
test("bcrypt upgrade preserves raw verification and NFKC without applying NEW password policy / "+password.length,async()=>{
  const f=fixture(await bcrypt.hash(password,4)); const result=await f.run(password);
  assert.equal(result.statusCode,200); assert.equal(status(),"upgraded_bcrypt");
  assert.equal((await passwords.verifyPassword(password.normalize("NFKC"),f.state.user.senha)).authenticated,true);
});
for (const password of ["a".repeat(72),"a".repeat(73),"\ud83d\ude00".repeat(18),"\ud83d\ude00".repeat(19)])
test("bcrypt >=72 original UTF-8 bytes preserves mandatory-change 403 / "+Buffer.byteLength(password),async()=>{
  const f=fixture(await bcrypt.hash(password,4)), before=structuredClone(f.state);
  const out=await f.run(password,{body:{canUpgrade:true,needsRehash:true,hash:hashes.argon2id}});
  assert.equal(out.statusCode,403); assert.equal(out.body.code,"AUTH-403-TROCA-SENHA-OBRIGATORIA");
  assert.equal(out.cookies.length,0); assert.equal(f.jwt.length,0); assert.equal(f.preparations,0);
  assert.deepEqual(f.state,before);
});
test("malformed Unicode cannot upgrade legacy bcrypt or issue normal credentials",async()=>{
  const p="legado\ud800"; const f=fixture(await bcrypt.hash(p,4));
  const out=await f.run(p); assert.equal(out.statusCode,401); assert.equal(f.jwt.length,0);
  assert.equal(f.calls.some(c=>c.tag==="update"),false);
});
for(const kind of ["bcrypt","argon2id","oldArgon"]) test("incorrect real credential has canonical 401 and 250ms floor / "+kind,async()=>{
  const f=fixture(hashes[kind]), before=structuredClone(f.state), start=performance.now();
  const out=await f.run("incorreta");
  assert.equal(out.statusCode,401); assert.equal(out.body.code,"AUTH-401-CREDENCIAIS-INVALIDAS");
  assert.ok(performance.now()-start>=248); assert.equal(f.jwt.length,0); assert.deepEqual(f.state,before);
});
test("invalid stored hash is a generic operational 500, never maintenance",async()=>{
  const f=fixture("CANARY_INVALID_HASH"), out=await f.run(PASSWORD);
  assert.equal(out.statusCode,500); assert.equal(out.body.code,"AUTH-500-LOGIN");
  assert.equal(f.jwt.length,0); assert.equal(f.calls.length,0);
  assert.equal(JSON.stringify([out.body,logs]).includes("CANARY"),false);
});
test("authenticated weak Argon2id is technically rehashed without new-password length/blocklist policy",async()=>{
  const weak="abc", old=await argon2.hash(weak,{type:argon2.argon2id,memoryCost:1024,timeCost:1,parallelism:1});
  const f=fixture(old); assert.equal((await f.run(weak)).statusCode,200);
  assert.equal(status(),"rehashed_argon2id"); assert.equal((await passwords.verifyPassword(weak,f.state.user.senha)).authenticated,true);
});
test("technical rehash API authenticates again and refuses current parameters, bcrypt and wrong credentials",async()=>{
  for(const [p,h] of [[PASSWORD,hashes.argon2id],[PASSWORD,hashes.bcrypt],["wrong",hashes.oldArgon]])
    await assert.rejects(passwords.rehashAuthenticatedPassword(p,h),{code:"PASSWORD_REHASH_DENIED"});
  const next=await passwords.rehashAuthenticatedPassword(PASSWORD,hashes.oldArgon);
  assert.equal((await passwords.verifyPassword(PASSWORD,next)).needsRehash,false);
});
for(const kind of ["context","proof"]) for(const moment of ["before crypto","during crypto"])
test("defer technical UPDATE and preserve every security record / "+kind+" / "+moment,async()=>{
  const f=fixture(hashes.bcrypt);
  if(moment==="before crypto") await f.issue(kind);
  else f.onPrepared=()=>f.issue(kind);
  const out=await f.run(PASSWORD); assert.equal(out.statusCode,200); assert.equal(status(),"deferred_security_state");
  assert.equal(f.state.user.senha,hashes.bcrypt); assert.equal(f.state.user.auth_version,3);
  assert.equal(f.calls.some(c=>c.tag==="update"),false); assert.equal(f.state.audits.length,0);
  assert.equal(f.state[kind==="context"?"contexts":"proofs"].length,1);
});
test("expired or already consumed proofs still defer; no retention policy invented",async()=>{
  const f=fixture(hashes.oldArgon); f.state.proofs.push({usuario_id:7,sessao_id:"old-session",
    expira_em:"2000-01-01",consumida_em:"1999-01-01"});
  assert.equal((await f.run(PASSWORD)).statusCode,200);
  assert.equal(status(),"deferred_security_state"); assert.equal(f.state.user.senha,hashes.oldArgon);
  assert.equal(f.state.proofs.length,1);
});
test("security records belonging to another account do not defer this account",async()=>{
  const f=fixture(hashes.bcrypt); f.state.sessions.push({id:"other",usuario_id:8,revogada_em:null});
  f.state.contexts.push({sessao_id:"other"}); f.state.proofs.push({usuario_id:8,sessao_id:"other"});
  assert.equal((await f.run(PASSWORD)).statusCode,200); assert.equal(status(),"upgraded_bcrypt");
  assert.deepEqual(f.state.contexts,[{sessao_id:"other"}]); assert.deepEqual(f.state.proofs,[{usuario_id:8,sessao_id:"other"}]);
});
for(const kind of ["context","proof"]) test("modeled FK writer queued after absence decision runs AFTER commit and survives / "+kind,async()=>{
  const f=fixture(hashes.bcrypt); let queued, once=false;
  f.onQuery=async tag=>{ if(tag==="security"&&!once){once=true; queued=f.issue(kind);} };
  const out=await f.run(PASSWORD); await queued;
  assert.equal(out.statusCode,200); assert.equal(status(),"upgraded_bcrypt");
  assert.equal(f.state[kind==="context"?"contexts":"proofs"].length,1);
  const sequence=f.calls.map(c=>c.tag);
  assert.ok(sequence.indexOf("user")<sequence.indexOf("sessions"));
  assert.ok(sequence.indexOf("sessions")<sequence.indexOf("security"));
  assert.ok(sequence.indexOf("security")<sequence.indexOf("update"));
});
test("new D2 context is initialized only AFTER technical update in the same session transaction",async()=>{
  process.env.AUTH_RESTRICTED_CONTEXT_ENABLED="true";
  const f=fixture(hashes.bcrypt), out=await f.run(PASSWORD);
  assert.equal(out.statusCode,200); assert.equal(f.state.contexts.length,1);
  assert.equal(f.state.contexts[0].sessao_id,f.state.sessions.at(-1).id);
  const tags=f.calls.map(c=>c.tag); assert.ok(tags.indexOf("update")<tags.indexOf("initialize-context"));
});
test("existing D2 context is preserved and a new one is created when rehash is deferred",async()=>{
  process.env.AUTH_RESTRICTED_CONTEXT_ENABLED="true";
  const f=fixture(hashes.bcrypt); await f.issue("context");
  const out=await f.run(PASSWORD); assert.equal(out.statusCode,200);
  assert.equal(status(),"deferred_security_state"); assert.equal(f.state.contexts.length,2);
  assert.equal(f.state.user.senha,hashes.bcrypt);
});
test("model really invalidates D2/proofs for an unconditional hash change; maintenance does not bypass triggers",async()=>{
  const f=fixture(hashes.bcrypt); await f.issue("context"); await f.issue("proof");
  f.bump({senha:hashes.argon2id});
  assert.equal(f.state.contexts.length,0); assert.equal(f.state.proofs.length,0);
});
for(const [label,fields] of [
  ["versioned reset",()=>({senha:hashes.argon2id,auth_version:4})],
  ["legacy writer",()=>({senha:hashes.argon2id})],
  ["deleted",()=>({deleted_at:"2026-10-16"})],
  ["profile",()=>({perfil:"administrador"})],
  ["revocation with version",()=>({auth_version:4})],
]) test("stale credential cannot create a session or overwrite a competing state / "+label,async()=>{
  const f=fixture(hashes.bcrypt); f.onPrepared=()=>f.bump(fields());
  const out=await f.run(PASSWORD);
  assert.equal(out.statusCode,401); assert.equal(out.body.code,"AUTH-401-CREDENCIAIS-INVALIDAS");
  assert.equal(out.cookies.length,0); assert.equal(f.state.sessions.length,1);
  assert.equal(f.calls.some(c=>c.tag==="update"),false);
});
test("ABA of legacy hash with unchanged version cannot pass the session guard",async()=>{
  const f=fixture(hashes.bcrypt);
  f.onPrepared=()=>{f.bump({senha:hashes.argon2id});f.bump({senha:hashes.bcrypt});};
  assert.equal((await f.run(PASSWORD)).statusCode,401);
  assert.equal(f.state.sessions.length,1); assert.equal(f.state.user.auth_version,3);
});
test("stale canonical Argon2id cannot create a session either",async()=>{
  const f=fixture(hashes.argon2id);
  f.onPrepared=()=>{f.bump({senha:hashes.bcrypt});f.bump({senha:hashes.argon2id});};
  assert.equal((await f.run(PASSWORD)).statusCode,401); assert.equal(f.state.sessions.length,1);
});
test("two simultaneous logins: one audited upgrade, fresh verified recovery and one session/JWT each",async()=>{
  const f=fixture(hashes.bcrypt);
  let count=0, release; const barrier=new Promise(r=>{release=r;});
  f.onPrepared=async()=>{if(++count===2)release();await barrier;};
  const out=await Promise.all([f.run(PASSWORD),f.run(PASSWORD)]);
  assert.ok(out.every(r=>r.statusCode===200)); assert.equal(f.recoveries,1);
  assert.equal(f.calls.filter(c=>c.tag==="update").length,1); assert.equal(f.state.audits.length,1);
  assert.equal(f.state.sessions.length,3); assert.equal(f.jwt.length,2);
  assert.equal(f.state.user.auth_version,3); assert.equal(f.state.history.length,1);
  assert.ok(logs.some(x => x[1]?.status === "concurrent_upgrade"));
});
test("same password in an unaudited legacy rewrite is not silently classified as technical upgrade",async()=>{
  const f=fixture(hashes.bcrypt);
  f.onPrepared=()=>f.bump({senha:hashes.argon2id});
  assert.equal((await f.run(PASSWORD)).statusCode,401);
  assert.equal(f.recoveries,1); assert.equal(f.state.sessions.length,1);
});
test("recovery requires a committed audit-row revision matching the current user revision",async()=>{
  const f=fixture(hashes.bcrypt), original=structuredClone(f.state.user);
  assert.equal((await f.run(PASSWORD)).statusCode,200);
  f.state.audits[0].revision="999";
  await assert.rejects(f.hashService.recover(original,PASSWORD),{code:"AUTH_HASH_CHANGED"});
});
test("audit marker alone cannot authenticate a wrong password during recovery",async()=>{
  const f=fixture(hashes.bcrypt), original=structuredClone(f.state.user);
  assert.equal((await f.run(PASSWORD)).statusCode,200);
  await assert.rejects(f.hashService.recover(original,"wrong"),{code:"AUTH_HASH_CHANGED"});
});
test("a second divergence during bounded recovery is rejected, never an unbounded retry",async()=>{
  const f=fixture(hashes.bcrypt), original=structuredClone(f.state.user);
  await f.run(PASSWORD);
  const guard=await f.hashService.recover(original,PASSWORD);
  f.bump({senha:hashes.bcrypt});
  const {createAuthSessionService}=require("./authSessionService");
  await assert.rejects(createAuthSessionService({db:f.db}).createSession({usuarioId:7,expectedAuthVersion:3,credentialGuard:guard}),
    {code:"AUTH_HASH_CHANGED"});
  assert.equal(f.state.sessions.length,2);
});
test("revoking an old session does not resurrect it or forbid a genuinely new authentication",async()=>{
  const f=fixture(hashes.bcrypt);
  f.onPrepared=()=>{f.state.sessions[0].revogada_em=new Date();};
  assert.equal((await f.run(PASSWORD)).statusCode,200);
  assert.ok(f.state.sessions[0].revogada_em); assert.equal(f.state.sessions.at(-1).revogada_em,null);
});
for(const step of ["mode","user","sessions","security","update","audit","profiles","session-insert","commit"])
test("failure rolls back hash, technical audit and single session / "+step,async()=>{
  const f=fixture(hashes.bcrypt), before=structuredClone(f.state);
  if(step==="commit") f.failCommit=true; else f.fail=step;
  const out=await f.run(PASSWORD); assert.ok(out.error); assert.equal(out.cookies.length,0);
  assert.deepEqual(f.state,before);
  assert.equal(logs.some(x=>x[0]==="[AUTH] credential maintenance"),false);
  assert.equal(JSON.stringify(logs).includes("CANARY"),false);
});
test("D2 initialization failure rolls back the technical update as well",async()=>{
  process.env.AUTH_RESTRICTED_CONTEXT_ENABLED="true";
  const f=fixture(hashes.bcrypt), before=structuredClone(f.state); f.fail="initialize-context";
  assert.ok((await f.run(PASSWORD)).error); assert.deepEqual(f.state,before);
});
for(const operation of ["upgradeLegacyPasswordHash","rehashAuthenticatedPassword"])
test("crypto failure is sanitized and performs no writes / "+operation,async t=>{
  const f=fixture(operation==="upgradeLegacyPasswordHash"?hashes.bcrypt:hashes.oldArgon),before=structuredClone(f.state);
  t.mock.method(f.passwords,operation,async()=>{throw new Error("CANARY_CRYPTO "+PASSWORD);});
  const out=await f.run(PASSWORD); assert.equal(out.error.code,"AUTH_HASH_FAILURE");
  assert.equal(util.inspect(out.error).includes("CANARY"),false); assert.deepEqual(f.state,before);
});
test("technical audit and internal logs contain only safe metadata, no hashes/password/body or personal data",async()=>{
  const f=fixture(hashes.bcrypt); const out=await f.run(PASSWORD,{body:{sentinel:"CANARY_REQUEST"}});
  assert.equal(out.statusCode,200);
  const text=JSON.stringify([f.state.audits,logs]);
  for(const secret of [PASSWORD,hashes.bcrypt,f.state.user.senha,f.state.user.email,f.state.user.cpf,"CANARY_REQUEST"])
    assert.equal(text.includes(secret),false);
  const details=f.state.audits[0].details;
  assert.equal(details.origem,"rehash_tecnico_login"); assert.equal(details.auth_version,3);
  assert.equal(f.state.audits[0].revision,details.revisao_nova);
});
for(const errorAt of ["cookieError","jsonError"]) test("HTTP failure compensates the ONE new session; a committed technical hash stays truthfully committed / "+errorAt,async()=>{
  const f=fixture(hashes.bcrypt), original=new Error("response failure");
  const out=await f.run(PASSWORD,{[errorAt]:original});
  assert.equal(out.error,original); assert.equal(f.state.sessions.length,2);
  assert.equal(f.state.sessions.at(-1).motivo_revogacao,"login_response_failure");
  assert.match(f.state.user.senha,/^\$argon2id\$/); assert.equal(f.state.audits.length,1);
});
test("max valid auth_version is preserved; technical operation never increments it",async()=>{
  const f=fixture(hashes.bcrypt);f.state.user.auth_version=2147483647;
  assert.equal((await f.run(PASSWORD)).statusCode,200); assert.equal(f.state.user.auth_version,2147483647);
});
test("service cannot be configured without canonical cryptographic operations or critical audit",()=>{
  assert.throws(()=>createLoginHashService({db:{tx(){}},registrarAuditoria(){},passwords:{verifyPassword(){}}}),{code:"AUTH_HASH_CONFIG"});
});

test("trimmed legacy profile contract remains unchanged while the guard fences the original server field",async()=>{
  const f=fixture(hashes.bcrypt); f.state.user.perfil=" usuario ";
  const out=await f.run(PASSWORD); assert.equal(out.statusCode,200);
  assert.equal(out.body.usuario.perfil,"usuario"); assert.equal(f.jwt[0].claims.perfil,"usuario");
  assert.equal(f.state.user.perfil," usuario ");
});
test("two simultaneous outdated Argon2id logins rehash once and preserve both legitimate authentications",async()=>{
  const f=fixture(hashes.oldArgon); let count=0, release;
  const barrier=new Promise(r=>{release=r;}); f.onPrepared=async()=>{if(++count===2)release();await barrier;};
  const out=await Promise.all([f.run(PASSWORD),f.run(PASSWORD)]);
  assert.ok(out.every(r=>r.statusCode===200)); assert.equal(f.recoveries,1);
  assert.equal(f.calls.filter(c=>c.tag==="update").length,1);
  assert.equal(f.state.audits[0].details.tipo,"rehashed_argon2id");
  assert.equal(f.jwt.length,2); assert.equal(f.state.user.auth_version,3);
  assert.ok(logs.some(x=>x[1]?.status==="concurrent_upgrade"));
});
test("invalid session guard is rejected before transaction or session creation",async()=>{
  const {createAuthSessionService}=require("./authSessionService"); const f=fixture(hashes.bcrypt);
  await assert.rejects(createAuthSessionService({db:f.db}).createSession({
    usuarioId:7,expectedAuthVersion:3,credentialGuard:true}),{code:"AUTH_SESSION_CREDENTIAL_GUARD_INVALID"});
  assert.equal(f.calls.length,0); assert.equal(f.state.sessions.length,1);
});
test("unknown internal guard result aborts before effects and never becomes a success",async()=>{
  const {createAuthSessionService}=require("./authSessionService"); const f=fixture(hashes.bcrypt), before=structuredClone(f.state);
  await assert.rejects(createAuthSessionService({db:f.db}).createSession({
    usuarioId:7,expectedAuthVersion:3,credentialGuard:async()=>({status:"unknown"})}),{code:"AUTH_SESSION_CREDENTIAL_GUARD_INVALID"});
  assert.deepEqual(f.state,before);
});
