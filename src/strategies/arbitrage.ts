/**
 * Spread Arbitrage: place orders inside wide bid/ask spread.
 */

import type { Signal } from "../types.js";
import { BaseStrategy } from "./base.js";
import type { Portfolio } from "../core/portfolio.js";
import type { MarketSnapshot } from "../types.js";
import { spreadBps } from "../core/market_data.js";

export class ArbitrageStrategy extends BaseStrategy {
  get name(): string {
    return "arbitrage";
  }

  run(
    snapshot: Record<string, MarketSnapshot>,
    portfolio: Portfolio,
    marketSlugs: Record<string, string> = {}
  ): Signal[] {
    if (!this.enabled || Object.keys(snapshot).length === 0) return [];

    const signals: Signal[] = [];
    const minBps = (this.params.min_spread_bps as number) ?? 50;
    const maxBps = (this.params.max_spread_bps as number) ?? 500;

    for (const [tokenId, s] of Object.entries(snapshot)) {
      const bps = spreadBps(s.bid, s.ask);
      if (bps < minBps || bps > maxBps) continue;

      const marketSlug = marketSlugs[tokenId] ?? "";
      const edgeBps = bps * 0.3;
      const buyPrice = Math.min(s.bid + (edgeBps / 10000) * s.mid, s.ask - 0.001);
      const sellPrice = Math.max(s.ask - (edgeBps / 10000) * s.mid, s.bid + 0.001);

      if (buyPrice < s.ask && buyPrice > s.bid) {
        signals.push({
          strategy_name: this.name,
          action: "BUY",
          token_id: tokenId,
          market_slug: marketSlug,
          price: buyPrice,
          size: 0,
          reason: `spread_arb: spread_bps=${bps.toFixed(0)}`,
          confidence: Math.min(1, bps / 200),
          metadata: { spread_bps: bps },
        });
      }
      const pos = portfolio.getPosition(tokenId);
      if (pos && pos.size > 0 && sellPrice > s.bid && sellPrice < s.ask) {
        signals.push({
          strategy_name: this.name,
          action: "SELL",
          token_id: tokenId,
          market_slug: marketSlug,
          price: sellPrice,
          size: pos.size,
          reason: `spread_arb: spread_bps=${bps.toFixed(0)}`,
          confidence: Math.min(1, bps / 200),
          metadata: { spread_bps: bps },
        });
      }
    }
    return signals;
  }
}
