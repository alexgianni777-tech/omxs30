'use strict';
// Only adopt a matching COMPLETED Yahoo 1d session from the same source.
// Never extrapolate from intraday data or silently use the prior session.
function selectCompletedDailyBar(timestamps, quote, targetDate, ticker) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate) || !Array.isArray(timestamps) ||
      !quote || !Array.isArray(quote.close)) {
    throw new Error('DATA_NOT_READY: invalid recent daily response');
  }
  let found = null;
  for (let i=0; i<timestamps.length; i++) {
    const t=timestamps[i];
    if (!Number.isFinite(t)) continue;
    if (new Date(t*1000).toISOString().slice(0,10)!==targetDate) continue;
    if (found) throw new Error('DATA_NOT_READY: duplicate recent daily session '+ticker);
    const o=quote.open?.[i], h=quote.high?.[i], l=quote.low?.[i], c=quote.close?.[i];
    const v=quote.volume?.[i];
    if (![o,h,l,c].every(n=>Number.isFinite(n)&&n>0) ||
        h<l || h+1e-8<Math.max(o,c) || l-1e-8>Math.min(o,c) ||
        !Number.isFinite(v) || v<0 || (ticker!=='^OMX' && v===0)) {
      throw new Error('DATA_NOT_READY: invalid recent daily OHLCV '+ticker+' '+targetDate);
    }
    found={t,o,h,l,c,v};
  }
  return found; // null is NOT an invitation to borrow D-2.
}
module.exports={selectCompletedDailyBar};
