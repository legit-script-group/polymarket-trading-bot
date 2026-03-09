/**
 * Performance analytics: PnL, win rate, strategy performance, Sharpe, trade logs.
 * Persists to data/trades.json and data/performance.json.
 */

import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const TRADES_FILE = path.join(DATA_DIR, "trades.json");
const PERFORMANCE_FILE = path.join(DATA_DIR, "performance.json");

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadJson<T>(filePath: string, defaultVal: T): T {
  if (!fs.existsSync(filePath)) return defaultVal;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return defaultVal;
  }
}

function saveJson(filePath: string, data: unknown): void {
  ensureDataDir();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

export interface TradeRecord {
  trade_id: string;
  timestamp: string;
  strategy: string;
  side: string;
  token_id: string;
  market_slug: string;
  price: number;
  size: number;
  pnl?: number;
  fees?: number;
  metadata?: Record<string, unknown>;
}

export function recordTrade(
  tradeId: string,
  strategy: string,
  side: string,
  tokenId: string,
  marketSlug: string,
  price: number,
  size: number,
  pnl?: number,
  fees?: number,
  metadata?: Record<string, unknown>
): void {
  const trades = loadJson<TradeRecord[]>(TRADES_FILE, []);
  trades.push({
    trade_id: tradeId,
    timestamp: new Date().toISOString() + "Z",
    strategy,
    side,
    token_id: tokenId,
    market_slug: marketSlug,
    price,
    size,
    pnl,
    fees: fees ?? 0,
    metadata: metadata ?? {},
  });
  saveJson(TRADES_FILE, trades);
}

export function getTrades(limit?: number, strategy?: string): TradeRecord[] {
  let trades = loadJson<TradeRecord[]>(TRADES_FILE, []);
  if (strategy) trades = trades.filter((t) => t.strategy === strategy);
  if (limit) trades = trades.slice(-limit);
  return trades;
}

export interface PerformanceSnapshot {
  last_updated: string;
  total_pnl: number;
  daily_pnl: number;
  win_count: number;
  loss_count: number;
  by_strategy: Record<string, { pnl: number; trades: number; win_rate?: number }>;
  sharpe_ratio?: number;
}

export function updatePerformance(
  totalPnl: number,
  dailyPnl: number,
  winCount: number,
  lossCount: number,
  byStrategy: Record<string, { pnl: number; trades: number; win_rate?: number }>,
  sharpeRatio?: number
): void {
  const data: PerformanceSnapshot = {
    last_updated: new Date().toISOString() + "Z",
    total_pnl: totalPnl,
    daily_pnl: dailyPnl,
    win_count: winCount,
    loss_count: lossCount,
    by_strategy: byStrategy,
    sharpe_ratio: sharpeRatio,
  };
  saveJson(PERFORMANCE_FILE, data);
}

export function getPerformance(): PerformanceSnapshot | null {
  return loadJson<PerformanceSnapshot | null>(PERFORMANCE_FILE, null);
}

export function computeWinRate(trades: TradeRecord[]): number {
  const closed = trades.filter((t) => t.pnl != null);
  if (closed.length === 0) return 0;
  const wins = closed.filter((t) => (t.pnl ?? 0) > 0).length;
  return wins / closed.length;
}

export function computeSharpeRatio(returns: number[], riskFreeRate = 0): number | null {
  if (returns.length < 2) return null;
  const excess = returns.map((r) => r - riskFreeRate);
  const mean = excess.reduce((a, b) => a + b, 0) / excess.length;
  const variance = excess.reduce((s, r) => s + (r - mean) ** 2, 0) / (excess.length - 1);
  const std = Math.sqrt(variance);
  if (std === 0) return null;
  return (mean / std) * Math.sqrt(252);
}
