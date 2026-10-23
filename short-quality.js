'use strict';

// AG Invest shortkvalitet: urval ur D-1-priser, aldrig automatisk handel.
// Separat från short-squeeze-bevakningen (som letar UPPÅTVÄNDNINGAR).
const CONFIG = Object.freeze({
  minRsi: 35,
  maxRsi: 65,
  minBollingerPctB: 0.08,
  maxNegativeGapPct: -2.5,
  maxPositiveGapPct: 2.5,
  earningsBlockWeekdays: 5,
});

function weekdaysUntil(fromDate, toDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate || '') || !/^\d{4}-\d{2}-\d{2}$/.test(toDate || '')) return null;
  const a = Date.parse(fromDate + 'T00:00:00Z');
  const b = Date.parse(toDate + 'T00:00:00Z');
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  let days = 0;
  for (let ms = a + 86400000; ms <= b; ms += 86400000) {
    const dow = new Date(ms).getUTCDay();
    if (dow !== 0 && dow !== 6) days++;
  }
  return days;
}

function reviewShort(r, idx, dataDate, earningsDates = {}) {
  const reasons = [];
  const warnings = [];
  const required = ['c', 'atrAbs', 'rsi', 'r21', 'rs21', 'pctB', 'sma20', 'sma50'];
  if (!r || required.some(k => !Number.isFinite(r[k])) || !(r.c > 0) || !(r.atrAbs > 0)) {
    return {status:'BLOCKED',score:0,reasons:['DATA_OFULLSTANDIG'],warnings,reportDate:null};
  }
  if (r.c >= r.sma50) reasons.push('EJ_UNDER_SMA50');
  if (r.r21 >= 0) reasons.push('INGEN_21D_NEDTREND');
  if (r.rs21 >= 0) reasons.push('EJ_SVAGARE_AN_INDEX_21D');
  if (r.rsi <= CONFIG.minRsi) reasons.push('OVERSALD_RSI');
  if (r.rsi >= CONFIG.maxRsi) reasons.push('RSI_FOR_HOG');
  if (r.pctB <= CONFIG.minBollingerPctB) reasons.push('NARA_NEDRE_BOLLINGER');
  if (Number.isFinite(r.gap) && r.gap <= CONFIG.maxNegativeGapPct) reasons.push('STORT_NEDGAP_JAGA_INTE');
  if (Number.isFinite(r.gap) && r.gap >= CONFIG.maxPositiveGapPct) reasons.push('STORT_UPPGAP_INVANTA_BEKRAFTELSE');

  const reportDate = earningsDates[r.ticker] || null;
  const reportInWeekdays = reportDate ? weekdaysUntil(dataDate,reportDate) : null;
  if (reportInWeekdays !== null && reportInWeekdays <= CONFIG.earningsBlockWeekdays) reasons.push('RAPPORT_INOM_5_HANDELSDAGAR');
  if (reportInWeekdays === null) warnings.push('RAPPORTDATUM_EJ_VERIFIERAT');
  if (idx?.above50) warnings.push('INDEX_OVER_SMA50');
  if (!Number.isFinite(r.vol) || r.vol <= 0) warnings.push('VOLYMDATA_SAKNAS');

  // Only prioritization, NOT a predicted success probability.
  let score = 40;
  if (r.c < r.sma20) score += 10;
  if (r.c < (r.sma200 ?? -Infinity)) score += 10;
  if (r.rs21 < -3) score += 15;
  else if (r.rs21 < -1) score += 7;
  if (r.r21 < -5) score += 10;
  if (r.rsi >= 40 && r.rsi <= 58) score += 10;
  if (Number.isFinite(r.vol) && r.vol >= 1.2) score += 5;
  score = Math.min(100, Math.max(0, score));
  return {status:reasons.length ? 'BLOCKED' : 'WATCH',score,reasons,warnings,reportDate,reportInWeekdays};
}

function shortReviewLine(r, review) {
  const note = review.reasons.length ? review.reasons.join(', ') : 'Manuell trigger/spread/produktkontroll krävs';
  const warnings = review.warnings.length ? ' | OBS '+review.warnings.join(', ') : '';
  return '   '+r.name+' | '+review.status+' | kvalitet '+review.score+'/100 | '+note+warnings;
}

module.exports={CONFIG,weekdaysUntil,reviewShort,shortReviewLine};
