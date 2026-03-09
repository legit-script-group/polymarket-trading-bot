/**
 * Run backtest: synthetic data by default, or pass a CSV path.
 * Usage: npx tsx src/run_backtest.ts [path/to/history.csv]
 */

import fs from "fs";
import { runBacktest, loadHistoricalCsv, type StrategyRunner } from "./backtest/runner.js";
import { MeanReversionStrategy } from "./strategies/mean_reversion.js";
import type { OHLCVTick } from "./types.js";

function syntheticHistory(tokenId: string, numTicks: number): OHLCVTick[] {
  const ticks: OHLCVTick[] = [];
  let t = 1000000;
  let mid = 0.5;
  for (let i = 0; i < numTicks; i++) {
    mid = mid + (0.5 - mid) * 0.05 + (Math.random() - 0.5) * 0.04;
    mid = Math.max(0.01, Math.min(0.99, mid));
    const spread = 0.01;
    const bid = mid - spread / 2;
    const ask = mid + spread / 2;
    ticks.push({ timestamp: t, token_id: tokenId, bid, ask, mid });
    t += 60;
  }
  return ticks;
}

function main(): void {
  const csvPath = process.argv[2];
  let history: OHLCVTick[];
  let tokenId: string;
  let marketSlug: string;

  if (csvPath && fs.existsSync(csvPath)) {
    history = loadHistoricalCsv(csvPath);
    tokenId = history[0]?.token_id ?? "default";
    marketSlug = "backtest-market";
  } else {
    history = syntheticHistory("synthetic", 500);
    tokenId = "synthetic";
    marketSlug = "synthetic-market";
  }

  const strategy = new MeanReversionStrategy({
    lookback_seconds: 600,
    z_score_entry: 2,
    z_score_exit: 0.5,
  });

  const runner: StrategyRunner = (snap, port, slugs, ctx) => strategy.run(snap, port, slugs, ctx);

  const result = runBacktest(
    tokenId,
    marketSlug,
    history,
    runner,
    1000,
    0.02,
    0.02
  );

  console.log("Backtest result:");
  console.log(JSON.stringify({
    total_pnl: result.total_pnl,
    total_return_pct: result.total_return_pct,
    win_rate: result.win_rate,
    num_trades: result.num_trades,
    sharpe_ratio: result.sharpe_ratio,
  }, null, 2));
}

main();
