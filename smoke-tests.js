'use strict';

const assert = require('assert');
const reportDate = require('./report-date');
const { chooseCommonDataDate, previousWeekday } = require('./data-date');

// Monday report stays Monday; data selection handles the Friday close.
assert.strictEqual(
  reportDate(new Date('2026-09-28T08:00:00Z'), false),
  '2026-09-28',
);

// Monday evening is the same report day.
assert.strictEqual(
  reportDate(new Date('2026-09-28T20:00:00Z'), false),
  '2026-09-28',
);

// Tuesday retry remains a Tuesday report; it must use Monday data.
assert.strictEqual(
  reportDate(new Date('2026-09-29T08:00:00Z'), true),
  '2026-09-29',
);

console.log('OMXS30 smoke tests passed');


function bars(...dates) {
  return dates.map((d, i) => ({ t: Date.parse(d + 'T12:00:00Z') / 1000, c: 100 + i }));
}

assert.strictEqual(previousWeekday('2026-09-29'), '2026-09-28');
assert.strictEqual(previousWeekday('2026-09-28'), '2026-09-25');

assert.deepStrictEqual(
  chooseCommonDataDate('2026-09-29', [bars('2026-09-28','2026-09-29'), bars('2026-09-28','2026-09-29')]),
  { dataDate: '2026-09-28', delayed: true },
);

assert.deepStrictEqual(
  chooseCommonDataDate('2026-09-29', [bars('2026-09-28','2026-09-29'), bars('2026-09-28')]),
  { dataDate: '2026-09-28', delayed: true },
);

assert.throws(
  () => chooseCommonDataDate('2026-09-29', [bars('2026-09-27'), bars('2026-09-27')]),
  /föregående handelsdag/,
);


const dashboardDateRegex = /SCREENER\s*[·•]\s*(\d{4}-\d{2}-\d{2})/;
const dashboardPlanRegex = /plan\((LONG|SHORT)\):\s*entry\s*~?([\d.]+)\s*·\s*stop\s+([\d.]+).*·\s*mål.*?([\d.]+)\s*\(R\/R\s+([\d.]+)\)\s*·\s*1R\s+([\d.]+)/;

assert.strictEqual(
  'OMXS30 SCREENER · 2026-09-30'.match(dashboardDateRegex)?.[1],
  '2026-09-30',
);

const compatiblePlan =
  'plan(LONG): entry ~45.17 · stop 44.00 (1.2×ATR) · mål 47.12 (R/R 1.67) · 1R 46.34 · måltyp 2×ATR · max 10 dagar';
const planMatch = compatiblePlan.match(dashboardPlanRegex);
assert.ok(planMatch);
assert.strictEqual(planMatch[1], 'LONG');
assert.strictEqual(planMatch[2], '45.17');
assert.strictEqual(planMatch[3], '44.00');
assert.strictEqual(planMatch[4], '47.12');
assert.strictEqual(planMatch[5], '1.67');
assert.strictEqual(planMatch[6], '46.34');

const { summarizeProfile, profileLine } = require('./earnings-profile');
const h = summarizeProfile('HEXA-B.ST', '2026-10-22');
assert.strictEqual(h.n, 8);
assert.strictEqual(h.up, 8);
assert.strictEqual(h.down, 0);
assert.ok(profileLine(h).includes('8 upp / 0 ned'));
const a = summarizeProfile('ATCO-A.ST', '2026-10-22');
assert.strictEqual(a.n, 8);
assert.strictEqual(a.up, 1);
assert.strictEqual(a.down, 6);
assert.strictEqual(a.flat, 1);
assert.strictEqual(summarizeProfile('INVE-B.ST', '2026-10-22'), null);
assert.strictEqual(summarizeProfile('HEXA-B.ST', '2024-01-01'), null);
console.log('Earnings profile tests passed (no trading restriction)');

// Short-squeeze watch: historical as-of gating, explicit stale handling,
// entry confirmation as WATCH (never executable) and FI parsing.
const {getInterest, evaluateShortSqueeze, weekdaysApart, logWatch}=require('./short-squeeze');
const {parseFiPage}=require('./short-interest-refresh');
const fs=require('fs'),os=require('os'),path=require('path');
const oldSCA=getInterest('SCA-B.ST','2026-10-21');
assert.strictEqual(oldSCA.shortPct,8.00);
assert.strictEqual(oldSCA.asOfDate,'2026-10-21'); // no 22 Oct lookahead
assert.strictEqual(getInterest('SCA-B.ST','2026-10-22').shortPct,8.12);
assert.strictEqual(getInterest('SKF-B.ST','2026-10-22').shortPct,7.53);
assert.strictEqual(getInterest('SCA-B.ST','2026-09-01').status,'MISSING');
assert.strictEqual(getInterest('SCA-B.ST','2026-11-10').status,'STALE');
assert.strictEqual(weekdaysApart('2026-10-22','2026-10-23'),1);
assert.strictEqual(weekdaysApart('2026-10-23','2026-10-26'),1);
const mockBars=Array.from({length:22},(_,i)=>({c:i===21?103:100,h:i===21?104:101,l:99}));
const mock={name:'SCA',c:103,sma20:100.15,vol:1.8};
const alert=evaluateShortSqueeze('SCA-B.ST',mock,mockBars,'2026-10-22');
assert.strictEqual(alert.status,'TECHNICAL_WATCH');
assert.strictEqual(alert.trigger,'20D_BREAKOUT');
assert.strictEqual(alert.executable,false);
assert.strictEqual(evaluateShortSqueeze('SCA-B.ST',{...mock,vol:1.1},mockBars,'2026-10-22').status,'WATCH');
assert.strictEqual(evaluateShortSqueeze('SCA-B.ST',mock,mockBars,'2026-11-10').status,'DATA_STALE');
const tempDir=fs.mkdtempSync(path.join(os.tmpdir(),'short-squeeze-test-'));
try {
 const logPath=path.join(tempDir,'watch.csv');
 assert.strictEqual(logWatch('2026-10-23','2026-10-22',[alert],logPath),1);
 assert.strictEqual(logWatch('2026-10-23','2026-10-22',[alert],logPath),0);
 assert.strictEqual(fs.readFileSync(logPath,'utf8').trim().split('\n').length,2);
} finally {fs.rmSync(tempDir,{recursive:true,force:true});}
const fiHtml='<h2>Aktuella positioner 2026-10-22</h2><table>'+
 '<tr><td>SCA</td><td>549300FW5JDRV1IJ0M67</td><td>2026-10-21</td><td>8,12</td></tr>'+
 '<tr><td>SKF</td><td>549300B6HWYEE57O8J84</td><td>2026-10-21</td><td>7,53</td></tr>'+
 '</table>';
assert.strictEqual(parseFiPage(fiHtml).rows['SCA-B.ST'].shortPct,8.12);
assert.strictEqual(parseFiPage(fiHtml).rows['SKF-B.ST'].shortPct,7.53);
assert.throws(()=>parseFiPage(fiHtml.replace('7,53','9999')),/felaktig/i);
assert.throws(()=>parseFiPage(fiHtml.replace('549300FW5JDRV1IJ0M67','NOT-FOUND')),/Kan inte säkert/);
console.log('SCA/SKF short squeeze smoke tests passed');
