'use strict';

/**
 * ============================================================
 *  OMXS30 WALK-FORWARD BACKTEST  ·  node backtest.js
 * ============================================================
 *  Testar rankningsREGELN på ~2 års historik INNAN du riskerar en
 *  krona — och svarar samtidigt på din fråga: HUR LÄNGE ska jag hålla?
 *
 *  Varje vecka (måndag) rankas de 30 bolagen på relativ styrka
 *  (samma momentum-logik som screenern). Vi "tar" topp-N och mäter
 *  utfallet under flera olika EXIT-regler, så du ser vilken hålltid
 *  som faktiskt tjänat mest historiskt:
 *
 *    - Fast hålltid: 1, 2, 3, 5, 10 handelsdagar
 *    - Mål + stop:   +1% mål / -1.2×ATR stop (din dagtrade-plan)
 *    - Trailing:     håll tills priset stänger under SMA10
 *
 *  Resultat per exit: träffsäkerhet, snitt-R, förväntan, total, och
 *  en Monte Carlo (sannolikhet att vara i vinst, drawdown).
 *
 *  VIKTIGT om ärlighet: detta är en FÖRENKLAD backtest. Den räknar
 *  på stängningskurser, antar att du kan gå in på nästa öppning, och
 *  drar ett schablon-courtage. Den bevisar inte framtida vinst — den
 *  filtrerar bort regler som aldrig ens fungerat i backspegeln. En
 *  regel som faller här ska du inte handla. En som klarar sig är
 *  LOVANDE, inte garanterad (överanpassningsrisk kvarstår).
 * ============================================================
 */

const INDEX_TICKER = '^OMX';
const TICKERS = [
  'ABB.ST','ALFA.ST','ASSA-B.ST','AZN.ST','ATCO-A.ST','ALIV-SDB.ST','BOL.ST','ELUX-B.ST',
  'EPI-A.ST','ERIC-B.ST','ESSITY-B.ST','EVO.ST','GETI-B.ST','HEXA-B.ST','HM-B.ST','INVE-B.ST',
  'NDA-SE.ST','NIBE-B.ST','SAAB-B.ST','SAND.ST','SCA-B.ST','SEB-A.ST','SHB-A.ST','SKA-B.ST',
  'SKF-B.ST','SSAB-A.ST','SWED-A.ST','TEL2-B.ST','TELIA.ST','VOLV-B.ST',
];

const TOP_N = 2;              // hur många toppkandidater vi "tar" per vecka
const COMMISSION_PCT = 0.05;  // schablon rundtur i % (justera till din mäklare/courtage)
const YEARS = 2;
const SIMULATIONS = 10000;

/* ---------------- data ---------------- */
async function fetchDaily(ticker, days, tries = 3) {
  const to = Math.floor(Date.now() / 1000), from = to - days * 86400;
  const hosts = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
  let lastErr;
  for (let a = 0; a < tries; a++) {
    try {
      const url = `https://${hosts[a % 2]}/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${from}&period2=${to}&interval=1d`;
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const r = (await res.json())?.chart?.result?.[0];
      if (!r?.timestamp) throw new Error('no data');
      const q = r.indicators.quote[0];
      const bars = [];
      for (let i = 0; i < r.timestamp.length; i++) {
        if (q.close[i] == null || q.open[i] == null) continue;
        bars.push({ t: r.timestamp[i], o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i] });
      }
      return bars;
    } catch (e) { lastErr = e; await new Promise(r => setTimeout(r, 600 * (a + 1))); }
  }
  throw lastErr;
}

/* ---------------- helpers ---------------- */
function atrAt(bars, i, n = 14) {
  if (i < n) return null;
  let s = 0;
  for (let k = i - n + 1; k <= i; k++) {
    s += Math.max(bars[k].h - bars[k].l, Math.abs(bars[k].h - bars[k - 1].c), Math.abs(bars[k].l - bars[k - 1].c));
  }
  return s / n;
}
function smaAt(closes, i, n) {
  if (i < n - 1) return null;
  let s = 0; for (let k = i - n + 1; k <= i; k++) s += closes[k];
  return s / n;
}
function retAt(closes, i, days) {
  if (i < days) return null;
  return closes[i] / closes[i - days] - 1;
}

/* ---------------- exit-regler ----------------
   Var och en tar (bars, entryIndex) och returnerar utfallet i R,
   där 1R = stop-avståndet (1.2×ATR vid entry). Entry sker på
   öppningen dagen EFTER signaldagen (index = entryIndex).            */
function makeExits() {
  const fixed = days => (bars, e) => {
    const atr = atrAt(bars, e - 1); if (!atr) return null;
    const entry = bars[e].o, stopDist = 1.2 * atr;
    const exitIdx = Math.min(e + days, bars.length - 1);
    let raw = bars[exitIdx].c - entry;
    // kolla om stop träffades på vägen (konservativt: low under stop)
    for (let k = e; k <= exitIdx; k++) if (bars[k].l <= entry - stopDist) { raw = -stopDist; break; }
    return raw / stopDist - COMMISSION_PCT / 100 * entry / stopDist;
  };
  const targetStop = (bars, e) => {
    const atr = atrAt(bars, e - 1); if (!atr) return null;
    const entry = bars[e].o, stopDist = 1.2 * atr, target = entry * 1.01;
    for (let k = e; k < Math.min(e + 10, bars.length); k++) {
      if (bars[k].l <= entry - stopDist) return -1 - COMMISSION_PCT / 100 * entry / stopDist;
      if (bars[k].h >= target) return (target - entry) / stopDist - COMMISSION_PCT / 100 * entry / stopDist;
    }
    const last = bars[Math.min(e + 9, bars.length - 1)].c;
    return (last - entry) / stopDist - COMMISSION_PCT / 100 * entry / stopDist;
  };
  const trailSMA = (bars, e) => {
    const atr = atrAt(bars, e - 1); if (!atr) return null;
    const closes = bars.map(b => b.c), entry = bars[e].o, stopDist = 1.2 * atr;
    for (let k = e; k < Math.min(e + 30, bars.length); k++) {
      if (bars[k].l <= entry - stopDist) return -1 - COMMISSION_PCT / 100 * entry / stopDist;
      const sma10 = smaAt(closes, k, 10);
      if (sma10 && bars[k].c < sma10) return (bars[k].c - entry) / stopDist - COMMISSION_PCT / 100 * entry / stopDist;
    }
    const last = bars[Math.min(e + 29, bars.length - 1)].c;
    return (last - entry) / stopDist;
  };
  return {
    'håll 1 dag': fixed(1), 'håll 2 dgr': fixed(2), 'håll 3 dgr': fixed(3),
    'håll 5 dgr': fixed(5), 'håll 10 dgr': fixed(10),
    'mål+1% / stop': targetStop, 'trail < SMA10': trailSMA,
  };
}

/* ---------------- Monte Carlo ---------------- */
function mc(returns) {
  if (returns.length < 5) return null;
  let profit = 0, ruin = 0; const finals = [];
  for (let s = 0; s < SIMULATIONS; s++) {
    let eq = 100, peak = 100, ruined = false;
    for (let i = 0; i < 100; i++) { eq += returns[Math.floor(Math.random() * returns.length)]; if (eq > peak) peak = eq; if (eq <= 50) ruined = true; }
    finals.push(eq); if (eq > 100) profit++; if (ruined) ruin++;
  }
  finals.sort((a, b) => a - b);
  return { pProfit: profit / SIMULATIONS, pRuin: ruin / SIMULATIONS, median: finals[5000] - 100 };
}

/* ---------------- backtest ---------------- */
async function main() {
  console.log(`\nOMXS30 WALK-FORWARD BACKTEST · ${new Date().toISOString().slice(0, 10)}`);
  console.log(`Topp-${TOP_N} momentum varje vecka · ${YEARS} år · courtage ${COMMISSION_PCT}% rundtur\n`);

  const days = YEARS * 365 + 90;
  console.log('Hämtar index + 30 bolag (kan ta ~1 min)…');
  let idxBars;
  try { idxBars = await fetchDaily(INDEX_TICKER, days); }
  catch (e) { console.error('Kunde inte hämta index:', e.message); process.exit(1); }

  const data = {};
  let fails = 0;
  for (const t of TICKERS) {
    try { data[t] = await fetchDaily(t, days); process.stdout.write('.'); }
    catch (e) { fails++; process.stdout.write('x'); }
    await new Promise(r => setTimeout(r, 250));
  }
  console.log(`\nHämtade ${Object.keys(data).length}/${TICKERS.length} bolag.\n`);

  // gemensam tidsaxel via index-datum; för varje måndag, ranka och ta topp-N
  const idxClose = idxBars.map(b => b.c);
  const exits = makeExits();
  const results = {}; for (const name in exits) results[name] = [];

  for (let i = 80; i < idxBars.length - 11; i++) {
    const d = new Date(idxBars[i].t * 1000);
    if (d.getUTCDay() !== 1) continue;            // bara måndagar (veckostart)
    const idxR63 = retAt(idxClose, i, 63);
    if (idxR63 == null) continue;

    // ranka bolagen på relativ styrka mot index (RS = bolagets 63d − index 63d), måste vara över SMA50
    const ranked = [];
    for (const t in data) {
      const bars = data[t];
      // hitta motsvarande bar-index i bolagets serie (närmaste datum)
      let j = bars.findIndex(b => b.t >= idxBars[i].t);
      if (j < 64 || j >= bars.length - 11) continue;
      const closes = bars.map(b => b.c);
      const rs = retAt(closes, j, 63) - idxR63;
      const above50 = closes[j] > (smaAt(closes, j, 50) ?? Infinity);
      const r21 = retAt(closes, j, 21);
      if (rs == null || !above50 || r21 == null) continue;
      ranked.push({ t, j, score: 0.6 * rs + 0.4 * (r21 - (retAt(idxClose, i, 21) ?? 0)) });
    }
    ranked.sort((a, b) => b.score - a.score);
    const picks = ranked.slice(0, TOP_N);

    for (const p of picks) {
      const bars = data[p.t], e = p.j + 1;        // entry nästa dag
      if (e >= bars.length) continue;
      for (const name in exits) {
        const R = exits[name](bars, e);
        if (R != null && isFinite(R)) results[name].push(R);
      }
    }
  }

  // sammanställ
  const rows = [];
  for (const name in results) {
    const arr = results[name];
    if (arr.length < 10) { rows.push({ name, n: arr.length, note: 'för få' }); continue; }
    const wins = arr.filter(r => r > 0);
    const winRate = wins.length / arr.length;
    const avgWin = wins.reduce((a, r) => a + r, 0) / (wins.length || 1);
    const losses = arr.filter(r => r <= 0);
    const avgLoss = Math.abs(losses.reduce((a, r) => a + r, 0) / (losses.length || 1));
    const exp = arr.reduce((a, r) => a + r, 0) / arr.length;
    const total = arr.reduce((a, r) => a + r, 0);
    const m = mc(arr);
    rows.push({ name, n: arr.length, winRate, avgWin, avgLoss, exp, total, m });
  }

  // skriv ut, sorterat på förväntan
  rows.filter(r => r.exp != null).sort((a, b) => b.exp - a.exp);
  console.log('EXIT-REGEL          trades  träff   snittV  snittF   förv/trade   total    P(vinst 100)  P(ruin)');
  console.log('─'.repeat(96));
  for (const r of rows.sort((a, b) => (b.exp ?? -9) - (a.exp ?? -9))) {
    if (r.note) { console.log(`${r.name.padEnd(18)} ${String(r.n).padStart(5)}   (${r.note})`); continue; }
    const p = (v, w, d = 2) => (v >= 0 ? '+' : '') + v.toFixed(d);
    console.log(
      `${r.name.padEnd(18)} ${String(r.n).padStart(5)}  ${(r.winRate * 100).toFixed(0).padStart(4)}%  ` +
      `${p(r.avgWin).padStart(6)}R ${('-' + r.avgLoss.toFixed(2)).padStart(6)}R   ` +
      `${p(r.exp).padStart(7)}R  ${p(r.total, 0, 1).padStart(7)}R   ` +
      `${r.m ? (r.m.pProfit * 100).toFixed(0) + '%' : '–'}`.padStart(11) +
      `   ${r.m ? (r.m.pRuin * 100).toFixed(1) + '%' : '–'}`.padStart(8)
    );
  }

  console.log(`
─────────────────────────────────────────────────────────────
SÅ SVARAR DETTA PÅ "HUR LÄNGE SKA JAG HÅLLA":
 • Raden med högst förväntan/trade visar vilken hålltid som historiskt
   lönat sig bäst för just denna entry-regel.
 • Jämför "håll 1/2/3/5/10 dgr": stiger förväntan med tiden? → låt vinnare
   löpa längre. Sjunker den? → din edge är kortsiktig, ta vinsten snabbt.
 • "trail < SMA10" låter vinnare löpa men skär förlorare → ofta bästa
   kompromissen om förväntan håller och drawdown är rimlig.
ÄRLIG VARNING: detta är historik med förenklingar (stängningskurser,
schablon-courtage). En regel som FALLER här ska du inte handla. En som
klarar sig är lovande — bekräfta sen live i smått via evaluate.js.
─────────────────────────────────────────────────────────────`);
  if (fails) console.log(`(${fails} bolag kunde inte hämtas — resultatet är något ofullständigt.)`);
}

main().catch(e => { console.error('Fel:', e.message); process.exit(1); });
