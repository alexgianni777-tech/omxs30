'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {dayDistance,evaluateReport,reviewLong,screenElite,renderElite,logElite}=require('./oraklet-quality');
const book=require('./report-quality.json');
const idx={above50:false};
const base={
  ticker:'SAAB-B.ST',name:'Saab',c:100,sma50:94,sma200:90,
  r21:5,rsi:63,rs21:8,rs63:7,vol:1.8,gap:0.3,atrAbs:3
};
const run=(changes={},date='2026-10-23',ref=book,calendar={})=>
  reviewLong({...base,...changes},idx,date,ref,calendar);
assert.equal(dayDistance('2026-10-23','2026-10-26'),3);
assert.equal(dayDistance('2026-10-26','2026-10-23'),-3);
assert.equal(dayDistance('2026-02-31','2026-03-01'),null);
assert.equal(evaluateReport('SAAB-B.ST','2026-10-22',book).status,'UNVERIFIED');
assert.equal(evaluateReport('HEXA-B.ST','2026-10-23',book).status,'STRONG');
assert.equal(evaluateReport('ERIC-B.ST','2026-10-23',book).status,'MIXED');
assert.equal(evaluateReport('UNKNOWN.ST','2026-10-23',book).status,'UNVERIFIED');
assert.equal(evaluateReport('SAAB-B.ST','2027-03-01',book).reason,'RAPPORT_FOR_GAMMAL');
assert.equal(run().status,'QUALIFIED');
assert.ok(run().score>60);
assert.equal(run({ticker:'UNKNOWN.ST'}).status,'WATCH');
assert.ok(run({ticker:'UNKNOWN.ST'}).reasons.includes('RAPPORTDATA_SAKNAS'));
assert.equal(run({rs21:1}).status,'WATCH');
assert.equal(run({sma200:101}).status,'WATCH');
assert.equal(run({rsi:79}).status,'WATCH');
assert.equal(run({gap:3.1}).status,'WATCH');
assert.equal(run({vol:0.5}).status,'WATCH');
assert.equal(run({rs21:3}).status,'WATCH'); // stricter in index headwind
assert.equal(reviewLong(base,{above50:true},'2026-10-23',book).status,'QUALIFIED');
assert.ok(run({atrAbs:null}).reasons.includes('DATA_OFULLSTANDIG'));
assert.ok(run({},'2026-10-23',book,{'SAAB-B.ST':'2026-10-27'}).reasons.includes('NY_RAPPORT_INOM_5_VARDAGAR'));
const results=screenElite([{...base},{...base,ticker:'HEXA-B.ST',name:'Hexagon',gap:3.9},{...base,ticker:'ERIC-B.ST',name:'Ericsson'}],idx,'2026-10-23',book);
assert.equal(results.qualified.length,1);
assert.equal(results.qualified[0].row.name,'Saab');
assert.ok(renderElite(results,'2026-10-23').includes('0B · ORAKLET TOPP 3'));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'oraklet-'));
try{
 const dest=path.join(tmp,'oraklet.csv');
 assert.equal(logElite('2026-10-26','2026-10-23',results.qualified,dest),1);
 assert.equal(logElite('2026-10-26','2026-10-23',results.qualified,dest),0);
 assert.equal(fs.readFileSync(dest,'utf8').trim().split('\n').length,2);
} finally{fs.rmSync(tmp,{recursive:true,force:true});}
console.log('Oraklet report/trend/relative strength tests passed');
