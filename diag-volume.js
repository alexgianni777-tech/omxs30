// diag-volume.js — diagnostiserar volymproblemet i omxs30-screener
// Kör med: node diag-volume.js
// Kräver Node 20+ (inbyggd fetch). Inga npm-paket behövs.

const TICKERS = [
  { name: 'Getinge',    yahoo: 'GETI-B.ST' },
  { name: 'SEB',        yahoo: 'SEB-A.ST'  },
  { name: 'Saab',       yahoo: 'SAAB-B.ST' },
  { name: 'Ericsson',   yahoo: 'ERIC-B.ST' },
  { name: 'Alfa Laval', yahoo: 'ALFA.ST'   },
];

async function fetchBars(ticker, days = 60) {
  const to   = Math.floor(Date.now() / 1000);
  const from = to - days * 86400;
  const url  = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}` +
               `?period1=${from}&period2=${to}&interval=1d&events=div%2Csplit`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${ticker}`);
  const j = await res.json();
  const r = j?.chart?.result?.[0];
  if (!r?.timestamp) throw new Error(`no data for ${ticker}`);
  const q = r.indicators.quote[0];
  const bars = [];
  for (let i = 0; i < r.timestamp.length; i++) {
    if (q.close[i] == null) continue;
    bars.push({
      date: new Date(r.timestamp[i] * 1000).toISOString().slice(0, 10),
      v: q.volume[i] ?? 0,
      c: q.close[i],
    });
  }
  return bars;
}

function last(arr) { return arr[arr.length - 1]; }

function volSurgeOLD(bars, n = 20) {
  if (bars.length < n + 1) return null;
  const avg = bars.slice(-n - 1, -1).reduce((a, b) => a + b.v, 0) / n;
  return avg ? last(bars).v / avg : null;
}

function volSurgeNEW(bars, n = 20) {
  if (bars.length < n + 1) return null;
  const avg = bars.slice(-n - 1, -1).reduce((a, b) => a + b.v, 0) / n;
  const todayVol = last(bars).v;
  if (!todayVol) {
    if (bars.length < n + 2) return null;
    const prevAvg = bars.slice(-n - 2, -2).reduce((a, b) => a + b.v, 0) / n;
    return prevAvg ? bars[bars.length - 2].v / prevAvg : null;
  }
  return avg ? todayVol / avg : null;
}

async function main() {
  const now = new Date().toISOString();
  console.log(`=== VOLYM-DIAGNOS (${now}) ===\n`);

  for (const { name, yahoo } of TICKERS) {
    try {
      const bars = await fetchBars(yahoo);
      const last3 = bars.slice(-3);
      const old = volSurgeOLD(bars);
      const fixed = volSurgeNEW(bars);

      console.log(`${name} (${yahoo})`);
      console.log(`  Senaste 3 bars:`);
      last3.forEach(b => console.log(`    ${b.date}  vol=${b.v}  close=${b.c}`));
      console.log(`  volSurge GAMLA:  ${old   != null ? old.toFixed(2)   + 'x' : 'null'}`);
      console.log(`  volSurge FIXADE: ${fixed != null ? fixed.toFixed(2) + 'x' : 'null'}`);
      console.log();
    } catch (e) {
      console.log(`${name}: FEL — ${e.message}\n`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
