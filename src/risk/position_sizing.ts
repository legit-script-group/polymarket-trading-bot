/**
 * Position sizing: max notional per trade from risk params.
 */

export function sizeByCapital(
  capital: number,
  riskPerTrade: number,
  price: number,
  maxPct?: number
): number {
  if (price <= 0 || capital <= 0) return 0;
  let maxNotional = capital * riskPerTrade;
  if (maxPct != null) maxNotional = Math.min(maxNotional, capital * maxPct);
  return Math.max(0, maxNotional / price);
}

export function sizeByStop(
  capital: number,
  riskPerTrade: number,
  price: number,
  stopLossPct: number,
  maxPct?: number
): number {
  if (price <= 0 || stopLossPct <= 0 || capital <= 0) return 0;
  const riskAmount = capital * riskPerTrade;
  const lossPerShare = price * stopLossPct;
  let size = riskAmount / lossPerShare;
  if (maxPct != null) {
    const capSize = (capital * maxPct) / price;
    size = Math.min(size, capSize);
  }
  return Math.max(0, size);
}
