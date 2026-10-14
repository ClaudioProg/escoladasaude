"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs"),vm=require("node:vm"),path=require("node:path");
const {EventEmitter}=require("node:events");
const source=fs.readFileSync(path.join(__dirname,"authSmtpSender.js"),"utf8");
const CONFIG={host:"smtp.example.invalid",port:465,secure:true,smtpUser:"synthetic",smtpPass:"SYNTHETIC_SECRET",fromAddr:"from@example.invalid",fromName:"Escola"};
const MAIL={to:"synthetic@example.invalid",subject:"Teste",text:"SYNTHETIC_TOKEN"};
function fixture({enabled=true,config=CONFIG,spawnFail=false}={}){
 const children=[],calls=[],timers=[];
 const mod={exports:{}};
 const wrapper=vm.runInThisContext("(function(require,module,exports,__dirname,setTimeout,clearTimeout){"+source+"\n})");
 const child=new EventEmitter();child.pid=42;child.send=(value,callback)=>{calls.push(["ipc",value]);callback();};
 child.kill=signal=>{calls.push(["kill",signal]);return true;};
 wrapper(name=>name==="node:child_process"?{fork(file,args,opts){calls.push(["fork",file,args,opts]);if(spawnFail)throw new Error("SECRET");children.push(child);return child;}}:require(name),
 mod,mod.exports,__dirname,(fn,ms)=>{timers.push({fn,ms});return 1;},()=>calls.push(["clear"]));
 const transport=mod.exports.createAuthSmtpSender({getConfig:typeof config==="function"?config:()=>config,isEnabled:typeof enabled==="function"?enabled:()=>enabled});
 return {transport,child,calls,timers,module:mod.exports};
}
for(const option of [{enabled:false},{config:{}},{config:{...CONFIG,port:0}},{config:{...CONFIG,fromAddr:"multi@example.invalid,second@example.invalid"}}])test("inactive or invalid SMTP config causes zero spawn",async()=>{
 const f=fixture(option);assert.equal(f.transport.ready(),false);assert.equal((await f.transport.send(MAIL)).kind,"dry-run");assert.equal(f.calls.length,0);
});
for(const [kind,status] of [["accepted",null],["temporary",450],["permanent",550],["indeterminate",null]])test("controlled SMTP result only after process exit / "+kind,async()=>{
 const f=fixture();let resolved=false;const result=f.transport.send(MAIL).then(x=>{resolved=true;return x;});
 f.child.emit("message",{kind,smtpStatus:status,response:"RAW_SECRET",url:"SECRET"});await Promise.resolve();assert.equal(resolved,false);
 f.child.emit("exit",0);assert.deepEqual(await result,{kind,smtpStatus:status});
});
test("total duration terminates actual child, then waits exit (no Promise.race)",async()=>{
 const f=fixture();const result=f.transport.send(MAIL);assert.equal(f.transport.maxDurationMs,120000);assert.equal(f.timers[0].ms,115000);
 f.timers[0].fn();assert.ok(f.calls.some(x=>x[0]==="kill"&&x[1]==="SIGKILL"));f.child.emit("exit",null,"SIGKILL");assert.equal((await result).kind,"indeterminate");
});
test("shutdown kills subprocess, waits actual exit and disables sender",async()=>{
 const f=fixture();const result=f.transport.send(MAIL);let stopped=false;const stop=f.transport.cancel().then(()=>stopped=true);
 await Promise.resolve();assert.equal(stopped,false);assert.equal(f.transport.ready(),false);f.child.emit("exit",null,"SIGKILL");await stop;assert.equal((await result).kind,"indeterminate");
});
test("fork receives no secrets in args/environment/stdio; Windows helper hidden",async()=>{
 const f=fixture();const pending=f.transport.send(MAIL);const call=f.calls.find(x=>x[0]==="fork");assert.deepEqual(call[2],[]);
 assert.deepEqual(call[3].execArgv,[]);assert.equal(call[3].windowsHide,true);assert.deepEqual(call[3].stdio,["ignore","ignore","ignore","ipc"]);
 assert.equal(Object.hasOwn(call[3].env,"DATABASE_URL"),false);assert.equal(Object.hasOwn(call[3].env,"JWT_SECRET"),false);assert.equal(Object.hasOwn(call[3].env,"NODE_OPTIONS"),false);
 f.child.emit("exit",0);await pending;
});
test("spawn failure sanitized and no live operation retained",async()=>{const f=fixture({spawnFail:true});assert.equal((await f.transport.send(MAIL)).kind,"indeterminate");await f.transport.cancel();});
for(const extra of [{bcc:"copy@example.invalid"},{subject:"injected\r\nheader"},{to:"two@example.invalid,other@example.invalid"},{text:""}])test("malformed payload cannot launch SMTP / "+Object.keys(extra)[0],async()=>{
 const f=fixture();assert.equal((await f.transport.send({...MAIL,...extra})).kind,"indeterminate");assert.equal(f.calls.length,0);
});
test("untrusted child result is redacted",async()=>{const f=fixture();const pending=f.transport.send(MAIL);f.child.emit("message",{kind:"SECRET",smtpStatus:999,text:MAIL.text});f.child.emit("exit",0);assert.deepEqual(await pending,{kind:"indeterminate",smtpStatus:null});});
test("institutional mailer retains existing contract; auth factory is inert",()=>{
 const mailer=require("./mailer");assert.equal(typeof mailer.sendEmail,"function");assert.equal(typeof mailer.createAuthEmailSender,"function");
 const old=process.env.EMAIL_ENABLED;delete process.env.EMAIL_ENABLED;
 try {assert.equal(mailer.createAuthEmailSender().ready(),false);}finally{if(old===undefined)delete process.env.EMAIL_ENABLED;else process.env.EMAIL_ENABLED=old;}
});

function smtpProcess(sendMail) {
 const childSource=fs.readFileSync(path.join(__dirname,"authSmtpProcess.js"),"utf8");
 const listeners=new Map(),options=[],results=[],exits=[];
 const fakeProcess={once:(name,fn)=>listeners.set(name,fn),send:(result,callback)=>{results.push(result);callback();},exit:code=>exits.push(code)};
 const mod={exports:{}};
 vm.runInThisContext("(function(require,module,exports,process){"+childSource+"\n})")(
  name=>name==="nodemailer"?{createTransport:opts=>{options.push(opts);return {sendMail,close:()=>{}};}}:require(name),mod,mod.exports,fakeProcess);
 return {run:()=>listeners.get("message")({config:{...CONFIG},payload:{...MAIL}}),options,results,exits};
}
for(const [name,info,kind] of [
 ["accepted",{accepted:[MAIL.to],rejected:[]},"accepted"],
 ["dry-run",{accepted:[MAIL.to],rejected:[],dryRun:true},"indeterminate"],
 ["different recipient",{accepted:["wrong@example.invalid"],rejected:[]},"indeterminate"],
 ["multiple accepted",{accepted:[MAIL.to,"copy@example.invalid"],rejected:[]},"indeterminate"],
 ["rejected",{accepted:[],rejected:[MAIL.to]},"indeterminate"]
])test("SMTP child acceptance semantics / "+name,async()=>{
 const f=smtpProcess(async()=>info);await f.run();assert.equal(f.results[0].kind,kind);assert.deepEqual(f.exits,[0]);
});
for(const [code,kind] of [[421,"temporary"],[450,"temporary"],[499,"temporary"],[500,"permanent"],[550,"permanent"],[599,"permanent"],[null,"indeterminate"],[200,"indeterminate"],[600,"indeterminate"]])test("SMTP status classification / "+String(code),async()=>{
 const f=smtpProcess(async()=>{throw Object.assign(new Error("RAW_SMTP_SECRET"),{responseCode:code,response:"RAW_SMTP_SECRET"});});await f.run();
 assert.equal(f.results[0].kind,kind);assert.equal(JSON.stringify(f.results).includes("SECRET"),false);
});
test("isolated SMTP transport enforces TLS, timeouts and no logs/file/URL loading",async()=>{
 const f=smtpProcess(async()=>({accepted:[MAIL.to],rejected:[]}));await f.run();const opts=f.options[0];
 assert.equal(opts.pool,false);assert.equal(opts.logger,false);assert.equal(opts.debug,false);assert.equal(opts.tls.rejectUnauthorized,true);
 assert.equal(opts.disableFileAccess,true);assert.equal(opts.disableUrlAccess,true);
 assert.equal(opts.dnsTimeout,10000);assert.equal(opts.connectionTimeout,20000);assert.equal(opts.greetingTimeout,10000);assert.equal(opts.socketTimeout,30000);
});

const AUTH_ENV={AUTH_OUTBOX_WORKER_ENABLED:"true",AUTH_OUTBOX_WORKER_DRY_RUN:"false",EMAIL_ENABLED:"true",EMAIL_DRY_RUN:"false"};
function institutionalFixture(flags={}) {
 const env={NODE_ENV:"production",EMAIL_SMTP_HOST:CONFIG.host,EMAIL_SMTP_PORT:"465",EMAIL_SMTP_SECURE:"true",EMAIL_SMTP_USER:CONFIG.smtpUser,
  EMAIL_SMTP_PASS:CONFIG.smtpPass,EMAIL_FROM_ADDR:CONFIG.fromAddr,EMAIL_FROM_NAME:CONFIG.fromName,...AUTH_ENV,...flags};
 const module={exports:{}},legacyCalls=[];let smtp;
 const mailerSource=fs.readFileSync(path.join(__dirname,"mailer.js"),"utf8");
 vm.runInThisContext("(function(require,module,exports,process,console){"+mailerSource+"\n})")(
  name=>name==="nodemailer"?{createTransport:()=>{legacyCalls.push("transport");return {sendMail:async mail=>{legacyCalls.push(mail);return {accepted:[mail.to],rejected:[]};}};}}:
   name==="./authSmtpSender"?{createAuthSmtpSender:options=>{smtp=fixture({enabled:options.isEnabled,config:options.getConfig});return smtp.transport;}}:require(name),
  module,module.exports,{env},{info(){},log(){},warn(){},error(){}});
 return {api:module.exports,env,legacyCalls,smtp:()=>smtp};
}
const TRUE_REPS=[true,1,"true","TRUE","True","1","sim","SIM","s","yes","YES","y","on","ON"," On "];
const FALSE_REPS=[false,0,"false","FALSE","0","nao","NAO","não","NÃO","n","no","NO","off","OFF"," off "];
const INVALID_REPS=[undefined,""," ",null,"invalid","true,false","1.0",2,-1,NaN,Infinity,{},[]];
for(const name of ["EMAIL_DRY_RUN","AUTH_OUTBOX_WORKER_DRY_RUN"])for(const value of TRUE_REPS)test("institutional auth adapter cannot spawn on dry-run / "+name+" / "+String(value),async()=>{
 const f=institutionalFixture({[name]:value}),sender=f.api.createAuthEmailSender();assert.equal(sender.ready(),false);
 assert.equal((await sender.send(MAIL)).kind,"dry-run");assert.deepEqual(f.smtp().calls,[]);assert.deepEqual(f.legacyCalls,[]);
});
for(const name of Object.keys(AUTH_ENV))for(const value of INVALID_REPS)test("institutional auth adapter blocks absent/ambiguous flag / "+name+" / "+String(value),async()=>{
 const f=institutionalFixture({[name]:value}),sender=f.api.createAuthEmailSender();assert.equal(sender.ready(),false);
 assert.equal((await sender.send(MAIL)).kind,"dry-run");assert.deepEqual(f.smtp().calls,[]);
});
for(const value of TRUE_REPS)test("all recognized enables with explicit dry-run false can use simulated adapter / "+String(value),async()=>{
 const f=institutionalFixture({EMAIL_ENABLED:value,AUTH_OUTBOX_WORKER_ENABLED:value}),sender=f.api.createAuthEmailSender();assert.equal(sender.ready(),true);
 const result=sender.send(MAIL);f.smtp().child.emit("message",{kind:"accepted"});f.smtp().child.emit("exit",0);assert.equal((await result).kind,"accepted");
});
for(const value of FALSE_REPS)test("recognized false dry-run permits explicitly enabled simulated adapter / "+String(value),async()=>{
 const f=institutionalFixture({EMAIL_DRY_RUN:value,AUTH_OUTBOX_WORKER_DRY_RUN:value}),sender=f.api.createAuthEmailSender();assert.equal(sender.ready(),true);
 const result=sender.send(MAIL);f.smtp().child.emit("exit",0);await result;
});
for(const name of ["EMAIL_ENABLED","AUTH_OUTBOX_WORKER_ENABLED"])for(const value of FALSE_REPS)test("false enable cannot spawn / "+name+" / "+String(value),async()=>{
 const f=institutionalFixture({[name]:value}),sender=f.api.createAuthEmailSender();assert.equal((await sender.send(MAIL)).kind,"dry-run");assert.deepEqual(f.smtp().calls,[]);
});
test("adapter rechecks dry-run configured after readiness",async()=>{
 const f=institutionalFixture(),sender=f.api.createAuthEmailSender();assert.equal(sender.ready(),true);f.env.EMAIL_DRY_RUN="YES";
 assert.equal((await sender.send(MAIL)).kind,"dry-run");assert.deepEqual(f.smtp().calls,[]);
});
for(const value of TRUE_REPS)test("legacy sendEmail still honors recognized dry-run / "+String(value),async()=>{
 const f=institutionalFixture({EMAIL_DRY_RUN:value});const info=await f.api.sendEmail(MAIL);assert.equal(info.dryRun,true);assert.deepEqual(f.legacyCalls,[]);
});
for(const value of TRUE_REPS)test("legacy sendEmail recognized enable unaffected by V3 flags/defaults / "+String(value),async()=>{
 const f=institutionalFixture({EMAIL_ENABLED:value,EMAIL_DRY_RUN:undefined,AUTH_OUTBOX_WORKER_ENABLED:"invalid",AUTH_OUTBOX_WORKER_DRY_RUN:"SIM"});
 const info=await f.api.sendEmail(MAIL);assert.deepEqual(info.accepted,[MAIL.to]);assert.equal(f.legacyCalls.length,2);
});
