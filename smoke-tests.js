'use strict';

const assert = require('assert');
const reportDate = require('./report-date');

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
