"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const crypto = require("node:crypto");
const { inspect } = require("node:util");
const { createAuthEnqueueService, AuthEnqueueError } = require("./authEnqueueService");
const { createAuthOutboxCrypto } = require("./authOutboxCrypto");
const { QUOTA_LOCK_NAMESPACE } = require("./authQuotaService");
const id = (n = 1) => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
const NOW = "2026-10-13T17:00:00.123456Z";
const OLD = "2026-10-13T15:00:00.123455Z";
const RESULT = { status: "processada" };
const cfg = () => ({ activeKeyId: "aes1", keys: [{ keyId: "aes1", secret: Buffer.alloc(32, 9) }] });
const hmac = () => ({ activeKeyId: "hmac1", keys: [{ keyId: "hmac1", secret: Buffer.alloc(32, 7) }] });
const args = (extra = {}) => ({ emissaoId: id(), finalidade: "confirmacao", usuarioId: 7, expectedAuthVersion: 2, expectedEmailVersion: 3, ...extra });
function copy(value) {
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (Array.isArray(value)) return value.map(copy);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,copy(v)]));
  return value;
}
function micros(value) { return BigInt(Date.parse(value)) * 1000n + BigInt(value.slice(23,26)); }
function stamp(value) { const base = new Date(Number(value / 1000n)).toISOString(); return base.slice(0,20) + String(value % 1000000n).padStart(6,"0") + "Z"; }
function challenge(n = 9, extra = {}) {
  return { id: id(n), usuario_id: 7, finalidade: "confirmacao", family: "email", criada_em: OLD,
    expira_em: stamp(micros(OLD) + 86400000000n), token_hash: Buffer.alloc(32, n % 256),
    email_version_esperada: 3, auth_version_esperada: null, email_candidato: "synthetic@example.invalid",
    consumida_em: null, invalidada_em: null, ...extra };
}

// Modelo in-memory deliberado: protocolo/executor reais, sem parser ou locks PostgreSQL.
function fixture(initial = {}, options = {}) {
  const base = { user: { id: 7, email: "Synthetic@Example.invalid", auth_version: 2, email_version: 3,
    excluido: false, confirmado: false, cadastro_pendente: false }, quota: [], challenges: [], outbox: [], audit: [], ...copy(initial) };
  let committed = copy(base); let state = copy(base); const savepoints = new Map(); const calls = []; const logs = [];
  let failed = false; let inTransaction = options.active !== false;
  const client = { async query(sql, values = []) {
    const marker = sql.match(/(enqueue|quota):([a-z]+)/); const tag = marker ? marker[1] + ":" + marker[2]
      : sql.includes("INSERT INTO auditoria_eventos") ? "audit" : sql;
    calls.push({ tag, sql, values: copy(values) });
    if (options.onQuery) await options.onQuery(tag, values);
    if (options.failureAt === tag && !failed) { failed = true; throw options.error || Object.assign(new Error("SYNTHETIC_DRIVER_SECRET synthetic@example.invalid"), { code: "40P01", detail: "SYNTHETIC_DRIVER_SECRET" }); }
    if (options.rollbackFails && tag === "ROLLBACK TO SAVEPOINT auth_enqueue_guard") throw new Error("SYNTHETIC_DRIVER_SECRET");
    if (tag === "BEGIN") { state = copy(committed); inTransaction = true; return { rows: [] }; }
    if (tag === "COMMIT") { committed = copy(state); inTransaction = false; return { rows: [] }; }
    if (tag === "ROLLBACK") { state = copy(committed); inTransaction = false; return { rows: [] }; }
    if (tag.startsWith("SAVEPOINT ")) { if (!inTransaction) throw Object.assign(new Error("autocommit"), { code: "25P01" }); savepoints.set(tag.slice(10), copy(state)); return { rows: [] }; }
    if (tag.startsWith("ROLLBACK TO SAVEPOINT ")) { state = copy(savepoints.get(tag.slice(22))); return { rows: [] }; }
    if (tag.startsWith("RELEASE SAVEPOINT ")) { savepoints.delete(tag.slice(18)); return { rows: [] }; }
    if (options.overrides && Object.hasOwn(options.overrides, tag)) return options.overrides[tag];
    if (tag === "enqueue:transaction" || tag === "quota:transaction") return { rows: [{ isolamento: options.isolation || "read committed", somente_leitura: options.readOnly || "off" }] };
    if (tag === "enqueue:user") return { rows: state.user ? [copy(state.user)] : [] };
    if (tag === "quota:user") return { rows: state.user ? [{ id: state.user.id }] : [] };
    if (tag === "quota:lock") { assert.equal(values[0], QUOTA_LOCK_NAMESPACE); return { rows: [{}] }; }
    if (tag === "quota:clock") return { rows: [{ instante: options.clock || NOW }] };
    if (tag === "quota:keys") return { rows: [{ desconhecida: state.quota.some(q => q.ip_hmac !== null &&
      micros(q.registrada_em) > micros(values[0]) - 900000000n && !values[1].includes(q.ip_hmac_key_id)) }] };
    if (tag === "quota:replay") return { rows: state.quota.filter(q => q.emissao_id === values[0]).map(copy) };
    if (tag === "quota:account") {
      const t = micros(values[1]); const records = state.quota.filter(q => q.usuario_id === values[0] && micros(q.registrada_em) > t-86400000000n);
      const count = span => records.filter(q => micros(q.registrada_em) > t-span && micros(q.registrada_em) <= t).length;
      return { rows: [{ minuto: options.deny ? 1 : count(60000000n), hora: count(3600000000n), dia: count(86400000000n), futura: records.some(q => micros(q.registrada_em)>t) }] };
    }
    if (tag === "quota:ip") {
      const t = micros(values[0]); const records = state.quota.filter(q => values[1].some((k,n) => q.ip_hmac_key_id===k && Buffer.isBuffer(q.ip_hmac) && q.ip_hmac.equals(values[2][n])) && micros(q.registrada_em)>t-900000000n);
      return { rows: [{ quantidade: records.filter(q => micros(q.registrada_em)<=t).length, futura: records.some(q => micros(q.registrada_em)>t) }] };
    }
    if (tag === "quota:insert") {
      state.quota.push({ emissao_id: values[0], finalidade: values[1], usuario_id: values[2], ip_hmac: copy(values[3]), ip_hmac_key_id: values[4], registrada_em: values[5] });
      return { rows: [{ emissao_id: values[0] }], rowCount: 1 };
    }
    if (tag === "enqueue:replay") {
      return { rows: state.outbox.filter(o=>o.id===values[0]).map(o=>{
        const c = state.challenges.find(c=>c.id===(o.confirmacao_id ?? o.recuperacao_id));
        return { id:o.id, confirmacao_id:o.confirmacao_id, recuperacao_id:o.recuperacao_id, email_destino:o.email_destino,
          usuario_id:c?.usuario_id, finalidade:c?.finalidade, email_version_esperada:c?.email_version_esperada,
          auth_version_esperada:c?.auth_version_esperada, criada_em:o.criada_em, desafio_criada_em:c?.criada_em };
      }) };
    }
    const family = sql.includes("public.auth_recuperacao_senha") ? "recovery" : "email";
    if (tag === "enqueue:previous") return { rows: state.challenges.filter(c=>c.family===family && c.usuario_id===values[0] && c.consumida_em===null && c.invalidada_em===null).map(c=>({id:c.id,criada_em:c.criada_em})) };
    if (tag === "enqueue:invalidate") {
      const c = state.challenges.find(c=>c.id===values[0] && c.usuario_id===values[2] && c.consumida_em===null && c.invalidada_em===null);
      if(!c) return {rows:[],rowCount:0}; c.invalidada_em=values[1];
      return options.badAt===tag ? {rows:[],rowCount:0} : {rows:[{id:c.id}],rowCount:1};
    }
    if (tag === "enqueue:challenge") {
      if(state.challenges.some(c=>c.family===family && (c.id===values[0] || (c.usuario_id===values[1] && c.consumida_em===null && c.invalidada_em===null)))) throw Object.assign(new Error("SYNTHETIC_DRIVER_SECRET"),{code:"23505"});
      if(state.challenges.some(c=>c.family===family && c.token_hash.equals(values[2]))) throw Object.assign(new Error("SYNTHETIC_DRIVER_SECRET"),{code:"23505",constraint:"auth_token_hash_key"});
      const recovery = family === "recovery";
      const c={id:values[0],usuario_id:values[1],token_hash:copy(values[2]),family,finalidade:recovery?"recuperacao":values[6],
        email_version_esperada:recovery?null:values[3],auth_version_esperada:recovery?values[3]:null,email_candidato:recovery?null:values[5],
        criada_em:values[4],expira_em:stamp(micros(values[4])+(recovery?1800000000n:86400000000n)),consumida_em:null,invalidada_em:null};
      state.challenges.push(c);
      return options.badAt===tag ? {rows:[{...c,expira_em:stamp(micros(c.expira_em)+1n)}],rowCount:1} : {rows:[{id:c.id,criada_em:c.criada_em,expira_em:c.expira_em}],rowCount:1};
    }
    if (tag === "enqueue:outbox") {
      if(state.outbox.some(o=>o.id===values[0])) throw Object.assign(new Error("SYNTHETIC_DRIVER_SECRET"),{code:"23505",constraint:"auth_outbox_pkey"});
      if(state.outbox.some(o=>o.key_id===values[7] && o.nonce?.equals(values[5]))) throw Object.assign(new Error("SYNTHETIC_DRIVER_SECRET"),{code:"23505",constraint:"auth_outbox_key_nonce_uq"});
      const o={id:values[0],confirmacao_id:values[1],recuperacao_id:values[2],email_destino:values[3],conteudo_cifrado:copy(values[4]),
        nonce:copy(values[5]),auth_tag:copy(values[6]),key_id:values[7],status:"pending",tentativas:0,criada_em:values[8],proxima_tentativa_em:values[8]};
      state.outbox.push(o);
      return options.badAt===tag ? {rows:[],rowCount:0} : {rows:[{id:o.id}],rowCount:1};
    }
    if (tag === "audit") {
      const data={id:state.audit.length+1,usuario_id:values[0],acao:values[2],modulo:values[3],entidade_id:values[5]};
      state.audit.push({data,values:copy(values)});return {rows:[data],rowCount:1};
    }
    assert.fail("SQL inesperado no modelo: "+tag);
  }, release(){calls.push({tag:"release"});} };
  const executor = { raw: client, client, query(){ assert.fail("Facade com logging nao deve ser chamada"); } };
  function load(file, requireFn, env={}) {
    const module={exports:{}};
    vm.runInNewContext(fs.readFileSync(require.resolve(file),"utf8"),{module,exports:module.exports,require:requireFn,process:{env},URL,Buffer,Date,
      console:Object.fromEntries(["log","warn","error"].map(k=>[k,(...a)=>logs.push(a)]))});return module.exports;
  }
  const realDb=load("../db",name=>{assert.equal(name,"pg");return {Pool:class{on(){} async connect(){return client;} query(){assert.fail("Pool global proibido");}}};},
    {NODE_ENV:"production",DATABASE_URL:"postgres://dummy:dummy@127.0.0.1:1/etapa11_dummy",LOG_SQL:"true"});
  const realAudit=load("./auditoriaService",name=>{assert.equal(name,"../db");return {query(){assert.fail("Fallback de auditoria proibido");}};}).registrarAuditoria;
  const audit=async (params,tx)=>{
    assert.equal(tx.raw,client);assert.equal(tx.client,client);assert.equal(params.critica,true);
    assert.deepEqual(Object.keys(params).sort(),["usuario_id","acao","modulo","entidade","entidade_id","detalhes","critica"].sort());
    assert.doesNotMatch(inspect(params),/SYNTHETIC_DRIVER_SECRET|@|token|keyId|nonce/);
    if(options.auditThrows)throw new Error("SYNTHETIC_DRIVER_SECRET");
    if(options.auditBad)return {ok:true,data:null};
    return realAudit(params,tx);
  };
  const service=createAuthEnqueueService({cryptoConfig:cfg(),hmacConfig:hmac(),registrarAuditoria:audit});
  return {service,executor,actual:realDb,calls,logs,state:()=>copy(state),committed:()=>copy(committed),initial:copy(base)};
}

for(const finalidade of ["confirmacao","alteracao","recuperacao"]){
  test("enqueue: quota/desafio/outbox/auditoria atomicos no db.tx real simulado - "+finalidade,async()=>{
    const db=fixture({user:{id:7,email:"Synthetic@Example.invalid",auth_version:2,email_version:3,excluido:false,confirmado:finalidade!=="confirmacao",cadastro_pendente:false}});
    const req=args({finalidade,...(finalidade==="alteracao"?{emailCandidato:"Candidate@Example.invalid"}:{})});
    const result=await db.actual.tx(async tx=>{const result=await db.service.enqueue(tx,req);assert.equal(db.committed().outbox.length,0);return result;});
    assert.deepEqual(result,RESULT);const state=db.committed();assert.equal(state.quota.length,1);assert.equal(state.challenges.length,1);assert.equal(state.outbox.length,1);assert.equal(state.audit.length,1);
    const c=state.challenges[0],o=state.outbox[0];assert.equal(c.id,req.emissaoId);assert.equal(o.id,c.id);assert.equal(c.criada_em,NOW);assert.equal(o.criada_em,NOW);assert.equal(o.proxima_tentativa_em,NOW);
    assert.equal(micros(c.expira_em)-micros(NOW),finalidade==="recuperacao"?1800000000n:86400000000n);assert.equal(c.expira_em.slice(20,26),"123456");
    assert.equal(o.email_destino,finalidade==="alteracao"?"candidate@example.invalid":"synthetic@example.invalid");
    assert.equal(o.status,"pending");assert.equal(o.tentativas,0);assert.equal(o.nonce.length,12);assert.equal(o.auth_tag.length,16);
    assert.equal(o.confirmacao_id,finalidade==="recuperacao"?null:c.id);assert.equal(o.recuperacao_id,finalidade==="recuperacao"?c.id:null);
    const clear=createAuthOutboxCrypto(cfg()).decifrar({mensagemId:o.id,desafioId:c.id,finalidade,emailDestino:o.email_destino},{conteudoCifrado:o.conteudo_cifrado,nonce:o.nonce,authTag:o.auth_tag,keyId:o.key_id});
    const payload=JSON.parse(clear.toString());assert.equal(payload.v,1);assert.match(payload.token,/^[A-Za-z0-9_-]{43}$/);
    assert.deepEqual(c.token_hash,crypto.createHash("sha256").update(payload.token,"ascii").digest());
    assert.equal(inspect(db.calls).includes(payload.token),false);assert.equal(JSON.stringify(result).includes(payload.token),false);clear.fill(0);
    assert.deepEqual(db.logs,[]);assert.equal(state.user.email,"Synthetic@Example.invalid");
  });
}

test("enqueue: usuario antes de advisory locks ordenados, depois clock e desafios",async()=>{
  const db=fixture();await db.service.enqueue(db.executor,args({ip:"192.0.2.1"}));
  const tags=db.calls.map(c=>c.tag);assert.ok(tags.indexOf("enqueue:user")<tags.indexOf("quota:lock"));
  assert.ok(tags.lastIndexOf("quota:lock")<tags.indexOf("quota:clock"));assert.ok(tags.indexOf("quota:clock")<tags.indexOf("enqueue:previous"));
  const keys=db.calls.filter(c=>c.tag==="quota:lock").map(c=>c.values[1]);assert.deepEqual(keys,[...new Set(keys)].sort((a,b)=>a-b));
});

for(const [label,initial,options,requestExtra] of [
  ["ausente",{user:null},{},{}],["excluido",{user:{id:7,email:"synthetic@example.invalid",auth_version:2,email_version:3,excluido:true,confirmado:false,cadastro_pendente:false}},{},{}],
  ["cadastro D1",{user:{id:7,email:"synthetic@example.invalid",auth_version:2,email_version:3,excluido:false,confirmado:false,cadastro_pendente:true}},{},{}],
  ["auth version",{},{},{expectedAuthVersion:1}],["email version",{},{},{expectedEmailVersion:1}],
  ["quota",{},{deny:true},{}],["confirmado",{user:{id:7,email:"synthetic@example.invalid",auth_version:2,email_version:3,excluido:false,confirmado:true,cadastro_pendente:false}},{},{}],
  ["recuperacao D4",{},{},{finalidade:"recuperacao"}],
  ["alteracao sem email confirmado",{},{},{finalidade:"alteracao",emailCandidato:"candidate@example.invalid"}],
])test("enqueue: resultado generico sem efeitos - "+label,async()=>{const db=fixture(initial,options);assert.deepEqual(await db.service.enqueue(db.executor,args(requestExtra)),RESULT);assert.deepEqual(db.state(),db.initial);});

test("enqueue: desafios anteriores invalidados e substituidos, inclusive expirados e outra finalidade",async()=>{
  const db=fixture({challenges:[challenge(9,{finalidade:"alteracao",criada_em:"2026-10-11T15:00:00.123455Z",expira_em:"2026-10-12T15:00:00.123455Z"})]});await db.service.enqueue(db.executor,args());
  assert.equal(db.state().challenges[0].invalidada_em,NOW);assert.equal(db.state().challenges[1].invalidada_em,null);
  assert.equal(db.state().challenges.filter(c=>c.invalidada_em===null&&c.consumida_em===null).length,1);
});

test("enqueue: recuperacao mais recente invalida anterior sem alterar confirmacao",async()=>{
  const user={id:7,email:"synthetic@example.invalid",auth_version:2,email_version:3,excluido:false,confirmado:true,cadastro_pendente:false};
  const db=fixture({user,challenges:[challenge(),challenge(8,{family:"recovery",finalidade:"recuperacao",auth_version_esperada:2,email_version_esperada:null})]});
  await db.service.enqueue(db.executor,args({finalidade:"recuperacao"}));assert.equal(db.state().challenges[0].invalidada_em,null);assert.equal(db.state().challenges[1].invalidada_em,NOW);
});

for(const tag of ["SAVEPOINT auth_enqueue_guard","enqueue:transaction","enqueue:user","quota:transaction","quota:user","quota:lock","quota:clock",
  "quota:account","quota:insert","enqueue:replay","enqueue:previous","enqueue:invalidate","enqueue:challenge","enqueue:outbox","audit","RELEASE SAVEPOINT auth_enqueue_guard"]){
  test("enqueue: falha em "+tag+" restaura quota, desafio, mensagem e auditoria",async()=>{
    const db=fixture({challenges:[challenge()]},{failureAt:tag});
    await assert.rejects(db.actual.tx(tx=>db.service.enqueue(tx,args())),error=>{assert.ok(error instanceof AuthEnqueueError);assert.equal(error.cause,undefined);assert.doesNotMatch(inspect(error),/SYNTHETIC_DRIVER_SECRET|@|token|nonce/);return true;});
    assert.deepEqual(db.committed(),db.initial);assert.deepEqual(db.state(),db.initial);assert.ok(db.calls.some(c=>c.tag==="ROLLBACK"));
  });
}
for(const tag of ["enqueue:invalidate","enqueue:challenge","enqueue:outbox"]){
  test("enqueue: resposta DB divergente em "+tag+" e critica",async()=>{const db=fixture({challenges:[challenge()]},{badAt:tag});await assert.rejects(db.service.enqueue(db.executor,args()),{code:"AUTH_ENQUEUE_DB_RESULTADO_INVALIDO"});assert.deepEqual(db.state(),db.initial);});
}
for(const reason of ["caller","commit","auditBad","auditThrows","rollback"]){
  test("enqueue: rollback externo/critico - "+reason,async()=>{
    const db=fixture({challenges:[challenge()]},{failureAt:reason==="commit"?"COMMIT":reason==="rollback"?"enqueue:outbox":null,
      auditBad:reason==="auditBad",auditThrows:reason==="auditThrows",rollbackFails:reason==="rollback"});
    await assert.rejects(db.actual.tx(async tx=>{await db.service.enqueue(tx,args());if(reason==="caller")throw new Error("synthetic caller failure");}),reason==="rollback"?{code:"AUTH_ENQUEUE_ROLLBACK_FALHOU"}:undefined);
    assert.deepEqual(db.committed(),db.initial);
  });
}

test("enqueue: replay identico nao gera token, mensagem, quota ou auditoria duplicada",async t=>{
  const db=fixture();await db.actual.tx(tx=>db.service.enqueue(tx,args({ip:"192.0.2.1"})));const before=db.committed();
  t.mock.method(crypto,"randomBytes",()=>assert.fail("Replay nao pode gerar material novo"));
  assert.deepEqual(await db.actual.tx(tx=>db.service.enqueue(tx,args({ip:"::ffff:192.0.2.1"}))),RESULT);assert.deepEqual(db.committed(),before);
});

test("enqueue: replay apos envelope removido nao exige token nem reenvia",async()=>{
  const first=fixture();await first.actual.tx(tx=>first.service.enqueue(tx,args()));const state=first.committed();
  Object.assign(state.outbox[0],{status:"sent",conteudo_cifrado:null,nonce:null,auth_tag:null,key_id:null});
  const db=fixture(state);assert.deepEqual(await db.service.enqueue(db.executor,args()),RESULT);assert.deepEqual(db.state(),state);
});
for(const change of [{ip:"192.0.2.2"},{emissaoId:id(),finalidade:"alteracao",emailCandidato:"candidate@example.invalid"}]){
  test("enqueue: identidade divergente preserva todas estruturas - "+JSON.stringify(change),async()=>{
    const first=fixture();await first.actual.tx(tx=>first.service.enqueue(tx,args({ip:"192.0.2.1"})));const state=first.committed();
    if(change.finalidade==="alteracao")state.user.confirmado=true;
    const db=fixture(state);await assert.rejects(db.service.enqueue(db.executor,args({ip:"192.0.2.1",...change})),{code:"AUTH_ENQUEUE_IDENTIDADE_DIVERGENTE"});assert.deepEqual(db.state(),state);
  });
}
for(const missing of ["quota","outbox"]){
  test("enqueue: par incompleto apos retencao/manual - "+missing,async()=>{
    const first=fixture();await first.actual.tx(tx=>first.service.enqueue(tx,args()));const state=first.committed();state[missing]=[];
    const db=fixture(state);await assert.rejects(db.service.enqueue(db.executor,args()),{code:"AUTH_ENQUEUE_ESTADO_INCONSISTENTE"});assert.deepEqual(db.state(),state);
  });
}

test("enqueue: divergencia de destinatario e critica mesmo com replay de quota",async()=>{
  const user={id:7,email:"synthetic@example.invalid",auth_version:2,email_version:3,excluido:false,confirmado:true,cadastro_pendente:false};
  const first=fixture({user});await first.actual.tx(tx=>first.service.enqueue(tx,args({finalidade:"alteracao",emailCandidato:"candidate@example.invalid"})));
  const state=first.committed(),db=fixture(state);await assert.rejects(db.service.enqueue(db.executor,args({finalidade:"alteracao",emailCandidato:"other@example.invalid"})),{code:"AUTH_ENQUEUE_IDENTIDADE_DIVERGENTE"});assert.deepEqual(db.state(),state);
});

test("enqueue: concorrencia no mesmo executor e rejeitada antes de segunda emissao",async()=>{
  let unblock;const barrier=new Promise(resolve=>{unblock=resolve;});let entered;
  const reached=new Promise(resolve=>{entered=resolve;});
  const db=fixture({}, {onQuery:async tag=>{if(tag==="enqueue:user"){entered();await barrier;}}});
  const first=db.service.enqueue(db.executor,args());await reached;
  await assert.rejects(db.service.enqueue(db.executor,args({emissaoId:id(2)})),{code:"AUTH_ENQUEUE_EXECUTOR_REUTILIZADO"});unblock();await first;
  assert.equal(db.state().outbox.length,1);
});

test("enqueue: snapshot dos argumentos resiste a mutacao durante await",async()=>{
  const req=args();const db=fixture({}, {onQuery:tag=>{if(tag==="quota:lock"){req.emissaoId=id(8);req.finalidade="recuperacao";req.usuarioId=99;req.expectedEmailVersion=9;}}});
  await db.service.enqueue(db.executor,req);assert.equal(db.state().outbox[0].id,id());assert.equal(db.state().challenges[0].finalidade,"confirmacao");
});

test("enqueue: nonce repetido em envelope retido gera falha critica sem retry",async t=>{
  const prior={id:id(8),confirmacao_id:id(8),recuperacao_id:null,email_destino:"synthetic@example.invalid",key_id:"aes1",nonce:Buffer.alloc(12,4),auth_tag:Buffer.alloc(16),conteudo_cifrado:Buffer.from([1,2]),criada_em:OLD};
  const db=fixture({outbox:[prior],challenges:[challenge(8)]});t.mock.method(crypto,"randomBytes",size=>Buffer.alloc(size,4));
  await assert.rejects(db.service.enqueue(db.executor,args()),{code:"AUTH_ENQUEUE_NONCE_COLISAO"});assert.deepEqual(db.state(),db.initial);
  assert.equal(db.calls.filter(c=>c.tag==="enqueue:outbox").length,1);
});

let dbCase = 0;
for(const override of [{"enqueue:user":{rows:[{id:7,email:"bad",auth_version:2,email_version:3,excluido:false,confirmado:false,cadastro_pendente:false}]}},
  {"enqueue:user":{rows:[{id:7,email:"synthetic@example.invalid",auth_version:"2",email_version:3,excluido:false,confirmado:false,cadastro_pendente:false}]}},
  {"enqueue:user":{rows:[{id:7,email:"synthetic@example.invalid",auth_version:2,email_version:3,excluido:false,confirmado:null,cadastro_pendente:false}]}},
  {"enqueue:previous":{rows:[{id:id(9),criada_em:"2026-10-14T17:00:00.123456Z"}]}},
  {"enqueue:previous":{rows:[{id:id(9),criada_em:OLD},{id:id(8),criada_em:OLD}]}},
  {"enqueue:replay":{rows:[{},{}]}}]){
  test("enqueue: estado DB malformado/futuro falha fechado "+ ++dbCase,async()=>{const db=fixture({}, {overrides:override});await assert.rejects(db.service.enqueue(db.executor,args()),AuthEnqueueError);assert.deepEqual(db.state(),db.initial);});
}
for(const mode of [{active:false},{isolation:"repeatable read"},{isolation:"serializable"},{readOnly:"on"}]){
  test("enqueue: executor/transacao nao admitidos "+JSON.stringify(mode),async()=>{const db=fixture({},mode);await assert.rejects(db.service.enqueue(db.executor,args()),AuthEnqueueError);assert.deepEqual(db.state(),db.initial);});
}
for(const bad of [{usuarioId:"7"},{expectedAuthVersion:0},{expectedEmailVersion:"3"},{emissaoId:id()+"\n"},{finalidade:"other"},
  {emailCandidato:"candidate@example.invalid"},{finalidade:"alteracao",emailCandidato:"invalid"},{ip:"192.0.2.1,192.0.2.2"},{extra:true}]){
  test("enqueue: argumento invalido antes de SQL "+JSON.stringify(bad),async()=>{const db=fixture();await assert.rejects(db.service.enqueue(db.executor,args(bad)),{code:"AUTH_ENQUEUE_ARGUMENTO_INVALIDO"});assert.equal(db.calls.length,0);});
}
for(const executor of [null,{}, {query(){}}, {query(){},raw:{query(){}},client:{}}, {query(){},raw:{query(){}},pool:{}}]){
  test("enqueue: sem fallback para pool ou tx independente "+Object.keys(executor||{}).join(","),async()=>{const db=fixture();await assert.rejects(db.service.enqueue(executor,args()),{code:"AUTH_ENQUEUE_EXECUTOR_INVALIDO"});assert.equal(db.calls.length,0);});
}

test("enqueue: chaves AES/HMAC iguais ou configuracao incompleta sao rejeitadas",()=>{
  for(const options of [{}, {cryptoConfig:cfg()}, {cryptoConfig:cfg(),hmacConfig:{activeKeyId:"h",keys:[{keyId:"h",secret:cfg().keys[0].secret}]},registrarAuditoria(){}}])assert.throws(()=>createAuthEnqueueService(options),{code:"AUTH_ENQUEUE_CONFIG_INVALIDA"});
});

test("enqueue: ausencia de HMAC rejeita IP antes de SQL mas permite conta isolada",async()=>{
  const db=fixture();const audit=(p,tx)=>{assert.equal(tx.raw,db.executor.raw);return {ok:true,data:{id:1,usuario_id:p.usuario_id,entidade_id:p.entidade_id,acao:p.acao,modulo:p.modulo}};};
  const s=createAuthEnqueueService({cryptoConfig:cfg(),registrarAuditoria:audit});
  await assert.rejects(s.enqueue(db.executor,args({ip:"192.0.2.1"})),{code:"AUTH_ENQUEUE_CONFIG_INVALIDA"});assert.equal(db.calls.length,0);
  assert.deepEqual(await s.enqueue(db.executor,args()),RESULT);
});

test("enqueue: rotas/servicos antigos preservados, sem env/pool/SMTP ou token em resposta",()=>{
  for(const name of ["../routes/authPublicRoute.js","../controllers/authUsuarioController.js","../server.js"]){assert.doesNotMatch(fs.readFileSync(require.resolve(name),"utf8"),/authEnqueueService|authOutboxCrypto/);}
  for(const name of ["./authOutboxCrypto.js","./authEnqueueService.js"]){
    const source=fs.readFileSync(require.resolve(name),"utf8");assert.doesNotMatch(source,/process\.env|JWT_SECRET|console\.|nodemailer|require\(["']\.\.\/db/);
    assert.doesNotMatch(source,/query\(["'](?:BEGIN|COMMIT)["']/);
  }
});


for (const point of ["token-rng", "cipher", "nonce-rng"]) {
  test("enqueue: falha criptografica antes do INSERT restaura desafio anterior - " + point, async t => {
    const db = fixture({ challenges: [challenge()] });
    const random = crypto.randomBytes;
    if (point === "cipher") t.mock.method(crypto, "createCipheriv", () => { throw new Error("SYNTHETIC_DRIVER_SECRET"); });
    else t.mock.method(crypto, "randomBytes", size => {
      if (size === (point === "token-rng" ? 32 : 12)) throw new Error("SYNTHETIC_DRIVER_SECRET");
      return random(size);
    });
    await assert.rejects(db.service.enqueue(db.executor, args()), { code: "AUTH_ENQUEUE_FALHOU" });
    assert.deepEqual(db.state(), db.initial);
    assert.equal(db.calls.some(c => c.tag === "enqueue:challenge"), false);
    assert.equal(db.calls.some(c => c.tag === "enqueue:outbox"), false);
  });
}

test("enqueue: colisao de hash do token e critica e nao gera novo nonce/retry", async t => {
  const tokenHash = crypto.createHash("sha256").update(Buffer.alloc(32, 4).toString("base64url"), "ascii").digest();
  const db = fixture({ challenges: [challenge(8, { token_hash: tokenHash })] });
  const generated = [];
  t.mock.method(crypto, "randomBytes", size => { generated.push(size); return Buffer.alloc(size, 4); });
  await assert.rejects(db.service.enqueue(db.executor, args()), { code: "AUTH_ENQUEUE_FALHOU" });
  assert.deepEqual(db.state(), db.initial); assert.deepEqual(generated, [32, 12]);
});

test("enqueue: erro da auditoria real nao vaza destinatario, causa ou material criptografico", async () => {
  const db = fixture({}, { failureAt: "audit" });
  await assert.rejects(db.service.enqueue(db.executor, args()), { code: "AUTH_ENQUEUE_FALHOU" });
  assert.equal(db.logs.length, 1);
  assert.doesNotMatch(inspect(db.logs), /SYNTHETIC_DRIVER_SECRET|synthetic@example|token|nonce|key_id|detail|stack/);
  assert.deepEqual(db.state(), db.initial);
});

test("enqueue: desafios consumidos/invalidos preservados e somente novo aberto", async () => {
  const past = [challenge(8, { consumida_em: OLD }), challenge(9, { invalidada_em: OLD })];
  const db = fixture({ challenges: past });
  await db.service.enqueue(db.executor, args());
  assert.deepEqual(db.state().challenges.slice(0, 2), past);
  assert.equal(db.state().challenges.filter(c => c.consumida_em === null && c.invalidada_em === null).length, 1);
});

test("enqueue: alteracao para email oficial normalizado nao cria emissao", async () => {
  const user = { id: 7, email: "Synthetic@Example.invalid", auth_version: 2, email_version: 3, excluido: false, confirmado: true, cadastro_pendente: false };
  const db = fixture({ user });
  assert.deepEqual(await db.service.enqueue(db.executor, args({ finalidade: "alteracao", emailCandidato: "SYNTHETIC@EXAMPLE.INVALID" })), RESULT);
  assert.deepEqual(db.state(), db.initial);
});

test("enqueue: replay retido fora da janela nao e cobrado novamente", async () => {
  const first = fixture(); await first.actual.tx(tx => first.service.enqueue(tx, args()));
  const state = first.committed(); const db = fixture(state, { clock: "2026-10-16T17:00:00.123456Z" });
  assert.deepEqual(await db.service.enqueue(db.executor, args()), RESULT); assert.deepEqual(db.state(), state);
});

test("enqueue: timestamp ou versao do desafio em replay divergente falha fechado", async () => {
  const first = fixture(); await first.actual.tx(tx => first.service.enqueue(tx, args()));
  for (const corrupt of [s => { s.outbox[0].criada_em = OLD; }, s => { s.challenges[0].email_version_esperada = 4; }]) {
    const state = first.committed(); corrupt(state); const db = fixture(state);
    await assert.rejects(db.service.enqueue(db.executor, args()), AuthEnqueueError); assert.deepEqual(db.state(), state);
  }
});

test("enqueue: rejeita reutilizacao do executor mesmo apos negacao", async () => {
  const db = fixture({}, { deny: true }); await db.service.enqueue(db.executor, args());
  await assert.rejects(db.service.enqueue(db.executor, args({ emissaoId: id(2) })), { code: "AUTH_ENQUEUE_EXECUTOR_REUTILIZADO" });
  assert.deepEqual(db.state(), db.initial);
});

test("enqueue: configuracao HMAC incompleta em janela gera rollback sem emissoes", async () => {
  const q = { emissao_id: id(9), finalidade: "recuperacao", usuario_id: null, ip_hmac: Buffer.alloc(32), ip_hmac_key_id: "absent", registrada_em: NOW };
  const db = fixture({ quota: [q] });
  await assert.rejects(db.service.enqueue(db.executor, args({ ip: "192.0.2.1" })), { code: "AUTH_ENQUEUE_QUOTA_FALHOU" });
  assert.deepEqual(db.state(), db.initial);
});
