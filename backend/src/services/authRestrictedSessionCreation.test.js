"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm"),path=require("node:path");
const source=fs.readFileSync(path.join(__dirname,"authSessionService.js"),"utf8");
function setup(flag,failContext=false) {
 const calls=[];let committed=false,rolledBack=false;
 const query=async(sql,params=[])=>{
  calls.push({sql,params});
  if(sql.includes("SELECT id, auth_version"))return {rows:[{id:7,auth_version:1}]};
  if(sql.includes("SELECT perfil_codigo"))return {rows:[{perfil_codigo:"usuario"}]};
  if(sql.includes("restricted:initialize")){
   if(failContext)throw new Error("SENSITIVE_FIXTURE");
   return {rows:[{sessao_id:params[0]}],rowCount:1};
  }
  return {rows:[],rowCount:0};
 };
 const raw={query},db={tx:async fn=>{try{const out=await fn({query,raw,client:raw});committed=true;return out;}catch(error){rolledBack=true;throw error;}}};
 const mod={exports:{}};
 vm.runInThisContext("(function(require,module,exports,process){"+source+"\n})")(require,mod,mod.exports,{env:{AUTH_RESTRICTED_CONTEXT_ENABLED:flag}});
 return {service:mod.exports.createAuthSessionService({db,now:()=>new Date()}),calls,get committed(){return committed;},get rolledBack(){return rolledBack;}};
}
for(const persistent of [false,true])test("fresh authentication atomically binds D2 and preserves normal session limits / "+persistent,async()=>{
 const f=setup("true");const made=await f.service.createSession({usuarioId:7,expectedAuthVersion:1,manterConectado:persistent});
 const context=f.calls.find(call=>call.sql.includes("restricted:initialize"));
 const inserted=f.calls.findIndex(call=>call.sql.includes("INSERT INTO public.auth_sessao"));
 assert.ok(context);assert.ok(f.calls.indexOf(context)>inserted);
 assert.deepEqual(context.params,[made.session.id,7,1]);assert.equal(f.committed,true);
 assert.equal(made.session.limiteAbsolutoEm===null,!persistent);
 if(persistent)assert.equal(made.session.limiteAbsolutoEm-made.session.criadaEm,30*24*60*60*1000);
});
test("disabled feature never references new persistence",async()=>{
 const f=setup(undefined);await f.service.createSession({usuarioId:7,expectedAuthVersion:1});
 assert.equal(f.calls.some(call=>call.sql.includes("restricted:initialize")),false);
});
test("context persistence failure aborts session transaction",async()=>{
 const f=setup("true",true);await assert.rejects(f.service.createSession({usuarioId:7,expectedAuthVersion:1}));
 assert.equal(f.committed,false);assert.equal(f.rolledBack,true);
});
test("ambiguous activation aborts authentication instead of bypassing new barrier",async()=>{
 const f=setup("TRUE");await assert.rejects(f.service.createSession({usuarioId:7,expectedAuthVersion:1}),{code:"AUTH_RESTRICTED_CONFIG"});
 assert.equal(f.committed,false);assert.equal(f.rolledBack,true);
});
