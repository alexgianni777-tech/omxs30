'use strict';
const assert = require('node:assert/strict');
const { validateAndAggregateIntraday, localMarketTime } = require('./intraday-quality');

function makeBars(date, firstMinute=540, lastMinute=1045, omissions=new Set()) {
  const timestamp=[], open=[], high=[], low=[], close=[], volume=[];
  for (let m=firstMinute; m<=lastMinute; m+=5) {
    if (omissions.has(m)) continue;
    const hh=String(Math.floor(m/60)).padStart(2,'0');
    const mm=String(m%60).padStart(2,'0');
    const offset=date<'2026-10-25'?'+02:00':'+01:00';
    timestamp.push(Date.parse(date+'T'+hh+':'+mm+':00'+offset)/1000);
    open.push(100);high.push(101);low.push(99);close.push(100.2);volume.push(350);
  }
  return { timestamp, quote:{open,high,low,close,volume} };
}
function aggregate(data,date='2026-10-28',ticker='ABB.ST') {
  return validateAndAggregateIntraday(data.timestamp,data.quote,date,ticker);
}
const good=makeBars('2026-10-28');
const result=aggregate(good);
assert.equal(result.o,100);assert.equal(result.h,101);assert.equal(result.c,100.2);
assert.equal(result.v,350*102);
assert.deepEqual(localMarketTime(good.timestamp[0]),{date:'2026-10-28',minuteOfDay:540});
assert.equal(aggregate(makeBars('2026-10-23'),'2026-10-23').o,100);
assert.throws(()=>aggregate(makeBars('2026-10-28',540,540)),/DATA_NOT_READY: ofullständig intradag/);
assert.throws(()=>aggregate(makeBars('2026-10-28',600)),/ofullständig intradag/);
assert.throws(()=>aggregate(makeBars('2026-10-28',540,900)),/ofullständig intradag/);
const gap=new Set();for(let m=720;m<780;m+=5)gap.add(m);
assert.throws(()=>aggregate(makeBars('2026-10-28',540,1045,gap)),/intradagslucka/);
const sparse=new Set();for(let m=600;m<900;m+=5)sparse.add(m);
assert.throws(()=>aggregate(makeBars('2026-10-28',540,1045,sparse)),/ofullständig intradag|intradagslucka/);
const dup=structuredClone(good);dup.timestamp.push(dup.timestamp[20]);
dup.quote.open.push(100);dup.quote.high.push(101);dup.quote.low.push(99);
dup.quote.close.push(100.2);dup.quote.volume.push(350);
assert.throws(()=>aggregate(dup),/dubbla intradagsstaplar/);
const bad=structuredClone(good);bad.quote.high[3]=99;
assert.throws(()=>aggregate(bad),/ogiltigt OHLCV/);
const badVol=structuredClone(good);badVol.quote.volume[15]=-1;
assert.throws(()=>aggregate(badVol),/ogiltigt OHLCV/);
const noVol=structuredClone(good);noVol.quote.volume.fill(null);
assert.throws(()=>aggregate(noVol),/ofullständig volymdata/);
assert.equal(aggregate(noVol,'2026-10-28','^OMX').v,0);
const partial=structuredClone(good);partial.quote.volume.fill(null,0,30);
assert.throws(()=>aggregate(partial),/ofullständig volymdata/);
const extra=structuredClone(good);
extra.timestamp.push(Date.parse('2026-10-28T08:45:00+01:00')/1000);
extra.quote.open.push(100);extra.quote.high.push(101);extra.quote.low.push(99);
extra.quote.close.push(100.2);extra.quote.volume.push(350);
assert.equal(aggregate(extra).v,result.v);
console.log('Intraday quality tests passed');
