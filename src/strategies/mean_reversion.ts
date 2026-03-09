/**
 * Mean Reversion: trade when price deviates from recent average (z-score).
 */

import type { Signal } from "../types.js";
import { BaseStrategy } from "./base.js";
import type { Portfolio } from "../core/portfolio.js";
import type { MarketSnapshot } from "../types.js";

function zScore(value: number, mean: number, std: number): number {
  if (std <= 0) return 0;
  return (value - mean) / std;
}

export class MeanReversionStrategy extends BaseStrategy {
  get name(): string {
    return "mean_reversion";
  }

  run(
    snapshot: Record<string, MarketSnapshot>,
    portfolio: Portfolio,
    marketSlugs: Record<string, string> = {},
    ctx?: { mid_history?: Record<string, [number, number][]>; now_ts?: number }
  ): Signal[] {
    if (!this.enabled || Object.keys(snapshot).length === 0) return [];

    const signals: Signal[] = [];
    const lookbackSeconds = (this.params.lookback_seconds as number) ?? 600;
    const zEntry = (this.params.z_score_entry as number) ?? 2;
    const zExit = (this.params.z_score_exit as number) ?? 0.5;
    const now = ctx?.now_ts ?? Date.now() / 1000;
    const midHistory = ctx?.mid_history ?? {};

    for (const [tokenId, s] of Object.entries(snapshot)) {
      const history = midHistory[tokenId] ?? [];
      const recent = history.filter(([t]) => now - t <= lookbackSeconds);
      if (recent.length < 5) continue;

      const mids = recent.map(([, m]) => m);
      const mean = mids.reduce((a, b) => a + b, 0) / mids.length;
      const variance = mids.reduce((sum, x) => sum + (x - mean) ** 2, 0) / mids.length;
      const std = Math.sqrt(variance) || 0;
      const z = zScore(s.mid, mean, std);
      const marketSlug = marketSlugs[tokenId] ?? "";

      if (z <= -zEntry) {
        signals.push({
          strategy_name: this.name,
          action: "BUY",
          token_id: tokenId,
          market_slug: marketSlug,
          price: s.ask,
          size: 0,
          reason: `mean_reversion: z=${z.toFixed(2)} <= -${zEntry}`,
          confidence: Math.min(1, Math.abs(z) / (zEntry * 1.5)),
          metadata: { z_score: z, mean, std },
        });
      } else if (z >= zExit) {
        const pos = portfolio.getPosition(tokenId);
        if (pos && pos.size > 0) {
          signals.push({
            strategy_name: this.name,
            action: "SELL",
            token_id: tokenId,
            market_slug: marketSlug,
            price: s.bid,
            size: pos.size,
            reason: `mean_reversion: z=${z.toFixed(2)} >= ${zExit}`,
            confidence: Math.min(1, z / (zExit * 2)),
            metadata: { z_score: z },
          });
        }
      }
    }
    return signals;
  }
}
