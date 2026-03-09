/**
 * Momentum: follow short-term price trend.
 */

import type { Signal } from "../types.js";
import { BaseStrategy } from "./base.js";
import type { Portfolio } from "../core/portfolio.js";
import type { MarketSnapshot } from "../types.js";

export class MomentumStrategy extends BaseStrategy {
  get name(): string {
    return "momentum";
  }

  run(
    snapshot: Record<string, MarketSnapshot>,
    portfolio: Portfolio,
    marketSlugs: Record<string, string> = {},
    ctx?: { mid_history?: Record<string, [number, number][]>; now_ts?: number }
  ): Signal[] {
    if (!this.enabled || Object.keys(snapshot).length === 0) return [];

    const signals: Signal[] = [];
    const lookbackSeconds = (this.params.lookback_seconds as number) ?? 300;
    const threshold = (this.params.momentum_threshold as number) ?? 0.02;
    const now = ctx?.now_ts ?? Date.now() / 1000;
    const midHistory = ctx?.mid_history ?? {};

    for (const [tokenId, s] of Object.entries(snapshot)) {
      const history = midHistory[tokenId] ?? [];
      const recent = history.filter(([t]) => now - t <= lookbackSeconds).sort((a, b) => a[0] - b[0]);
      if (recent.length < 2) continue;

      const oldMid = recent[0][1];
      const newMid = recent[recent.length - 1][1];
      if (oldMid <= 0) continue;
      const ret = (newMid - oldMid) / oldMid;
      const marketSlug = marketSlugs[tokenId] ?? "";

      if (ret >= threshold) {
        signals.push({
          strategy_name: this.name,
          action: "BUY",
          token_id: tokenId,
          market_slug: marketSlug,
          price: s.ask,
          size: 0,
          reason: `momentum: return=${ret.toFixed(4)} >= ${threshold}`,
          confidence: Math.min(1, ret / (threshold * 2)),
          metadata: { return: ret, old_mid: oldMid, new_mid: newMid },
        });
      } else if (ret <= -threshold) {
        const pos = portfolio.getPosition(tokenId);
        if (pos && pos.size > 0) {
          signals.push({
            strategy_name: this.name,
            action: "SELL",
            token_id: tokenId,
            market_slug: marketSlug,
            price: s.bid,
            size: pos.size,
            reason: `momentum: return=${ret.toFixed(4)} <= -${threshold}`,
            confidence: Math.min(1, Math.abs(ret) / (threshold * 2)),
            metadata: { return: ret },
          });
        }
      }
    }
    return signals;
  }
}
