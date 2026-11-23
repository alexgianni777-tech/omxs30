'use strict';
const assert=require('node:assert/strict');
const {AS_OF_2026_11_02,getMembersForSession,exceptionsForSession}=require('./omxs30-membership');
const fs=require('node:fs');
assert.equal(AS_OF_2026_11_02.length,30);
const nov=getMembersForSession('2026-11-20').map(x=>x[0]);
assert.equal(new Set(nov).size,30);
for(const t of ['ADDT-B.ST','INDU-C.ST','LIFCO-B.ST','SKA-B.ST','EPI-A.ST'])
  assert.ok(nov.includes(t),t);
for(const t of ['GETI-B.ST','ELUX-B.ST','SSAB-A.ST','ALIV-SDB.ST','NVDA','SOBI.ST'])
  assert.ok(!nov.includes(t),t);
const dec=getMembersForSession('2026-12-01').map(x=>x[0]);
assert.equal(dec.length,30);
assert.ok(dec.includes('SOBI.ST')&&!dec.includes('LIFCO-B.ST'));
assert.ok(exceptionsForSession('2026-11-26').some(x=>x.symbol==='SKFVER-B.ST'));
assert.equal(exceptionsForSession('2026-12-01').length,0);
assert.throws(()=>getMembersForSession('2024-01-02'));
const source=fs.readFileSync(require('node:path').join(__dirname,'omxs30-screener.js'),'utf8');
assert.match(source,/getMembersForSession\(constituentAsOf\)/);
assert.match(source,/const constituentAsOf = selectedReportDay;/,
 'constituent must be eligible on trade decision day, not yesterday’s price bar');
console.log('OMXS30 official membership policy tests passed');
