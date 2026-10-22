'use strict';

// Historical earnings-day share-price reactions; observational, NOT a trade
// signal or an earnings blackout. Values are explicitly sourced in JSON.
// Add company histories only when the dates/percentages are verified.
// Optional consensus and actual fields must refer to the SAME metric and unit.
const profiles = require('./earnings-history.json');

const validDate = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d+'T00:00:00Z'));
const mean = arr => arr.reduce((a,b) => a+b, 0)/arr.length;
const median = arr => {
  const sorted = [...arr].sort((a,b) => a-b);
  const m = Math.floor(sorted.length/2);
  return sorted.length % 2 ? sorted[m] : (sorted[m-1]+sorted[m])/2;
};

function summarizeProfile(ticker, asOfDate = new Date().toISOString().slice(0,10)) {
  const profile = profiles[ticker];
  if (!profile) return null;
  if (!validDate(asOfDate)) throw new Error('Invalid as-of date');
  const seen = new Set();
  const events = (profile.events || [])
    .filter(e => validDate(e.date) && e.date < asOfDate && Number.isFinite(e.reactionPct))
    .sort((a,b) => a.date.localeCompare(b.date))
    .filter(e => { if (seen.has(e.date)) return false; seen.add(e.date); return true; });
  if (!events.length) return null;
  const values = events.map(e => e.reactionPct);
  const shocks = events.filter(e => e.consensus && e.actual && e.consensus.metric === e.actual.metric
    && e.consensus.unit === e.actual.unit && Number.isFinite(e.consensus.value)
    && Number.isFinite(e.actual.value) && e.consensus.value !== 0)
    .map(e => (e.actual.value/e.consensus.value - 1)*100);
  return {
    ticker, name: profile.name, source: profile.source, sourcePublished: profile.sourcePublished,
    n:values.length, up:values.filter(v=>v>0).length,
    down:values.filter(v=>v<0).length, flat:values.filter(v=>v===0).length,
    average:mean(values), median:median(values), avgAbs:mean(values.map(Math.abs)),
    worst:Math.min(...values), best:Math.max(...values),
    last:events[events.length-1], surpriseN:shocks.length,
    surpriseAverage:shocks.length?mean(shocks):null
  };
}
function profileLine(p) {
  if (!p) return null;
  const s = v => (v>0?'+':'')+v.toFixed(1)+'%';
  return `   ${p.name}: ${p.n} rapportdagar · ${p.up} upp / ${p.down} ned / ${p.flat} oförändrade · snitt ${s(p.average)} · median ${s(p.median)} · snittrörelse |%| ${p.avgAbs.toFixed(1)}% · sämst ${s(p.worst)} · bäst ${s(p.best)} · senaste ${s(p.last.reactionPct)} (${p.last.date})`;
}
module.exports = { summarizeProfile, profileLine };
