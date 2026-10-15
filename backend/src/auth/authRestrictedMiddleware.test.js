"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm"),path=require("node:path");
const jwt=require("jsonwebtoken");
const {fixture,TOKEN,SID}=require("../services/authRestrictedContext.fixture");
const {createRestrictedContextMiddleware,STATUS_PATH}=require("./authRestrictedMiddleware");
const VERSION=require("./authVersion");
const SECRET="synthetic-etapa13-no-production";
function response(done=()=>{}) {
 const res={locals:{},statusCode:200,headers:{},status(code){this.statusCode=code;return this;},
  setHeader(name,value){this.headers[name]=value;},getHeader(name){return this.headers[name];},
  set(name,value){this.setHeader(name,value);return this;},get(name){return this.getHeader(name);},
  json(body){this.body=body;done(this);return this;},sendStatus(code){this.statusCode=code;done(this);return this;},
  end(){done(this);return this;}};
 return res;
}
async function check(f,{method="GET",url=STATUS_PATH,cookie="escola_saude_session="+TOKEN,identity=null,enabled=()=>true,production=false}={}) {
 const req={method,originalUrl:url,headers:cookie===null?{}:{cookie},user:{id:99,perfil:"administrador"},body:{regularizado:true,perfil:"gestor"}};
 const res=response();let next=0;
 await createRestrictedContextMiddleware({service:f.service,enabled,isProduction:production})(req,res,()=>next++,identity);
 return {req,res,next};
}
test("only exact read operation accepts verified cookie; body cannot grant regularized state",async()=>{
 const f=fixture(),out=await check(f);
 assert.equal(out.next,1);assert.equal(out.req.restrictedContext.restricted,true);
 assert.equal(out.req.restrictedContext.progress.politicasComprovadas,false);
});
for(const method of ["POST","PUT","PATCH","DELETE","HEAD","OPTIONS"])
test("method outside allowlist / "+method,async()=>{const out=await check(fixture(),{method});assert.equal(out.next,0);assert.equal(out.res.statusCode,403);});
for(const url of ["/api/perfil/me","/api/perfil/opcao","/api/auth/redefinir-senha","/api/auth/qualquer",
 STATUS_PATH+"/",STATUS_PATH+"/extra","/API/auth/contexto-restrito","/api/auth/%63ontexto-restrito",
 "/api/dashboard","/api/agenda","/api/relatorio","/api/usuario/7"])
test("path outside exact allowlist / "+url,async()=>{
 const f=fixture(),out=await check(f,{url});assert.equal(out.next,0);assert.equal(out.res.statusCode,403);
 assert.equal(f.calls.some(call=>call.tag==="touch"),false);
});
for(const cookie of [null,"escola_saude_session=invalid","escola_saude_session=",
 "escola_saude_session="+TOKEN+"; escola_saude_session=other"])
test("absent/invalid/ambiguous cookie never authenticates / "+String(cookie),async()=>{
 const out=await check(fixture(),{cookie});assert.equal(out.next,0);assert.equal(out.res.statusCode,401);
});
test("production requires official Host cookie",async()=>{
 let out=await check(fixture(),{production:true});assert.equal(out.res.statusCode,401);
 out=await check(fixture(),{production:true,cookie:"__Host-escola_saude_session="+TOKEN});assert.equal(out.next,1);
});
test("default disabled barrier has no DB side effects; invalid config fails closed",async()=>{
 const f=fixture();let out=await check(f,{enabled:()=>false,cookie:null});assert.equal(out.next,1);assert.equal(f.calls.length,0);
 out=await check(f,{enabled:()=>"true"});assert.equal(out.next,0);assert.equal(out.res.statusCode,503);
});
test("legacy diagnostic cannot authorize after a failed D2 gate",async()=>{
 const f=fixture();f.fail="user";const out=await check(f);
 assert.equal(out.next,0);assert.equal(out.res.statusCode,503);
 const mod={exports:{}};
 vm.runInThisContext("(function(require,module,exports,console){"+fs.readFileSync(path.join(__dirname,"forcarAtualizacaoCadastro.js"),"utf8")+"\n})")(
  name=>name==="../db"?{query:async()=>{throw new Error("SENSITIVE");}}:require(name),mod,mod.exports,{warn(){},error(){}});
 let diagnosticNext=0;await mod.exports({userId:7},response(),()=>diagnosticNext++);
 assert.equal(diagnosticNext,1); // Diagnostico legado e permissivo, mas nao e chamado como autorizador D2.
 assert.equal(out.next,0);
});
function authFixture({flag="true",mode="bridge",cookie=true}={}) {
 const f=fixture(),logs=[];
 const env={NODE_ENV:"test",JWT_SECRET:SECRET,AUTH_VERSION_MODE:mode,AUTH_RESTRICTED_CONTEXT_ENABLED:flag};
 const version={...VERSION,getAuthVersionMode:()=>env.AUTH_VERSION_MODE};
 const barrier=createRestrictedContextMiddleware({service:f.service,enabled:()=>env.AUTH_RESTRICTED_CONTEXT_ENABLED==="true"});
 const mod={exports:{}};
 vm.runInThisContext("(function(require,module,exports,process,console){"+fs.readFileSync(path.join(__dirname,"authMiddleware.js"),"utf8")+"\n})")(
  name=>name==="jsonwebtoken"?jwt:name==="./authVersion"?version:name==="../db"?{query:async()=>({rows:[{id:7,perfil:"administrador",deleted_at:null,auth_version:f.state.user.auth_version}]})}:
   name==="./authRestrictedMiddleware"?{enforceRestrictedContext:barrier}:require(name),
  mod,mod.exports,{env},{warn:(...args)=>logs.push(args),error:(...args)=>logs.push(args)});
 const sign=(payload={},options={})=>jwt.sign({sub:"7",perfil:"administrador",auth_version:1,...payload},SECRET,{expiresIn:"1d",...options});
 return {f,logs,env,auth:mod.exports,sign,headers:()=>({authorization:"Bearer "+sign(),...(cookie?{cookie:"escola_saude_session="+TOKEN}:{})})};
}
for(const admin of [false,true])for(const withCookie of [false,true])
test("official Bearer entry denies normal modules without role bypass / "+admin+"/"+withCookie,async()=>{
 const a=authFixture({cookie:withCookie}),req={method:"GET",originalUrl:"/api/dashboard",headers:a.headers()},res=response();let next=0;
 await (admin?a.auth.authAdmin:a.auth)(req,res,()=>next++);
 assert.equal(next,0);assert.equal(res.statusCode,403);
});
for(const [payload,options,status] of [[{auth_version:2},{},401],[{},{expiresIn:-1},401],[{auth_version:"1"},{},401]])
test("invalid/expired/divergent JWT cannot use cookie fallback / "+JSON.stringify(payload)+JSON.stringify(options),async()=>{
 const a=authFixture(),req={method:"GET",originalUrl:STATUS_PATH,headers:{...a.headers(),authorization:"Bearer "+a.sign(payload,options)}},res=response();let next=0;
 await a.auth(req,res,()=>next++);assert.equal(next,0);assert.equal(res.statusCode,status);assert.equal(a.f.calls.length,0);
});
test("bridge JWT without version still cannot bypass D2 or authorize Bearer-only status",async()=>{
 const a=authFixture({cookie:false});const token=jwt.sign({sub:"7",perfil:"usuario"},SECRET,{expiresIn:"1d"});
 const res=response();let next=0;await a.auth({method:"GET",originalUrl:STATUS_PATH,headers:{authorization:"Bearer "+token}},res,()=>next++);
 assert.equal(next,0);assert.equal(res.statusCode,403);
});
test("matching valid Bearer/cookie authorizes only status",async()=>{
 const a=authFixture(),res=response();let next=0;
 await a.auth({method:"GET",originalUrl:STATUS_PATH,headers:a.headers()},res,()=>next++);
 assert.equal(next,1);assert.equal(res.statusCode,200);
});
test("disabled Bearer integration preserves legacy contract",async()=>{
 const a=authFixture({flag:undefined});delete a.env.AUTH_RESTRICTED_CONTEXT_ENABLED;
 const res=response();let next=0;const req={headers:a.headers()};
 await a.auth(req,res,()=>next++);assert.equal(next,1);assert.deepEqual(req.user,{id:7,perfil:"administrador"});
 assert.equal(a.f.calls.length,0);
});
test("valid cookie origin also passes through D2 before authorization",async()=>{
 const f=fixture(),mod={exports:{}};
 const barrier=createRestrictedContextMiddleware({service:f.service,enabled:()=>true});
 vm.runInThisContext("(function(require,module,exports,process){"+fs.readFileSync(path.join(__dirname,"authSessionMiddleware.js"),"utf8")+"\n})")(
  name=>name==="./authRestrictedMiddleware"?{enforceRestrictedContext:barrier}:require(name),mod,mod.exports,{env:{AUTH_RESTRICTED_CONTEXT_ENABLED:"true"}});
 const middleware=mod.exports.createAuthSessionMiddleware({sessionService:{validateSession:async()=>({id:7,perfis:["usuario","gestor","administrador"],areaAtiva:"gestor",sessionId:SID}),touchSession:async()=>{}}});
 const res=response();let next=0;await middleware({method:"GET",originalUrl:"/api/relatorio",headers:{cookie:"escola_saude_session="+TOKEN}},res,()=>next++);
 assert.equal(next,0);assert.equal(res.statusCode,403);
});
function loadRoute(name,a,controllers=[]) {
 const mod={exports:{}};
 const controller=new Proxy({},{get:(_object,key)=>key==="then"?undefined:(_req,res)=>{controllers.push(key);return res.status(200).json({ok:true});}});
 vm.runInThisContext("(function(require,module,exports,process,console){"+fs.readFileSync(path.join(__dirname,"../routes",name+".js"),"utf8")+"\n})")(
  request=>request==="express"?require("express"):request==="express-rate-limit"?(()=>((_req,_res,next)=>next())):
   request==="../auth/authMiddleware"?a.auth:request==="../auth/authVersion"?{...VERSION,getAuthVersionMode:()=>"bridge"}:
   request==="../auth/authRestrictedMiddleware"?{enforceRestrictedContext:createRestrictedContextMiddleware({service:a.f.service,enabled:()=>true})}:
   request.startsWith("../controllers/")?controller:request==="../middlewares/authorize"?{authorize:()=>((_req,_res,next)=>next())}:require(request),
  mod,mod.exports,{env:a.env},{log(){},warn(){},error(){}});
 return {router:mod.exports,controllers};
}
function requestRoute(router,url,originalUrl,headers={},method="GET") {
 return new Promise((resolve,reject)=>{
  const req={method,url,originalUrl,headers,baseUrl:"",params:{},query:{},socket:{remoteAddress:"127.0.0.1"}};
  const res=response(resolve);router.handle(req,res,error=>error?reject(error):resolve({...res,fallthrough:true}));
 });
}
for(const [name,url,originalUrl] of [["dashboardRoute","/","/api/dashboard"],["agendaRoute","/","/api/agenda"],
 ["perfilRoute","/me","/api/perfil/me"],["eventoRoute","/para-mim","/api/evento/para-mim"]])
test("direct request through actual Express route chain / "+name,async()=>{
 const a=authFixture(),route=loadRoute(name,a);const out=await requestRoute(route.router,url,originalUrl,a.headers());
 assert.equal(out.statusCode,403);assert.equal(route.controllers.length,0);
});
for(const [name,url,originalUrl] of [["perfilRoute","/opcao","/api/perfil/opcao"],["eventoRoute","/13/folder","/api/evento/13/folder"]])
test("legitimate public endpoint remains public / "+name,async()=>{
 const a=authFixture(),route=loadRoute(name,a);const out=await requestRoute(route.router,url,originalUrl);
 assert.equal(out.statusCode,200);assert.equal(route.controllers.length,1);assert.equal(a.f.calls.length,0);
});
test("new status route validates cookie-only and never silently ignores provided JWT",async()=>{
 let a=authFixture(),route=loadRoute("authRestrictedRoute",a);
 let out=await requestRoute(route.router,"/contexto-restrito",STATUS_PATH,{cookie:"escola_saude_session="+TOKEN});
 assert.equal(out.statusCode,200);assert.equal(out.body.data.restricted,true);
 a=authFixture();route=loadRoute("authRestrictedRoute",a);
 out=await requestRoute(route.router,"/contexto-restrito",STATUS_PATH,{cookie:"escola_saude_session="+TOKEN,authorization:"Bearer expired"});
 assert.equal(out.statusCode,401);assert.equal(a.f.calls.length,0);
});
test("new status route disabled by default; absent authentication is denied when enabled",async()=>{
 const a=authFixture(),route=loadRoute("authRestrictedRoute",a);delete a.env.AUTH_RESTRICTED_CONTEXT_ENABLED;
 let out=await requestRoute(route.router,"/contexto-restrito",STATUS_PATH);assert.equal(out.statusCode,404);
 a.env.AUTH_RESTRICTED_CONTEXT_ENABLED="true";out=await requestRoute(route.router,"/contexto-restrito",STATUS_PATH);
 assert.equal(out.statusCode,401);
});
test("new service/middleware log no raw secrets on database failures",async()=>{
 const a=authFixture();a.f.fail="context";const req={method:"GET",originalUrl:STATUS_PATH,headers:a.headers()},res=response();
 await a.auth(req,res,()=>assert.fail("cannot continue"));
 assert.equal(res.statusCode,503);
 const printed=JSON.stringify({logs:a.logs,response:res.body});
 for(const value of [TOKEN,"11111111111","synthetic@example.invalid","SECRET","token_hash","SELECT"])assert.equal(printed.includes(value),false);
});

for(const caseName of ["conflict","expired","match"])
test("cookie middleware revalidates provided Bearer / "+caseName,async()=>{
 const a=authFixture(),f=a.f,mod={exports:{}};
 const bearer=caseName==="expired"?{ok:false,response:null}:{ok:true,user:{id:caseName==="conflict"?8:7},decoded:{auth_version:1}};
 let res;
 vm.runInThisContext("(function(require,module,exports,process){"+fs.readFileSync(path.join(__dirname,"authSessionMiddleware.js"),"utf8")+"\n})")(
  name=>name==="./authRestrictedMiddleware"?{enforceRestrictedContext:createRestrictedContextMiddleware({service:f.service,enabled:()=>true})}:
   name==="./authMiddleware"?{authenticateRequest:async()=>caseName==="expired"?{ok:false,response:res.status(401).json({code:"AUTH-401-TOKEN-EXPIRADO"})}:bearer}:
   name==="./authVersion"?{...VERSION,getAuthVersionMode:()=>"bridge"}:require(name),
  mod,mod.exports,{env:{AUTH_RESTRICTED_CONTEXT_ENABLED:"true"}});
 const middleware=mod.exports.createAuthSessionMiddleware({sessionService:{validateSession:async()=>({id:7,perfis:["usuario","administrador"],areaAtiva:"usuario",sessionId:SID}),touchSession:async()=>{}}});
 res=response();let next=0;
 const req={method:"GET",originalUrl:STATUS_PATH,headers:{cookie:"escola_saude_session="+TOKEN,authorization:"Bearer synthetic"}};
 await middleware(req,res,()=>next++);
 assert.equal(next,caseName==="match"?1:0);assert.equal(res.statusCode,caseName==="match"?200:401);
 if(caseName==="match")assert.deepEqual(req.user,{id:7,perfis:["usuario","administrador"],areaAtiva:"usuario",sessionId:SID});
 else assert.equal(f.calls.length,0);
});
test("Bearer entry cannot ignore an invalid cookie or different persisted cookie identity",async()=>{
 const a=authFixture();
 for(const [authorization,cookie] of [
  ["Bearer "+a.sign(),"escola_saude_session=invalid"],
  ["Bearer "+a.sign(),"escola_saude_session="+TOKEN+"; escola_saude_session=other"],
 ]){
  const res=response();let next=0;await a.auth({method:"GET",originalUrl:STATUS_PATH,headers:{authorization,cookie}},res,()=>next++);
  assert.equal(next,0);assert.equal(res.statusCode,401);
 }
});
for(const method of ["POST","PUT","HEAD","DELETE"])
test("new Express status route refuses other operations / "+method,async()=>{
 const a=authFixture(),route=loadRoute("authRestrictedRoute",a);
 const out=await requestRoute(route.router,"/contexto-restrito",STATUS_PATH,{cookie:"escola_saude_session="+TOKEN},method);
 assert.equal(out.statusCode,403);
});
test("verified Bearer requests and bound session reject account changes since authentication",async()=>{
 const a=authFixture();a.f.state.user.auth_version=2;
 const out=await requestRoute(loadRoute("authRestrictedRoute",a).router,"/contexto-restrito",STATUS_PATH,a.headers());
 assert.equal(out.statusCode,401);
});
