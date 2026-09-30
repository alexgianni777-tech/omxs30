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
