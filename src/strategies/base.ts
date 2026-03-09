/**
 * Base strategy interface. All strategies produce signals (BUY/SELL/HOLD).
 */

import type { MarketSnapshot, Signal } from "../types.js";
import type { Portfolio } from "../core/portfolio.js";

export interface StrategyContext {
  mid_history?: Record<string, [number, number][]>;
  now_ts?: number;
  token_mids?: Record<string, number>;
}

export abstract class BaseStrategy {
  params: Record<string, number | boolean>;
  enabled: boolean;

  constructor(params: Record<string, number | boolean> = {}) {
    this.params = { ...params };
    this.enabled = true;
  }

  abstract get name(): string;

  enable(): void {
    this.enabled = true;
  }

  disable(): void {
    this.enabled = false;
  }

  abstract run(
    snapshot: Record<string, MarketSnapshot>,
    portfolio: Portfolio,
    marketSlugs?: Record<string, string>,
    ctx?: StrategyContext
  ): Signal[];
}
