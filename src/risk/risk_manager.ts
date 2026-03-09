/**
 * Risk manager: max trade size, market exposure, daily loss limit, stop-loss, take-profit, kill switch.
 */

import { Portfolio } from "../core/portfolio.js";
import type { Position } from "../types.js";
import { sizeByCapital } from "./position_sizing.js";
import { wouldExceedMarketCap } from "./exposure_limits.js";

export interface RiskParams {
  capital: number;
  risk_per_trade: number;
  max_trade_pct: number;
  max_market_exposure: number;
  daily_loss_limit_pct: number;
  position_stop_loss_pct: number;
  position_take_profit_pct: number;
  kill_switch_loss_pct: number;
}

export class RiskManager {
  private params: RiskParams;
  private dailyPnlStart = 0;
  private dailyResetDate: string | null = null;
  private killSwitchTriggered = false;
  private initialEquity: number | null = null;

  constructor(params: RiskParams) {
    this.params = params;
  }

  setInitialEquity(equity: number): void {
    this.initialEquity = equity;
  }

  private ensureDailyReset(currentEquity: number): void {
    const today = new Date().toISOString().slice(0, 10);
    if (this.dailyResetDate !== today) {
      this.dailyResetDate = today;
      this.dailyPnlStart = currentEquity;
    }
  }

  dailyPnl(currentEquity: number): number {
    this.ensureDailyReset(currentEquity);
    return currentEquity - this.dailyPnlStart;
  }

  isDailyLossLimitHit(currentEquity: number): boolean {
    this.ensureDailyReset(currentEquity);
    const pnl = currentEquity - this.dailyPnlStart;
    const limit = this.dailyPnlStart * this.params.daily_loss_limit_pct;
    return pnl < -Math.abs(limit);
  }

  isKillSwitchTriggered(currentEquity: number): boolean {
    if (this.killSwitchTriggered) return true;
    if (this.initialEquity == null || this.initialEquity <= 0) return false;
    const drawdown = (this.initialEquity - currentEquity) / this.initialEquity;
    if (drawdown >= this.params.kill_switch_loss_pct) {
      this.killSwitchTriggered = true;
      return true;
    }
    return false;
  }

  triggerKillSwitch(): void {
    this.killSwitchTriggered = true;
  }

  canTrade(currentEquity: number): { allowed: boolean; reason: string } {
    if (this.isKillSwitchTriggered(currentEquity)) return { allowed: false, reason: "kill_switch" };
    if (this.isDailyLossLimitHit(currentEquity)) return { allowed: false, reason: "daily_loss_limit" };
    return { allowed: true, reason: "" };
  }

  maxTradeSizeUsd(equity: number): number {
    return equity * this.params.max_trade_pct;
  }

  maxTradeSizeShares(
    equity: number,
    price: number,
    _tokenId?: string,
    _marketSlug?: string
  ): number {
    return sizeByCapital(equity, this.params.risk_per_trade, price, this.params.max_trade_pct);
  }

  checkPositionStopLoss(position: Position): boolean {
    if (position.size <= 0 || position.current_mid <= 0) return false;
    const pnlPct = (position.current_mid - position.avg_entry_price) / position.avg_entry_price;
    return pnlPct <= -this.params.position_stop_loss_pct;
  }

  checkPositionTakeProfit(position: Position): boolean {
    if (position.size <= 0 || position.avg_entry_price <= 0) return false;
    const pnlPct = (position.current_mid - position.avg_entry_price) / position.avg_entry_price;
    return pnlPct >= this.params.position_take_profit_pct;
  }

  allowTrade(
    portfolio: Portfolio,
    tokenId: string,
    marketSlug: string,
    _side: string,
    notionalUsd: number,
    tokenMids?: Record<string, number>
  ): { allowed: boolean; reason: string } {
    const equity = portfolio.totalEquity(tokenMids);
    const can = this.canTrade(equity);
    if (!can.allowed) return can;
    if (notionalUsd > this.maxTradeSizeUsd(equity)) return { allowed: false, reason: "max_trade_size" };
    if (wouldExceedMarketCap(portfolio, marketSlug, notionalUsd, this.params.max_market_exposure, equity, tokenMids)) {
      return { allowed: false, reason: "max_market_exposure" };
    }
    return { allowed: true, reason: "" };
  }
}
