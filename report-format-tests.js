'use strict';

const assert = require('node:assert/strict');
const { formatScreenerReport, splitTelegramChunks } = require('./report-format');

const analysis = '⚠⚠⚠ EN HANDELSDAGS FÖRDRÖJNING ⚠⚠⚠\n' +
  'Rapportdag: 2026-10-29 · data 2026-10-28\n' +
  '1. ABB plan(SHORT): entry ~874.20 · stop 907.39 · mål 807.82 (R/R 2.00)\n';
const raw = 'OMXS30 SCREENER · 2026-10-29\n' +
  'Hämtar index + 30 bolag\n' +
  'REPAIRED_INTRADAY ^OMX 2026-10-28 O=3256.95\n' +
  '.REPAIRED_INTRADAY ABB.ST 2026-10-28 C=874.20\n.\n' + analysis;

const clean = formatScreenerReport(raw);
assert.ok(clean.startsWith('OMXS30 SCREENER · 2026-10-29\n'));
assert.ok(clean.includes('⚠ DATAKVALITET: 2 dagsstaplar rekonstruerade'));
assert.ok(!clean.includes('REPAIRED_INTRADAY'));
assert.ok(!clean.includes('Hämtar index'));
assert.ok(clean.endsWith(analysis));
assert.ok(clean.includes('entry ~874.20 · stop 907.39 · mål 807.82'));
assert.equal(formatScreenerReport('OTHER FORMAT\n' + analysis), 'OTHER FORMAT\n' + analysis);
assert.equal(formatScreenerReport('OMXS30 SCREENER · 2026-10-29\nNO MARKER'), 'OMXS30 SCREENER · 2026-10-29\nNO MARKER');
assert.equal(formatScreenerReport('OMXS30 SCREENER · 2026-10-29\n' + analysis),
  'OMXS30 SCREENER · 2026-10-29\n\n' + analysis);

const longText = ('Header\n' + ('ABC\n'.repeat(1250)) + 'Footer');
const chunks = splitTelegramChunks(longText, 3800);
assert.ok(chunks.length > 1);
assert.ok(chunks.every(chunk => chunk.length <= 3800));
assert.equal(chunks.join(''), longText);
assert.deepEqual(splitTelegramChunks('short'), ['short']);

console.log('Telegram formatting tests passed');
