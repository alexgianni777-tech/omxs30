'use strict';

// Oraklet: independent D-1 quality gate. A QUALIFIED setup is still only WATCH,
// never an order, forecast or statistically validated trading edge.
const fs = require('node:fs');
const {weekdaysUntil} = require('./short-quality');

const CONFIG = Object.freeze({
  minRsi: 45, maxRsi: 72,
  minRs63: 5, minRs21: 2, minRs21Headwind: 4,
  minVolumeRatio: 0.8, maxAbsGapPct: 3,
  reportMaxAgeDays: 120, earningsBlockWeekdays: 5,
});
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const clamp = (x, low, high) => Math.max(low, Math.min(high, x));
function dayDistance(start, end) {
  if (!ISO.test(start || '') || !ISO.test(end || '')) return null;
  const a = Date.parse(start + 'T00:00:00Z');
  const b = Date.parse(end + 'T00:00:00Z');
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (new Date(a).toISOString().slice(0, 10) !== start ||
      new Date(b).toISOString().slice(0, 10) !== end) return null;
  return (b - a) / 86400000;
}

function evaluateReport(ticker, asOfDate, book = {}) {
  const evidence = book.reports && book.reports[ticker];
  if (!evidence) return {status:'UNVERIFIED', reason:'RAPPORTDATA_SAKNAS', evidence:null};
  const sinceRelease = dayDistance(evidence.releasedOn, asOfDate);
  const sinceAvailable = dayDistance(evidence.availableFrom, asOfDate);
  if (sinceRelease === null || sinceAvailable === null ||
      sinceRelease < 0 || sinceAvailable < 0) {
    return {status:'UNVERIFIED', reason:'RAPPORT_EJ_PUBLICERAD_VID_DATADATUM', evidence:null};
  }
  if (sinceRelease > CONFIG.reportMaxAgeDays || sinceAvailable > CONFIG.reportMaxAgeDays) {
    return {status:'UNVERIFIED', reason:'RAPPORT_FOR_GAMMAL', evidence:null};
  }
  if (!/^https:\/\//.test(evidence.sourceUrl || '') ||
      typeof evidence.marginBasis !== 'string' ||
      !Number.isFinite(evidence.organicGrowthYoYPct) ||
      !Number.isFinite(evidence.marginDeltaPp)) {
    return {status:'UNVERIFIED', reason:'RAPPORTDATA_OFULLSTANDIG', evidence:null};
  }
  const growthPositive = evidence.organicGrowthYoYPct > 0;
  const marginPositive = evidence.marginDeltaPp > 0;
  const status = growthPositive && marginPositive ? 'STRONG' :
    !growthPositive && !marginPositive ? 'WEAK' : 'MIXED';
  return {status, reason:status === 'STRONG' ? null : 'RAPPORT_' + status,
    evidence, daysSinceReport:sinceRelease};
}

function reviewLong(row, index, dataDate, book = {}, upcoming = {}) {
  const reasons = [], warnings = [];
  const report = evaluateReport(row && row.ticker, dataDate, book);
  const required = ['c','sma50','sma200','r21','rsi','rs21','rs63','gap','vol','atrAbs'];
  if (!row || required.some(key => !Number.isFinite(row[key])) ||
      row.c <= 0 || row.atrAbs <= 0) {
    return {status:'WATCH',score:0,reasons:['DATA_OFULLSTANDIG'],warnings,report};
  }
  if (row.c <= row.sma50 || row.c <= row.sma200 || row.r21 <= 0) reasons.push('TREND_EJ_STARK');
  if (row.rsi < CONFIG.minRsi || row.rsi > CONFIG.maxRsi) reasons.push('RSI_UTANFOR_INTERVALL');
  if (row.rs63 <= CONFIG.minRs63 || row.rs21 <= CONFIG.minRs21) reasons.push('RELATIV_STYRKA_OTILLRACKLIG');
  if (!index || !index.above50 && row.rs21 <= CONFIG.minRs21Headwind) reasons.push('INDEX_MOTVIND_KRAVER_MER_RS');
  if (row.vol < CONFIG.minVolumeRatio) reasons.push('SVAG_VOLYM');
  if (Math.abs(row.gap) >= CONFIG.maxAbsGapPct) reasons.push('STORT_RAPPORT_ELLER_DAGSGAP');
  if (report.status !== 'STRONG') reasons.push(report.reason || 'RAPPORT_EJ_STARK');
  const nextReport = upcoming[row.ticker] || null;
  const until = nextReport ? weekdaysUntil(dataDate, nextReport) : null;
  if (until !== null && until <= CONFIG.earningsBlockWeekdays) reasons.push('NY_RAPPORT_INOM_5_VARDAGAR');
  if (!nextReport || until === null) warnings.push('NASTA_RAPPORTDATUM_EJ_VERIFIERAT');
  if (report.daysSinceReport !== undefined && report.daysSinceReport <= 3) warnings.push('FARSK_RAPPORT_REKYL_RISK');
  const trendPoints = (row.c > row.sma50 ? 12 : 0) +
    (row.c > row.sma200 ? 10 : 0) + (row.r21 > 0 ? 8 : 0) +
    (row.rsi >= CONFIG.minRsi && row.rsi <= CONFIG.maxRsi ? 10 : 0);
  const rsPoints = 15 * clamp(row.rs21 / 8, 0, 1) + 15 * clamp(row.rs63 / 15, 0, 1);
  const evidence = report.evidence;
  const fundamentalPoints = report.status === 'STRONG'
    ? 15 + clamp(evidence.organicGrowthYoYPct, 0, 20) / 4 +
        clamp(evidence.marginDeltaPp, 0, 2) * 5 : 0;
  const score = Math.round(clamp(trendPoints + rsPoints + fundamentalPoints,0,100));
  return {status:reasons.length ? 'WATCH' : 'QUALIFIED', score, reasons, warnings, report};
}

function screenElite(rows, index, dataDate, book = {}, upcoming = {}) {
  const reviewed = rows.map(row => ({row,review:reviewLong(row,index,dataDate,book,upcoming)}));
  const qualified = reviewed.filter(item => item.review.status === 'QUALIFIED')
    .sort((a,b) => b.review.score - a.review.score ||
      b.row.rs21 - a.row.rs21 || a.row.ticker.localeCompare(b.row.ticker)).slice(0,3);
  return {qualified,reviewed};
}

function renderElite(result, dataDate) {
  const out = [
    '\n=== 0B · ORAKLET TOPP 3 — trend + rapportkvalitet + relativ styrka ===',
    '    QUALIFIED = kvalitetssäkrad BEVAKNING, ALDRIG automatisk entry. D-1: ' + dataDate + '.',
    '    Bara verifierade och publicerade rapporter räknas. Positiv tillväxt OCH förbättrad jämförbar marginal krävs.'
  ];
  if (!result.qualified.length) out.push('    0 kvalificerade idag — att avstå är en giltig signal.');
  for (const item of result.qualified) {
    const e=item.review.report.evidence;
    out.push('    ' + item.row.name + ' | score ' + item.review.score +
      '/100 | RS3m +' + item.row.rs63.toFixed(1) +
      ' | RS1m +' + item.row.rs21.toFixed(1) +
      ' | organisk tillväxt ' + e.organicGrowthYoYPct.toFixed(1) +
      '% | marginalförändring +' + e.marginDeltaPp.toFixed(1) + ' pp');
    if (item.review.warnings.length) out.push('      OBS: ' + item.review.warnings.join(', '));
  }
  const near = result.reviewed
    .filter(item => item.review.status !== 'QUALIFIED')
    .sort((a,b) => b.review.score - a.review.score)
    .slice(0,5);
  out.push('    Granskning av övriga toppkandidater (WATCH, inte entry):');
  for (const item of near) out.push('      ' + item.row.name + ' | ' +
    item.review.reasons.join(', ') + ' | score ' + item.review.score + '/100');
  out.push('    Poängen är en transparent intern prioritering, INTE sannolikhet, konsensussurprise eller backtestad edge.');
  return out.join('\n');
}

function logElite(date, dataDate, qualified, target = 'oraklet-candidates.csv') {
  const header = 'date,data_date,ticker,direction,grade,score,close,rs63,rs21,organic_growth_yoy,margin_delta_pp,report_period,report_source\n';
  if (!fs.existsSync(target)) fs.writeFileSync(target,header);
  const prior = fs.readFileSync(target,'utf8').split(/\r?\n/);
  const keys = new Set(prior.slice(1).filter(Boolean).map(line => {
    const cols=line.split(',');
    return cols[0] + '|' + cols[1] + '|' + cols[2];
  }));
  let n=0;
  for (const {row,review} of qualified) {
    const key=date + '|' + dataDate + '|' + row.ticker;
    if (keys.has(key)) continue;
    const e=review.report.evidence;
    const vals=[date,dataDate,row.ticker,'LONG','QUALIFIED_WATCH',review.score,
      row.c,row.rs63,row.rs21,e.organicGrowthYoYPct,e.marginDeltaPp,e.period,e.sourceUrl];
    fs.appendFileSync(target,vals.join(',')+'\n');
    keys.add(key);n++;
  }
  return n;
}

module.exports={CONFIG,dayDistance,evaluateReport,reviewLong,screenElite,renderElite,logElite};
