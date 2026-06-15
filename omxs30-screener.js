'use strict';

const fs = require('fs');


/**
 * ============================================================
 *  OMXS30 SCREENER — dag/vecka  ·  kör:  node screener.js
 * ============================================================
 *  Hämtar ~13 mån dagsdata (Yahoo Finance) för OMXS30 + indexet
 *  och producerar:
 *
 *   0. MARKNADSVÄDER  — indexets eget läge (trend, RSI, 5d).
 *                       Long-setups fungerar bäst i medvind.
 *   1. MOMENTUM       — starkast relativ styrka MOT INDEX,
 *                       i trend, ej överköpt. (Fortsättnings-long)
 *   2. SQUEEZE/UTBROTT — Bollinger-banden hoptryckta nära högsta
 *                       = laddad fjäder, rörelse nära förestående.
 *   3. STUDS          — kraftigt översåld (RSI + under nedre
 *                       Bollinger) men intakt längre trend.
 *   4. SVAGAST        — i fallande trend; undvik long / short-idé.
 *
 *  Varje kandidat får en TRADE-PLAN: entry ≈ senaste, stop på
 *  1.2×ATR, mål +1% och 1R, samt R/R. Plus volym- och 52v-info.
 *
 *  Detta är ett URVALSVERKTYG — ingen köpsignal. Du väljer,
 *  du sätter risken, och 0 trades en dag utan läge är ett beslut.
 *
 *  OBS: OMXS30-sammansättningen revideras halvårsvis — verifiera
 *  TICKERS mot Nasdaq OMX Nordic och justera vid behov.
 * ============================================================
 */

const INDEX_TICKER = '^OMX';
const TICKERS = [
  ['ABB.ST','ABB'],            ['ALFA.ST','Alfa Laval'],    ['ASSA-B.ST','Assa Abloy'],
  ['AZN.ST','AstraZeneca'],    ['ATCO-A.ST','Atlas Copco'], ['ALIV-SDB.ST','Autoliv'],
  ['BOL.ST','Boliden'],        ['ELUX-B.ST','Electrolux'],  ['EPI-A.ST','Epiroc'],
  ['ERIC-B.ST','Ericsson'],    ['ESSITY-B.ST','Essity'],    ['EVO.ST','Evolution'],
  ['GETI-B.ST','Getinge'],     ['HEXA-B.ST','Hexagon'],     ['HM-B.ST','H&M'],
  ['INVE-B.ST','Investor'],    ['NDA-SE.ST','Nordea'],      ['NIBE-B.ST','NIBE'],
  ['SAAB-B.ST','Saab'],        ['SAND.ST','Sandvik'],       ['SCA-B.ST','SCA'],
  ['SEB-A.ST','SEB'],          ['SHB-A.ST','Handelsbanken'],['SKA-B.ST','Skanska'],
  ['SKF-B.ST','SKF'],          ['SSAB-A.ST','SSAB'],        ['SWED-A.ST','Swedbank'],
  ['TEL2-B.ST','Tele2'],       ['TELIA.ST','Telia'],        ['VOLV-B.ST','Volvo'],
];

/* ------------------------- config (redigera fritt) ------------------------- */
// Sätt din riskbudget per trade i kronor (det belopp du tål att förlora om stoppen nås).
// När den är satt räknar planen ut antal aktier åt dig. Lämna null för att hoppa över.
const RISK_PER_TRADE_SEK = null;   // t.ex. 300 = max ~300 kr förlust om stoppen nås
const LOG_CANDIDATES = true;       // skriver dagens kandidater till candidates-log.csv

// RAPPORTKALENDER — fyll i nästa rapportdatum per bolag (YYYY-MM-DD) en gång per kvartal.
// Hämtas från Avanza eller bolagens IR-kalender. Screenern varnar då automatiskt om en
// kandidat har rapport inom EARNINGS_WARN_DAYS — du vill sällan daytrada in i en rapport.
// Exempel: 'VOLV-B.ST': '2026-07-18'
const EARNINGS = {
  // 'VOLV-B.ST': '2026-07-18',
  // 'ERIC-B.ST': '2026-07-14',
};
const EARNINGS_WARN_DAYS = 5;

/* ------------------------- data ------------------------- */
async function fetchDaily(ticker, days = 400, tries = 3) {
  const to = Math.floor(Date.now() / 1000);
  const from = to - days * 86400;
  // Two Yahoo hosts; rotate on failure (one is often rate-limited while the other works)
  const hosts = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
  let lastErr;
  for (let attempt = 0; attempt < tries; attempt++) {
    const host = hosts[attempt % hosts.length];
    const url = `https://${host}/v8/finance/chart/${encodeURIComponent(ticker)}` +
                `?period1=${from}&period2=${to}&interval=1d&events=div%2Csplit`;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      const r = j?.chart?.result?.[0];
      if (!r?.timestamp) throw new Error('no data');
      const q = r.indicators.quote[0];
      const bars = [];
      for (let i = 0; i < r.timestamp.length; i++) {
        if (q.close[i] == null) continue;
        bars.push({ t: r.timestamp[i], o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i], v: q.volume[i] ?? 0 });
      }
      if (bars.length < 220) throw new Error(`only ${bars.length} bars`);
      return bars;
    } catch (e) {
      lastErr = e;
      if (attempt < tries - 1) await new Promise(r => setTimeout(r, 600 * (attempt + 1))); // backoff
    }
  }
  throw lastErr;
}

/* ---------------------- indikatorer ---------------------- */
const last = a => a[a.length - 1];
function sma(xs, n, off = 0) {
  const end = xs.length - off;
  if (end < n) return null;
  let s = 0; for (let i = end - n; i < end; i++) s += xs[i];
  return s / n;
}
function rsi14(closes) {
  const n = 14;
  if (closes.length < n + 1) return null;
  let g = 0, l = 0;
  for (let i = closes.length - n; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    d > 0 ? g += d : l -= d;
  }
  return l === 0 ? 100 : 100 - 100 / (1 + g / l);
}
function ret(closes, days) {
  if (closes.length < days + 1) return null;
  return (last(closes) / closes[closes.length - 1 - days] - 1) * 100;
}
function atr(bars, n = 14) {
  if (bars.length < n + 1) return null;
  let s = 0;
  for (let i = bars.length - n; i < bars.length; i++) {
    s += Math.max(bars[i].h - bars[i].l,
                  Math.abs(bars[i].h - bars[i - 1].c),
                  Math.abs(bars[i].l - bars[i - 1].c));
  }
  return s / n;
}
function bollinger(closes, n = 20, k = 2) {
  if (closes.length < n) return null;
  const m = sma(closes, n);
  const win = closes.slice(-n);
  const sd = Math.sqrt(win.reduce((a, b) => a + (b - m) ** 2, 0) / n);
  const upper = m + k * sd, lower = m - k * sd, c = last(closes);
  return {
    mid: m, upper, lower,
    pctB: (c - lower) / ((upper - lower) || 1),     // <0 under bandet, >1 över
    bandwidth: (upper - lower) / m * 100,            // bandbredd i %
  };
}
// Squeeze: dagens bandbredd i percentil av senaste ~6 mån bandbredder
function bandwidthPercentile(closes, lookback = 120) {
  const widths = [];
  for (let off = 0; off < lookback; off++) {
    const end = closes.length - off;
    if (end < 20) break;
    const win = closes.slice(end - 20, end);
    const m = win.reduce((a, b) => a + b, 0) / 20;
    const sd = Math.sqrt(win.reduce((a, b) => a + (b - m) ** 2, 0) / 20);
    widths.push((4 * sd) / m * 100);
  }
  if (widths.length < 30) return null;
  const today = widths[0];
  const below = widths.filter(w => w < today).length;
  return below / widths.length * 100; // låg % = ovanligt hoptryckt
}
function distToHigh(bars, days) {
  const win = bars.slice(-days);
  return (last(bars).c / Math.max(...win.map(b => b.h)) - 1) * 100;
}
function volSurge(bars, n = 20) {
  if (bars.length < n + 1) return null;
  const avg = bars.slice(-n - 1, -1).reduce((a, b) => a + b.v, 0) / n;
  return avg ? last(bars).v / avg : null;
}

/* ------------------------ analys ------------------------ */
function analyse(name, ticker, bars, idx) {
  const closes = bars.map(b => b.c);
  const c = last(closes);
  const a = atr(bars);
  const bb = bollinger(closes);
  // Overnight gap: today's open vs yesterday's close, in % (signal of news/event risk)
  const prev = bars[bars.length - 2];
  const todayGap = (prev && last(bars).o != null) ? (last(bars).o / prev.c - 1) * 100 : null;
  const r = {
    name, ticker, c,
    rsi: rsi14(closes),
    r5: ret(closes, 5), r21: ret(closes, 21), r63: ret(closes, 63),
    atrPct: a != null ? a / c * 100 : null, atrAbs: a,
    sma20: sma(closes, 20), sma50: sma(closes, 50), sma200: sma(closes, 200),
    pctB: bb?.pctB, bw: bb?.bandwidth, bwPct: bandwidthPercentile(closes),
    dHigh20: distToHigh(bars, 20), dHigh252: distToHigh(bars, 252),
    vol: volSurge(bars), gap: todayGap,
  };
  r.above20 = r.sma20 != null && c > r.sma20;
  r.above50 = r.sma50 != null && c > r.sma50;
  r.above200 = r.sma200 != null && c > r.sma200;
  // Relativ styrka mot index (alfa): aktiens avkastning minus indexets
  r.rs63 = (r.r63 != null && idx.r63 != null) ? r.r63 - idx.r63 : null;
  r.rs21 = (r.r21 != null && idx.r21 != null) ? r.r21 - idx.r21 : null;
  return r;
}

function zscore(rows, key) {
  const vals = rows.map(r => r[key]).filter(v => v != null && isFinite(v));
  const m = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / vals.length) || 1;
  rows.forEach(r => r['z_' + key] = (r[key] == null || !isFinite(r[key])) ? 0 : (r[key] - m) / sd);
}

/* ---------------------- logg (grunden för Oraklet-mätningen) ---------------------- */
function logCandidates(dateStr, lists) {
  if (!LOG_CANDIDATES) return;
  const path = 'candidates-log.csv';
  const header = 'date,list,name,ticker,close,rs63,r21,rsi,pctB,atrPct,vol,dHigh20\n';
  if (!fs.existsSync(path)) fs.writeFileSync(path, header);
  const f2 = v => (v == null || !isFinite(v)) ? '' : v.toFixed(2);
  let out = '';
  for (const [listName, items] of Object.entries(lists)) {
    items.forEach(r => {
      out += `${dateStr},${listName},${r.name},${r.ticker},${f2(r.c)},${f2(r.rs63)},${f2(r.r21)},${f2(r.rsi)},${f2(r.pctB)},${f2(r.atrPct)},${f2(r.vol)},${f2(r.dHigh20)}\n`;
    });
  }
  fs.appendFileSync(path, out);
  console.log(`\n(Loggade ${Object.values(lists).flat().length} kandidater till ${path} — fyll på utfall själv för Oraklet-mätning senare.)`);
}

/* ---------------------- trade-plan ---------------------- */
function plan(r, dir = 'LONG') {
  if (r.atrAbs == null) return '';
  const stopDist = 1.2 * r.atrAbs;
  const entry = r.c;
  const stop  = dir === 'LONG' ? entry - stopDist : entry + stopDist;
  const t1pct = dir === 'LONG' ? entry * 1.01 : entry * 0.99;
  const t1R   = dir === 'LONG' ? entry + stopDist : entry - stopDist;
  const rr1pct = (Math.abs(t1pct - entry) / stopDist).toFixed(2);
  let size = '';
  if (RISK_PER_TRADE_SEK && stopDist > 0) {
    const shares = Math.floor(RISK_PER_TRADE_SEK / stopDist);
    size = ` · storlek ~${shares} st (~${(shares * entry).toFixed(0)} kr exponering vid ${RISK_PER_TRADE_SEK} kr risk)`;
  }
  return `      plan(${dir}): entry ~${entry.toFixed(2)} · stop ${stop.toFixed(2)} (1.2×ATR) · mål +1% ${t1pct.toFixed(2)} (R/R ${rr1pct}) · 1R ${t1R.toFixed(2)}${size}`;
}

/* ------------------------- print ------------------------- */
const f = (v, d = 1, w = 6) => v == null ? '–'.padStart(w) : v.toFixed(d).padStart(w);
function daysUntilEarnings(ticker) {
  const d = EARNINGS[ticker];
  if (!d) return null;
  const diff = Math.ceil((new Date(d + 'T00:00:00') - new Date()) / 86400000);
  return diff;
}
function warnings(r) {
  const w = [];
  const de = daysUntilEarnings(r.ticker);
  if (de != null && de >= 0 && de <= EARNINGS_WARN_DAYS) w.push(`⚠ RAPPORT om ${de} d`);
  if (r.gap != null && Math.abs(r.gap) >= 2) w.push(`⚠ gap ${r.gap > 0 ? '+' : ''}${r.gap.toFixed(1)}%`);
  return w.length ? '   ' + w.join(' · ') : '';
}
function row(r) {
  return `${r.name.padEnd(14)}${f(r.c, 2, 9)} | RS3m ${f(r.rs63)} | 1m ${f(r.r21)}% | RSI ${f(r.rsi, 0, 4)} | %B ${f(r.pctB, 2, 5)} | ATR ${f(r.atrPct)}% | vol ${f(r.vol, 1, 4)}x | ↔20dH ${f(r.dHigh20)}%${warnings(r)}`;
}
function section(title, items, dir = 'LONG', note = '') {
  console.log(`\n=== ${title} ===`);
  if (note) console.log(`    ${note}`);
  if (!items.length) { console.log('    Inga kvalificerade idag.'); return; }
  items.forEach((r, i) => { console.log(`${i + 1}. ${row(r)}`); console.log(plan(r, dir)); });
}

/* -------------------------- main -------------------------- */
async function main() {
  const dateStr = new Date().toISOString().slice(0, 10);
  console.log(`\nOMXS30 SCREENER · ${dateStr}`);
  console.log('Hämtar index + 30 bolag', '');

  // 0) Index — marknadsvädret
  let idx;
  try {
    const ib = await fetchDaily(INDEX_TICKER);
    const ic = ib.map(b => b.c);
    idx = {
      c: last(ic), r5: ret(ic, 5), r21: ret(ic, 21), r63: ret(ic, 63),
      rsi: rsi14(ic), above50: last(ic) > sma(ic, 50), above200: last(ic) > sma(ic, 200),
    };
  } catch (e) {
    console.log(`(Kunde inte hämta index ^OMX: ${e.message} — kör utan RS-justering)`);
    idx = { r21: 0, r63: 0 };
  }

  // 1) Bolagen
  const rows = [], failed = [];
  for (const [ticker, name] of TICKERS) {
    try {
      rows.push(analyse(name, ticker, await fetchDaily(ticker), idx));
      process.stdout.write('.');
    } catch (e) { failed.push(`${ticker} (${e.message})`); process.stdout.write('x'); }
    await new Promise(res => setTimeout(res, 250));
  }
  console.log('\n');

  // Marknadsväder
  if (idx.c != null) {
    const weather = idx.above50 && idx.above200 ? 'MEDVIND (index över SMA50 & SMA200 — long-setups gynnade)'
      : idx.above50 ? 'BLANDAT (över SMA50, under SMA200 — selektiv)'
      : 'MOTVIND (index under SMA50 — long kräver extra starkt case, studsar opålitliga)';
    console.log(`MARKNADSVÄDER  OMXS30 ${idx.c.toFixed(1)} | 5d ${f(idx.r5)}% | 1m ${f(idx.r21)}% | 3m ${f(idx.r63)}% | RSI ${f(idx.rsi, 0, 3)}`);
    console.log(`               → ${weather}`);
  }

  zscore(rows, 'rs63'); zscore(rows, 'rs21');

  // 1. MOMENTUM — RS mot index, i trend, ej överköpt, levande volla
  rows.forEach(r => {
    r.momScore = 0.6 * r.z_rs63 + 0.4 * r.z_rs21;
    if (r.rsi != null && r.rsi > 75) r.momScore -= 0.6;
    if (r.atrPct != null && r.atrPct < 0.8) r.momScore -= 0.5;
    if (!r.above50) r.momScore -= 1.0;
  });
  const momentum = [...rows].filter(r => r.above50).sort((a, b) => b.momScore - a.momScore).slice(0, 5);

  // 2. SQUEEZE / UTBROTT — hoptryckta band nära 20d-högsta
  const squeeze = [...rows]
    .filter(r => r.bwPct != null && r.bwPct < 20 && r.dHigh20 > -2.5 && r.above50)
    .sort((a, b) => a.bwPct - b.bwPct).slice(0, 4);

  // 3. STUDS — RSI<35 ELLER under nedre bandet, men i intakt längre trend
  const bounce = [...rows]
    .filter(r => ((r.rsi != null && r.rsi < 35) || (r.pctB != null && r.pctB < 0.05))
              && r.above200 && (r.r63 ?? -1) > 0)
    .sort((a, b) => (a.pctB ?? 1) - (b.pctB ?? 1)).slice(0, 4);

  // 4. SVAGAST — under SMA50, sämst RS, inte redan panik-översåld
  const weakest = [...rows]
    .filter(r => !r.above50 && (r.rsi == null || r.rsi > 30))
    .sort((a, b) => a.momScore - b.momScore).slice(0, 3);

  section('1 · MOMENTUM — relativ styrka mot index (fortsättnings-long)', momentum, 'LONG',
    'Starkast i flocken, i trend, ej överköpt. Bäst i medvind.');
  section('2 · SQUEEZE — hoptryckta Bollinger nära högsta (utbrottsvakt)', squeeze, 'LONG',
    'Låg bandbredd-percentil = laddad fjäder. Invänta utbrott — jaga inte i förväg.');
  section('3 · STUDS — översålda i intakt trend (rekyl-long, kort horisont)', bounce, 'LONG',
    'RSI<35 eller under nedre bandet, men över SMA200 och positiv 3m.');
  section('4 · SVAGAST — undvik long / ev. short-idéer', weakest, 'SHORT',
    'Under SMA50, sämst relativ styrka. Short i mini-future = egen riskkalkyl.');

  logCandidates(dateStr, { momentum, squeeze, bounce, weakest });

  if (failed.length) console.log(`\nMisslyckade tickers: ${failed.join(', ')}`);

  console.log(`
─────────────────────────────────────────────────────────────
DIN DEL AV JOBBET:
 1. Ta topp 3–5 till Claude: "kolla nyheter/rapporter/makro på X, Y, Z".
    Screenern ser INTE rapportdatum eller nyheter — det är människans jobb.
 2. Välj 0–2. Ingen kvalificerad = ingen trade. Det är disciplin, inte passivitet.
 3. Positionsstorlek: riskera en FAST liten andel av kapitalet per trade
    (stop-avståndet ovan ger kronor per aktie → antal aktier därefter).
 4. LOGGA varje trade (setup, val, utfall). Efter 20–30 trades: kör vinst-
    andel + payoff genom Monte Carlo-Oraklet = då VET du om edgen finns.
Urvalsverktyg, inte rådgivning. Beslut och risk är dina.
─────────────────────────────────────────────────────────────`);
}

main().catch(e => { console.error('Fel:', e.message); process.exit(1); });
