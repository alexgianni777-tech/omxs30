'use strict';

// SCA och SKF först. Modell för SHORT-SQUEEZE-/vändningsbevakning, INTE köporder.
// Dagliga datapunkter från FI:s aggregerade blankningsregister (>0,1%).
// Varje observations datum jämförs med prisdatas datum: ingen lookahead.
const fs = require('fs');
const history = require('./short-interest-history.json');

const WATCH_TICKERS = Object.freeze(['SCA-B.ST', 'SKF-B.ST']);
const MIN_SHORT_PCT = 5;
const MIN_VOL_MULTIPLIER = 1.5;
const MAX_STALE_WEEKDAYS = 3;

function validDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
    && !Number.isNaN(Date.parse(s+'T00:00:00Z'));
}
function weekdaysApart(older, newer) {
  if (!validDate(older)||!validDate(newer)||older>newer) return Infinity;
  const start=new Date(older+'T00:00:00Z'),end=new Date(newer+'T00:00:00Z');
  let count=0;
  for (let d=new Date(start);d<end;) {
    d.setUTCDate(d.getUTCDate()+1);
    if (d.getUTCDay()!==0&&d.getUTCDay()!==6) count++;
    if (count>10000) return Infinity;
  }
  return count;
}
function getInterest(ticker, dataDate, dataset=history) {
  if (!validDate(dataDate)) throw new Error('invalid dataDate');
  const snaps=(dataset.snapshots||[])
    .filter(s=>validDate(s.asOfDate)&&validDate(s.sourcePublished)
      && s.asOfDate<=dataDate && s.sourcePublished<=dataDate
      && Number.isFinite(s.rows?.[ticker]?.shortPct))
    .sort((a,b)=>a.asOfDate.localeCompare(b.asOfDate));
  const latest=snaps.at(-1);
  if (!latest) return {status:'MISSING'};
  const age=weekdaysApart(latest.asOfDate,dataDate);
  const previous=snaps.length>1?snaps.at(-2):null;
  const delta=previous ? latest.rows[ticker].shortPct-previous.rows[ticker].shortPct : null;
  // Trends require observations spanning >=5 weekdays, not one lucky daily change.
  const older=snaps.filter(s=>{
    const lag=weekdaysApart(s.asOfDate,latest.asOfDate);
    return lag>=5 && lag<=10;
  }).at(-1);
  const trend5=older ? latest.rows[ticker].shortPct-older.rows[ticker].shortPct : null;
  return {
    status:age>MAX_STALE_WEEKDAYS?'STALE':'OK',
    shortPct:latest.rows[ticker].shortPct,
    asOfDate:latest.asOfDate, positionDate:latest.rows[ticker].positionDate??null,
    source:latest.source, ageWeekdays:age,
    previousPct:previous?.rows[ticker]?.shortPct??null,
    delta:delta==null?null:Number(delta.toFixed(3)),
    trend5:trend5==null?null:Number(trend5.toFixed(3)),
  };
}
function technicalReversal(bars, r) {
  if (!Array.isArray(bars)||bars.length<22 || !Number.isFinite(r?.c))
    return {trigger:null, high20:null};
  const prior20=bars.slice(-21,-1);
  const prev=bars.at(-2),now=bars.at(-1);
  const prevHigh=Math.max(...prior20.map(b=>b.h));
  const prevSMA=prior20.reduce((sum,b)=>sum+b.c,0)/20;
  if (![prevHigh,prevSMA,now?.c,prev?.c,r.sma20].every(Number.isFinite))
    return {trigger:null,high20:null};
  if (now.c>prevHigh && prev.c<=prevHigh) return {trigger:'20D_BREAKOUT', high20:prevHigh};
  if (now.c>r.sma20 && prev.c<=prevSMA) return {trigger:'SMA20_RECLAIM', high20:prevHigh};
  return {trigger:null,high20:prevHigh};
}
function evaluateShortSqueeze(ticker, r, bars, dataDate, dataset=history) {
  const si=getInterest(ticker,dataDate,dataset);
  const tech=technicalReversal(bars,r);
  const volumeConfirmed=Number.isFinite(r?.vol)&&r.vol>=MIN_VOL_MULTIPLIER;
  const goodPct=Number.isFinite(si.shortPct)&&si.shortPct>=MIN_SHORT_PCT;
  const technicalAlert=si.status==='OK'&&goodPct&&volumeConfirmed&&!!tech.trigger;
  const status=si.status==='MISSING'?'DATA_MISSING':si.status==='STALE'?'DATA_STALE'
    :!goodPct?'LOW_SHORT_INTEREST':technicalAlert?'TECHNICAL_WATCH':'WATCH';
  return {ticker,name:r?.name??ticker,close:r?.c??null,status,
    interest:si,trigger:technicalAlert?tech.trigger:null,
    high20:tech.high20,volume:r?.vol??null,volumeConfirmed,
    // Requires MANUAL catalyst, derivative spread, and current price verification.
    executable:false};
}
function renderWatch(w) {
  const p=w.interest;
  const pct=Number.isFinite(p.shortPct)?p.shortPct.toFixed(2)+'%':'saknas';
  const delta=p.delta==null?'trend ej verifierad'
    :('senaste förändring '+(p.delta>0?'+':'')+p.delta.toFixed(2)+' procentenheter');
  const longer=p.trend5==null?'5–10 d trend: saknas'
    :'5–10 d trend: '+(p.trend5>0?'+':'')+p.trend5.toFixed(2)+' p.e.';
  const pvol=Number.isFinite(w.volume)?w.volume.toFixed(1)+'×':'okänd';
  const when=p.asOfDate||'okänt datum';
  const close=Number.isFinite(w.close)?w.close.toFixed(2):'–';
  const signal=w.status==='TECHNICAL_WATCH'?'⚠ TEKNISK VÄNDNING – BEKRÄFTA MANUELLT'
    :w.status==='WATCH'?'BEVAKA (ingen bekräftad entry)'
    :w.status==='DATA_STALE'?'GAMMAL BLANKNINGSDATA – INGEN SIGNAL'
    :w.status==='DATA_MISSING'?'SAKNAR BLANKNINGSDATA – INGEN SIGNAL'
    :'UNDER 5% BLANKNING – INGEN SIGNAL';
  const mode=w.trigger==='20D_BREAKOUT'?'20d-utbrott'
    :w.trigger==='SMA20_RECLAIM'?'återtag av SMA20':'ingen breakout/återtag med volym';
  return '   '+w.name+' '+close+' kr | blankning '+pct+' ('+when+')'
    +' | '+delta+' | '+longer+' | vol '+pvol
    +' | '+signal+' | '+mode;
}
function logWatch(dateStr, dataDate, watches, path='short-squeeze-watch.csv') {
  const header='reportDate,dataDate,ticker,name,close,shortPct,shortAsOf,shortAgeWeekdays,deltaPp,trend5Pp,volMultiplier,trigger,status\n';
  if (!fs.existsSync(path)) fs.writeFileSync(path,header);
  const existing=fs.readFileSync(path,'utf8');
  const seen=new Set(existing.split(/\r?\n/).slice(1).map(line=>line.split(',').slice(0,3).join(',')));
  const safe=v=>v==null||!Number.isFinite(v)?'':v.toFixed(3);
  let appended=0;
  for(const w of watches){
    const key=[dateStr,dataDate,w.ticker].join(',');
    if(seen.has(key)) continue;
    const p=w.interest;
    fs.appendFileSync(path,[
      dateStr,dataDate,w.ticker,w.name,safe(w.close),safe(p.shortPct),
      p.asOfDate||'',Number.isFinite(p.ageWeekdays)?p.ageWeekdays:'',
      safe(p.delta),safe(p.trend5),safe(w.volume),w.trigger||'',w.status,
    ].join(',')+'\n');
    seen.add(key);appended++;
  }
  return appended;
}
module.exports={WATCH_TICKERS,weekdaysApart,getInterest,technicalReversal,
  evaluateShortSqueeze,renderWatch,logWatch};
