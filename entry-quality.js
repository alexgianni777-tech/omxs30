'use strict';

/**
 * Entry feasibility check independent of the original screener signal.
 * Never modifies historical plans. No market data fetches.
 * status: READY, MISSED_ENTRY, PLAN_BROKEN, STALE_PRICE, INVALID
 */
function evaluateEntry({ side, entry, stop, target, currentPrice, priceAsOf, now, maxAgeMinutes = 20, maxDriftR = 0.5, minRR = 1.2 }) {
  const nums = [entry, stop, target, currentPrice];
  if (!nums.every(x => Number.isFinite(x) && x > 0) || !['LONG','SHORT'].includes(side))
    return { status: 'INVALID', reason: 'Missing or invalid prices' };
  const sign = side === 'LONG' ? 1 : -1;
  const risk = sign * (entry - stop);
  const reward = sign * (target - entry);
  if (!(risk > 0 && reward > 0)) return { status: 'INVALID', reason: 'Invalid plan direction' };
  const timestamp = Date.parse(priceAsOf || '');
  const clock = now ? Date.parse(now) : Date.now();
  if (!Number.isFinite(timestamp) || !Number.isFinite(clock) || timestamp > clock + 60000 ||
      clock - timestamp > maxAgeMinutes * 60000)
    return { status: 'STALE_PRICE', reason: 'Quote timestamp missing, future or stale' };
  const remainingRisk = sign * (currentPrice - stop);
  const remainingReward = sign * (target - currentPrice);
  const driftR = sign * (currentPrice - entry) / risk;
  if (remainingRisk <= 0 || remainingReward <= 0)
    return { status: 'PLAN_BROKEN', reason: 'Stop or target crossed', driftR };
  const currentRR = remainingReward / remainingRisk;
  const status = driftR > maxDriftR || currentRR < minRR ? 'MISSED_ENTRY' : 'READY';
  return { status, plannedRR: reward / risk, currentRR, driftR, reason: status === 'READY' ? 'Entry within configured tolerance' : 'Entry moved too far or remaining R/R too low' };
}
module.exports = { evaluateEntry };
