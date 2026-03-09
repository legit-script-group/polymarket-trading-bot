/**
 * Backtesting: run strategies on historical data, output performance.
 */

import type { MarketSnapshot, OHLCVTick, Signal } from "../types.js";
import { Portfolio } from "../core/portfolio.js";
import { RiskManager } from "../risk/risk_manager.js";

export interface BacktestResult {
  total_pnl: number;
  total_return_pct: number;
  win_rate: number;
  num_trades: number;
  trades: { ts: number; side: string; price: number; size: number; pnl?: number }[];
  equity_curve: [number, number][];
  sharpe_ratio: number | null;
}

export type StrategyRunner = (
  snapshot: Record<string, MarketSnapshot>,
  portfolio: Portfolio,
  marketSlugs: Record<string, string>,
  ctx?: { mid_history: Record<string, [number, number][]>; now_ts: number; token_mids: Record<string, number> }
) => Signal[];

export function runBacktest(
  tokenId: string,
  marketSlug: string,
  history: OHLCVTick[],
  strategyRunner: StrategyRunner,
  initialCapital: number,
  riskPerTrade: number,
  maxTradePct: number
): BacktestResult {
  const portfolio = new Portfolio(initialCapital);
  portfolio.setUsd(initialCapital);
  const riskManager = new RiskManager({
    capital: initialCapital,
    risk_per_trade: riskPerTrade,
    max_trade_pct: maxTradePct,
    max_market_exposure: 0.5,
    daily_loss_limit_pct: 0.2,
    position_stop_loss_pct: 0.1,
    position_take_profit_pct: 0.2,
    kill_switch_loss_pct: 0.15,
  });
  riskManager.setInitialEquity(initialCapital);

  const trades: { ts: number; side: string; price: number; size: number; pnl?: number }[] = [];
  const equityCurve: [number, number][] = [];
  const snapshotByToken: Record<string, MarketSnapshot> = {};
  const midHistory: Record<string, [number, number][]> = { [tokenId]: [] };

  for (const tick of history) {
    const { timestamp: ts, token_id: tid, bid, ask, mid } = tick;
    snapshotByToken[tid] = {
      token_id: tid,
      bid,
      ask,
      mid,
      spread: ask - bid,
      bid_size: 0,
      ask_size: 0,
      timestamp: ts,
    };
    midHistory[tid].push([ts, mid]);

    const tokenMids = { [tid]: mid };
    const equity = portfolio.totalEquity(tokenMids);
    equityCurve.push([ts, equity]);

    const can = riskManager.canTrade(equity);
    if (!can.allowed) continue;

    const signals = strategyRunner(
      snapshotByToken,
      portfolio,
      { [tid]: marketSlug },
      { mid_history: midHistory, now_ts: ts, token_mids: tokenMids }
    );

    for (const sig of signals) {
      if (sig.token_id !== tokenId || sig.action === "HOLD") continue;
      const price = mid;
      let size = sig.size;
      if (sig.action === "BUY" && size <= 0) {
        size = riskManager.maxTradeSizeShares(equity, price);
      }
      if (size <= 0) continue;
      const notional = size * price;
      if (notional > equity * maxTradePct) size = (equity * maxTradePct) / price;

      if (sig.action === "BUY") {
        const cost = size * price;
        if (portfolio.getUsd() >= cost) {
          portfolio.setUsd(portfolio.getUsd() - cost);
          portfolio.updatePosition(tid, marketSlug, "YES", size, price, mid);
          trades.push({ ts, side: "BUY", price, size });
        }
      } else {
        const pos = portfolio.getPosition(tid);
        if (pos && pos.size >= size) {
          const revenue = size * price;
          portfolio.setUsd(portfolio.getUsd() + revenue);
          const pnl = size * (price - pos.avg_entry_price);
          portfolio.removePosition(tid);
          if (pos.size > size) {
            portfolio.updatePosition(tid, marketSlug, "YES", pos.size - size, pos.avg_entry_price, mid);
          }
          trades.push({ ts, side: "SELL", price, size, pnl });
        }
      }
    }
  }

  const finalEquity = portfolio.totalEquity({ [tokenId]: history[history.length - 1]?.mid ?? 0 });
  const closed = trades.filter((t) => t.pnl != null);
  const wins = closed.filter((t) => (t.pnl ?? 0) > 0).length;
  const totalPnl = finalEquity - initialCapital;
  const returns = closed.map((t) => (t.pnl ?? 0) / (t.price * t.size));
  let sharpe: number | null = null;
  if (returns.length >= 2) {
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
    const std = Math.sqrt(variance);
    if (std > 0) sharpe = (mean / std) * Math.sqrt(252);
  }

  return {
    total_pnl: totalPnl,
    total_return_pct: initialCapital ? (totalPnl / initialCapital) * 100 : 0,
    win_rate: closed.length ? wins / closed.length : 0,
    num_trades: trades.length,
    trades,
    equity_curve: equityCurve,
    sharpe_ratio: sharpe,
  };
}

import fs from "fs";

export function loadHistoricalCsv(filePath: string): OHLCVTick[] {
  const lines = fs.readFileSync(filePath, "utf-8").split("\n");
  if (lines.length < 2) return [];
  const header = lines[0].toLowerCase().split(",").map((s) => s.trim());
  const idxTs = header.indexOf("timestamp");
  const idxTid = header.indexOf("token_id");
  const idxBid = header.indexOf("bid");
  const idxAsk = header.indexOf("ask");
  const idxMid = header.indexOf("mid");
  const ticks: OHLCVTick[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",").map((s) => s.trim());
    if (parts.length < 3) continue;
    const ts = parseFloat(parts[idxTs] ?? "0");
    const bid = parseFloat(parts[idxBid] ?? "0");
    const ask = parseFloat(parts[idxAsk] ?? "0");
    const mid = idxMid >= 0 ? parseFloat(parts[idxMid] ?? "0") : (bid + ask) / 2;
    const tokenId = idxTid >= 0 ? parts[idxTid] ?? "default" : "default";
    ticks.push({ timestamp: ts, token_id: tokenId, bid, ask, mid });
  }
  return ticks;
}
