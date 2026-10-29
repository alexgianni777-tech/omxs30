'use strict';

// Gate reconstructed Stockholm daily bars using actual 5-minute coverage.
// Missing data must delay the screener instead of creating false precision.
const clock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});
function localMarketTime(timestampSeconds) {
  if (!Number.isFinite(timestampSeconds)) return null;
  const parts = Object.fromEntries(clock.formatToParts(new Date(timestampSeconds * 1000))
    .filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return {
    date: parts.year + '-' + parts.month + '-' + parts.day,
    minuteOfDay: Number(parts.hour) * 60 + Number(parts.minute)
  };
}

function validateAndAggregateIntraday(timestamp, quote, targetDate, ticker) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate) ||
      !Array.isArray(timestamp) || !quote || !Array.isArray(quote.close)) {
    throw new Error('DATA_NOT_READY: ogiltig intradagsserie');
  }
  // Nasdaq Stockholm normal cash session 09:00–17:30, local; on shortened
  // sessions prefer the confirmed official daily bar over reconstruction.
  const MIN_CANDLES = 75; // about 102 expected five-minute bars
  const candles = [], seen = new Set();
  for (let i = 0; i < timestamp.length; i++) {
    const t = timestamp[i], local = localMarketTime(t);
    if (!local || local.date !== targetDate ||
        local.minuteOfDay < 540 || local.minuteOfDay > 1050) continue;
    if (seen.has(t)) throw new Error('DATA_NOT_READY: dubbla intradagsstaplar för ' + ticker);
    seen.add(t);
    const o = quote.open?.[i], h = quote.high?.[i], l = quote.low?.[i], c = quote.close?.[i];
    const v = quote.volume?.[i];
    if (![o,h,l,c].every(n => Number.isFinite(n) && n > 0) ||
        h + 1e-8 < Math.max(o,c) || l - 1e-8 > Math.min(o,c) || h < l ||
        (v != null && (!Number.isFinite(v) || v < 0))) {
      throw new Error('DATA_NOT_READY: ogiltigt OHLCV i intradagsdata för ' + ticker);
    }
    candles.push({t, minute:local.minuteOfDay, o, h, l, c, v});
  }
  candles.sort((a,b) => a.t - b.t);
  const first = candles[0], last = candles[candles.length - 1];
  if (candles.length < MIN_CANDLES || !first || !last ||
      first.minute > 560 || last.minute < 1020) {
    throw new Error('DATA_NOT_READY: ofullständig intradag ' + ticker + ' ' + targetDate +
      ': ' + candles.length + ' 5m-staplar');
  }
  for (let i = 1; i < candles.length; i++) {
    const gap = (candles[i].t - candles[i-1].t) / 60;
    if (gap <= 0 || gap > 30) {
      throw new Error('DATA_NOT_READY: intradagslucka ' + ticker + ' ' + targetDate + ': ' + gap + ' min');
    }
  }
  const volumeMissing = candles.filter(x => x.v == null).length;
  const volume = candles.reduce((s,x) => s + (x.v ?? 0), 0);
  if (ticker !== '^OMX' && (volume <= 0 || volumeMissing > candles.length * 0.2)) {
    throw new Error('DATA_NOT_READY: ofullständig volymdata ' + ticker + ' ' + targetDate);
  }
  return {
    t: Math.floor(Date.parse(targetDate + 'T12:00:00Z') / 1000),
    o: first.o, h: Math.max(...candles.map(x => x.h)),
    l: Math.min(...candles.map(x => x.l)), c: last.c, v: volume,
  };
}
module.exports = {localMarketTime, validateAndAggregateIntraday};
