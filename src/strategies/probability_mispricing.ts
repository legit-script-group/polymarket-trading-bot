/**
 * Probability Mispricing: buy when market < fair value, sell when market > fair value.
 */

import type { Signal } from "../types.js";
import { BaseStrategy } from "./base.js";
import type { Portfolio } from "../core/portfolio.js";
import type { MarketSnapshot } from "../types.js";
import { estimateFairProbability } from "../core/market_data.js";

export class ProbabilityMispricingStrategy extends BaseStrategy {
  get name(): string {
    return "probability_mispricing";
  }

  run(
    snapshot: Record<string, MarketSnapshot>,
    portfolio: Portfolio,
    marketSlugs: Record<string, string> = {},
    ctx?: { mid_history?: Record<string, [number, number][]> }
  ): Signal[] {
    if (!this.enabled || Object.keys(snapshot).length === 0) return [];

    const signals: Signal[] = [];
    const fairValueEdge = (this.params.fair_value_edge_min as number) ?? 0.03;
    const midHistory = ctx?.mid_history ?? {};

    for (const [tokenId, s] of Object.entries(snapshot)) {
      const marketSlug = marketSlugs[tokenId] ?? "";
      const recent = (midHistory[tokenId] ?? []).slice(-100).map(([, m]) => m);
      const fair = estimateFairProbability(s.mid, recent, 0.3);

      if (s.mid < fair - fairValueEdge) {
        signals.push({
          strategy_name: this.name,
          action: "BUY",
          token_id: tokenId,
          market_slug: marketSlug,
          price: s.ask,
          size: 0,
          reason: `mispricing: mid=${s.mid.toFixed(4)} < fair=${fair.toFixed(4)} - edge`,
          confidence: Math.min(1, (fair - s.mid) / fairValueEdge),
          metadata: { fair_value: fair },
        });
      } else if (s.mid > fair + fairValueEdge) {
        const pos = portfolio.getPosition(tokenId);
        if (pos && pos.size > 0) {
          signals.push({
            strategy_name: this.name,
            action: "SELL",
            token_id: tokenId,
            market_slug: marketSlug,
            price: s.bid,
            size: pos.size,
            reason: `mispricing: mid=${s.mid.toFixed(4)} > fair=${fair.toFixed(4)} + edge`,
            confidence: Math.min(1, (s.mid - fair) / fairValueEdge),
            metadata: { fair_value: fair },
          });
        }
      }
    }
    return signals;
  }
}
