'use strict';
const assert=require('node:assert/strict');
const {selectCompletedDailyBar}=require('./daily-quality');
const ts=d=>Math.floor(Date.parse(d+'T16:30:00+01:00')/1000);
const rows=['2026-11-25','2026-11-26','2026-11-27'].map(ts);
const quote={open:[90,100,105],high:[92,103,106],low:[89,98,104],close:[91,101,105],volume:[500,900,100]};
assert.deepEqual(selectCompletedDailyBar(rows,quote,'2026-11-26','ABB.ST'),{t:rows[1],o:100,h:103,l:98,c:101,v:900});
assert.equal(selectCompletedDailyBar(rows,quote,'2026-11-24','ABB.ST'),null); // do NOT take D-2
assert.equal(selectCompletedDailyBar(rows,quote,'2026-11-28','ABB.ST'),null); // do NOT take future
const invalid=structuredClone(quote);invalid.high[1]=99;
assert.throws(()=>selectCompletedDailyBar(rows,invalid,'2026-11-26','ABB.ST'),/invalid recent daily OHLCV/);
const zero=structuredClone(quote);zero.volume[1]=0;
assert.throws(()=>selectCompletedDailyBar(rows,zero,'2026-11-26','ABB.ST'),/invalid recent daily OHLCV/);
assert.equal(selectCompletedDailyBar(rows,zero,'2026-11-26','^OMX').v,0); // Index volume may be zero
const missing=structuredClone(quote);missing.close[1]=null;
assert.throws(()=>selectCompletedDailyBar(rows,missing,'2026-11-26','ABB.ST'),/invalid recent daily OHLCV/);
const duplicated=[rows[0],rows[1],rows[1]];const dupquote={open:[90,100,101],high:[92,103,104],low:[89,98,99],close:[91,101,102],volume:[500,900,1000]};
assert.throws(()=>selectCompletedDailyBar(duplicated,dupquote,'2026-11-26','ABB.ST'),/duplicate recent daily session/);
assert.throws(()=>selectCompletedDailyBar(rows,quote,'invalid','ABB.ST'),/DATA_NOT_READY/);
console.log('Recent Yahoo daily validation tests passed');
