/**
 * Liquidity Provision (market making): place bid/ask around mid with inventory limits.
 */

import type { Signal } from "../types.js";
import { BaseStrategy } from "./base.js";
import type { Portfolio } from "../core/portfolio.js";
import type { MarketSnapshot } from "../types.js";

export class LiquidityProvisionStrategy extends BaseStrategy {
  get name(): string {
    return "liquidity_provision";
  }

  run(
    snapshot: Record<string, MarketSnapshot>,
    portfolio: Portfolio,
    marketSlugs: Record<string, string> = {},
    ctx?: { token_mids?: Record<string, number> }
  ): Signal[] {
    if (!this.enabled || Object.keys(snapshot).length === 0) return [];

    const signals: Signal[] = [];
    const spreadBpsParam = (this.params.spread_bps as number) ?? 20;
    const inventoryLimitPct = (this.params.inventory_limit_pct as number) ?? 0.3;
    let equity = portfolio.totalEquity(ctx?.token_mids);
    if (equity <= 0) equity = portfolio.getUsd();

    for (const [tokenId, s] of Object.entries(snapshot)) {
      const marketSlug = marketSlugs[tokenId] ?? "";
      const pos = portfolio.getPosition(tokenId);
      const positionValue = pos && pos.size ? pos.size * s.mid : 0;
      const inventoryRatio = equity > 0 ? positionValue / equity : 0;

      const halfSpread = (spreadBpsParam / 10000) * s.mid * 0.5;
      const bidPrice = Math.max(0.01, s.mid - halfSpread);
      const askPrice = Math.min(0.99, s.mid + halfSpread);

      if (inventoryRatio < inventoryLimitPct) {
        signals.push({
          strategy_name: this.name,
          action: "BUY",
          token_id: tokenId,
          market_slug: marketSlug,
          price: bidPrice,
          size: 0,
          reason: "liquidity_provision: bid",
          confidence: 1,
          metadata: { order_type: "limit_mm", side: "bid" },
        });
      }
      const size = pos && pos.size > 0 ? pos.size : 0;
      if (inventoryRatio > -inventoryLimitPct) {
        signals.push({
          strategy_name: this.name,
          action: "SELL",
          token_id: tokenId,
          market_slug: marketSlug,
          price: askPrice,
          size,
          reason: "liquidity_provision: ask",
          confidence: 1,
          metadata: { order_type: "limit_mm", side: "ask" },
        });
      }
    }
    return signals;
  }
}
