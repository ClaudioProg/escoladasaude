"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { fixture, START, stamp, micros } = require("./authRestrictedContext.fixture");
function setup() {
  const f = fixture();
  f.state.session.ultimo_uso_em = START;
  f.state.session.expira_em = stamp(micros(START) + 1800000000n);
  return f;
}
test("D2 consecutive operations renew context without premature normal session writes", async () => {
  const f = setup(), original = structuredClone(f.state.session), absolute = f.state.context.limite_absoluto_em;
  for (const [seconds, extra] of [[0,0n],[1,0n],[59,999999n]]) {
    f.at(seconds,extra);const out = await f.access();
    assert.equal(out.permitted,true);
    assert.equal(f.state.context.ultimo_uso_em,f.now());
    assert.equal(out.absoluteExpiresAt,absolute);
    assert.deepEqual(f.state.session,original);
    assert.equal(f.sessionWrites,0);
  }
});
for (const [seconds, extra, expected] of [[59,999999n,0],[60,0n,1],[60,1n,1]])
test("D2 normal touch strict 60-second boundary / "+seconds+"/"+extra, async () => {
  const f = setup();f.at(seconds,extra);
  assert.equal((await f.access()).permitted,true);
  assert.equal(f.sessionWrites,expected);
  assert.equal(f.state.session.ultimo_uso_em,expected ? f.now() : START);
});
test("D2 starts a new 60-second interval only after a written session touch", async () => {
  const f=setup();
  for(const [seconds,extra,writes] of [[60,0n,1],[61,0n,1],[119,999999n,1],[120,0n,2]]) {
    f.at(seconds,extra);assert.equal((await f.access()).permitted,true);assert.equal(f.sessionWrites,writes);
    assert.equal(f.state.context.ultimo_uso_em,f.now());
  }
});
test("concurrent D2 calls write the normal session only once when touch is due",async()=>{
 const f=setup();f.at(60);
 const out=await Promise.all([f.access(),f.access(),f.access()]);
 assert.ok(out.every(value=>value.permitted));assert.equal(f.sessionWrites,1);
 assert.deepEqual(f.calls.filter(call=>["user","session","context"].includes(call.tag)).map(call=>call.tag),
  Array(3).fill(["user","session","context"]).flat());
});
for(const kind of ["expired","revoked","absolute"])
for(const due of [false,true])
test("invalid normal session is rejected regardless of touch being due / "+kind+"/"+due,async()=>{
 const f=setup();f.at(due?60:1);const now=f.now();
 if(kind==="expired")f.state.session.expira_em=now;
 if(kind==="revoked")f.state.session.revogada_em=now;
 if(kind==="absolute")f.state.session.limite_absoluto_em=now;
 const before=structuredClone(f.state);
 await assert.rejects(f.access(),{code:"AUTH_RESTRICTED_INVALID"});
 assert.deepEqual(f.state,before);assert.equal(f.sessionWrites,0);
});
for(const kind of ["expired","revoked","absolute"])
test("final normal session revalidation rolls back D2 even when no touch is due / "+kind,async()=>{
 const f=setup();f.at(1);const before=structuredClone(f.state);
 f.onQuery=(tag,_params,staged)=>{
  if(tag!=="touch-session")return;
  if(kind==="expired")staged.session.expira_em=f.now();
  if(kind==="revoked")staged.session.revogada_em=f.now();
  if(kind==="absolute")staged.session.limite_absoluto_em=f.now();
 };
 await assert.rejects(f.access(),{code:"AUTH_RESTRICTED_INVALID"});
 assert.deepEqual(f.state,before);assert.equal(f.sessionWrites,0);
});
test("due session touch respects the normal absolute deadline without changing D2 absolute",async()=>{
 const f=setup();f.at(60);
 const absolute=stamp(micros(START)+90000000n);
 f.state.session.limite_absoluto_em=absolute;
 assert.equal((await f.access()).permitted,true);
 assert.equal(f.sessionWrites,1);assert.equal(f.state.session.expira_em,absolute);
 assert.equal(f.state.context.limite_absoluto_em,stamp(micros(START)+7200000000n));
});
for(const seconds of [1,60])
test("normal touch statement failure rolls back both records / "+seconds,async()=>{
 const f=setup();f.at(seconds);f.fail="touch-session";const before=structuredClone(f.state);
 await assert.rejects(f.access(),{code:"AUTH_RESTRICTED_FAILURE"});
 assert.deepEqual(f.state,before);assert.equal(f.sessionWrites,0);
});
test("session touch shares canonical constants and distinguishes valid from written",async()=>{
 const {IDLE_MS,TOUCH_MS}=require("./authSessionService");
 const f=setup();f.at(1);await f.access();
 const call=f.calls.find(value=>value.tag==="touch-session");
 assert.match(call.sql,/AS valid/);assert.match(call.sql,/AS written/);
 assert.equal(call.params[2],IDLE_MS);assert.equal(call.params[3],TOUCH_MS);
 assert.match(call.sql,/locked\.ultimo_uso_em <= \$2::timestamptz - \$4::bigint \* interval '1 millisecond'/);
 assert.equal(call.sql.slice(call.sql.lastIndexOf("SELECT EXISTS")).includes("$4"),false);
 assert.equal(f.sessionWrites,0);
});

test("commit failure rolls back the D2 renewal and the due normal touch together",async()=>{
 const f=setup();f.at(60);f.fail="commit";const before=structuredClone(f.state);
 await assert.rejects(f.access(),{code:"AUTH_RESTRICTED_FAILURE"});
 assert.deepEqual(f.state,before);assert.equal(f.sessionWrites,0);
});
