/**
 * Exposure limits: per-market and total notional caps.
 */

import type { Portfolio } from "../core/portfolio.js";
import type { Position } from "../types.js";

export function exposureNotional(
  portfolio: { getPositions(): Record<string, Position> },
  tokenMids?: Record<string, number>
): Record<string, number> {
  const out: Record<string, number> = {};
  const positions = portfolio.getPositions();
  for (const [tid, pos] of Object.entries(positions)) {
    const mid = tokenMids?.[tid] ?? pos.current_mid ?? pos.avg_entry_price;
    out[tid] = pos.size * mid;
  }
  return out;
}

export function totalExposure(
  portfolio: { getPositions(): Record<string, Position> },
  tokenMids?: Record<string, number>
): number {
  return Object.values(exposureNotional(portfolio, tokenMids)).reduce((a, b) => a + b, 0);
}

export function marketExposure(
  portfolio: { getPositions(): Record<string, Position> },
  marketSlug: string,
  tokenMids?: Record<string, number>
): number {
  const positions = portfolio.getPositions();
  let total = 0;
  for (const pos of Object.values(positions)) {
    if (pos.market_slug !== marketSlug) continue;
    const mid = tokenMids?.[pos.token_id] ?? pos.current_mid ?? pos.avg_entry_price;
    total += pos.size * mid;
  }
  return total;
}

export function wouldExceedMarketCap(
  portfolio: { getPositions(): Record<string, Position> },
  marketSlug: string,
  newNotional: number,
  capPct: number,
  equity: number,
  tokenMids?: Record<string, number>
): boolean {
  const current = marketExposure(portfolio, marketSlug, tokenMids);
  return current + newNotional > equity * capPct;
}
