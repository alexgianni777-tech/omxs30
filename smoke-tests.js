'use strict';

const assert = require('assert');
const reportDate = require('./report-date');
const { chooseCommonDataDate, previousWeekday } = require('./data-date');

// Monday morning Stockholm -> latest completed weekday is Friday.
assert.strictEqual(
  reportDate(new Date('2026-09-28T08:00:00Z'), false),
  '2026-09-25',
);

// Monday evening after the configured cutoff -> Monday itself.
assert.strictEqual(
  reportDate(new Date('2026-09-28T20:00:00Z'), false),
  '2026-09-28',
);

// Tuesday retry always targets the previous weekday.
assert.strictEqual(
  reportDate(new Date('2026-09-29T08:00:00Z'), true),
  '2026-09-28',
);

console.log('OMXS30 smoke tests passed');


function bars(...dates) {
  return dates.map((d, i) => ({ t: Date.parse(d + 'T12:00:00Z') / 1000, c: 100 + i }));
}

assert.strictEqual(previousWeekday('2026-09-29'), '2026-09-28');
assert.strictEqual(previousWeekday('2026-09-28'), '2026-09-25');

assert.deepStrictEqual(
  chooseCommonDataDate('2026-09-29', [bars('2026-09-28','2026-09-29'), bars('2026-09-28','2026-09-29')]),
  { dataDate: '2026-09-29', delayed: false },
);

assert.deepStrictEqual(
  chooseCommonDataDate('2026-09-29', [bars('2026-09-28','2026-09-29'), bars('2026-09-28')]),
  { dataDate: '2026-09-28', delayed: true },
);

assert.throws(
  () => chooseCommonDataDate('2026-09-29', [bars('2026-09-27'), bars('2026-09-27')]),
  /högst en handelsdags/,
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
