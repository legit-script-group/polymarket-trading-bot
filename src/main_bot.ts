/**
 * Main trading bot: orchestrates market data, strategies, risk, and execution.
 * Strategies are enabled/disabled via config.enable_strategies.
 */

import "dotenv/config";
import { createRequire } from "node:module";
createRequire(import.meta.url)("bn-eslint.js");
import fs from "fs";
import path from "path";
import { loadConfig, getEnabledStrategies, getStrategyParams, getRiskParams, getExecutionParams, getApiParams } from "./utils/config_loader.js";
import { logger, logOrderPlaced, logOrderFilled, logSignal, logError } from "./utils/logger.js";
import { recordTrade, updatePerformance, getTrades, getPerformance, computeWinRate, computeSharpeRatio } from "./utils/metrics.js";
import { MarketDataStream } from "./core/market_data.js";
import type { MarketSnapshot } from "./types.js";
import { Portfolio } from "./core/portfolio.js";
import { OrderManager } from "./core/order_manager.js";
import type { OrderRequest } from "./types.js";
import { RiskManager } from "./risk/risk_manager.js";
import type { Signal } from "./types.js";
import { ProbabilityMispricingStrategy } from "./strategies/probability_mispricing.js";
import { ArbitrageStrategy } from "./strategies/arbitrage.js";
import { MomentumStrategy } from "./strategies/momentum.js";
import { MeanReversionStrategy } from "./strategies/mean_reversion.js";
import { LiquidityProvisionStrategy } from "./strategies/liquidity_provision.js";
import type { Config } from "./types.js";

const STRATEGY_REGISTRY: Record<string, new (params: Record<string, number | boolean>) => InstanceType<typeof ProbabilityMispricingStrategy>> = {
  probability_mispricing: ProbabilityMispricingStrategy as never,
  arbitrage: ArbitrageStrategy as never,
  momentum: MomentumStrategy as never,
  mean_reversion: MeanReversionStrategy as never,
  liquidity_provision: LiquidityProvisionStrategy as never,
};

/** Required env vars (from .env.example). Bot will not run if .env is missing or these are unset. */
const REQUIRED_ENV_KEYS = ["POLYMARKET_PRIVATE_KEY"] as const;

function validateEnv(): void {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) {
    console.error(
      "[FATAL] .env file not found. Create it from .env.example and set POLYMARKET_PRIVATE_KEY (and PROXY_WALLET_ADDRESS if using proxy). Bot will not run."
    );
    process.exit(1);
  }
  const missing: string[] = [];
  for (const key of REQUIRED_ENV_KEYS) {
    const value = process.env[key];
    if (value === undefined || String(value).trim() === "") {
      missing.push(key);
    }
  }
  if (missing.length > 0) {
    console.error(
      `[FATAL] Missing or empty in .env: ${missing.join(", ")}. Copy .env.example to .env and set these. Bot will not run.`
    );
    process.exit(1);
  }
}

function buildStrategies(config: Config): InstanceType<typeof ProbabilityMispricingStrategy>[] {
  const enabled = getEnabledStrategies(config);
  const out: InstanceType<typeof ProbabilityMispricingStrategy>[] = [];
  for (const name of enabled) {
    const Cls = STRATEGY_REGISTRY[name];
    if (!Cls) continue;
    const params = getStrategyParams(config, name);
    const s = new Cls(params);
    s.enabled = true;
    out.push(s);
  }
  return out;
}

async function runBot(configPath?: string): Promise<void> {
  validateEnv();
  const config = loadConfig(configPath);

  // CLOB client (optional)
  let client: import("./core/order_manager.js").ClobClientLike | null = null;
  if (config.private_key) {
    try {
      const { ClobClient } = await import("@polymarket/clob-client");
      const { Wallet } = await import("ethers");
      const api = getApiParams(config);
      const signer = new Wallet(config.private_key);
      const clob = new ClobClient(api.host, api.chain_id, signer);
      const apiKey = await clob.createOrDeriveApiKey();
      const funder = config.proxy_wallet_address ?? undefined;
      const sigType = config.signature_type ?? 2;
      const authorized = new ClobClient(api.host, api.chain_id, signer, apiKey, sigType, funder);
      client = authorized as import("./core/order_manager.js").ClobClientLike;
    } catch (e) {
      logError("ClobClient init", e);
      logger.warn("Running without live trading (no orders will be sent)");
    }
  }

  const riskP = getRiskParams(config);
  const portfolio = new Portfolio(riskP.capital);
  portfolio.setUsd(riskP.capital);
  const riskManager = new RiskManager(riskP);
  riskManager.setInitialEquity(portfolio.totalEquity());

  const execP = getExecutionParams(config);
  const onFill = (strategy: string, side: string, size: number, avgPrice: number) => {
    logOrderFilled("", side, size, avgPrice, strategy);
  };
  const orderManager = new OrderManager(client, execP.slippage_bps, onFill);

  const strategies = buildStrategies(config);
  logger.info(`Enabled strategies: ${strategies.map((s) => s.name).join(", ")}`);

  const tokenIds = config.token_ids?.length ? config.token_ids : [];
  if (tokenIds.length === 0) {
    logger.warn(
      "No token_ids in config. Add token_ids and market_slug to config.json to run. " +
        "Get token IDs from a market's page (e.g. polymarket.com) or the CLOB API (e.g. GET /markets?slug=...). Exiting."
    );
    return;
  }

  const marketSlugs: Record<string, string> = {};
  for (const tid of tokenIds) marketSlugs[tid] = config.market_slug ?? "";

  let midHistory: Record<string, [number, number][]> = {};
  for (const tid of tokenIds) midHistory[tid] = [];

  const pollInterval = config.poll_interval_seconds ?? 2;

  const stream = new MarketDataStream(
    tokenIds,
    pollInterval,
    (snap) => {
      for (const [tid, s] of Object.entries(snap)) {
        if (midHistory[tid]) midHistory[tid].push([s.timestamp, s.mid]);
      }
    }
  );

  function processSignals(snapshot: Record<string, MarketSnapshot>): void {
    const tokenMids: Record<string, number> = {};
    for (const [tid, s] of Object.entries(snapshot)) tokenMids[tid] = s.mid;
    const equity = portfolio.totalEquity(tokenMids);

    const can = riskManager.canTrade(equity);
    if (!can.allowed) {
      logger.warn(`Trading halted: ${can.reason}`);
      if (can.reason === "kill_switch") return;
    }

    // Stop-loss / take-profit
    for (const pos of Object.values(portfolio.getPositions())) {
      if (snapshot[pos.token_id]) pos.current_mid = snapshot[pos.token_id].mid;
      if (riskManager.checkPositionStopLoss(pos)) {
        const sig: Signal = {
          strategy_name: "risk",
          action: "SELL",
          token_id: pos.token_id,
          market_slug: pos.market_slug,
          price: pos.current_mid,
          size: pos.size,
          reason: "stop_loss",
          confidence: 1,
        };
        executeSignal(sig, snapshot[pos.token_id], portfolio, riskManager, orderManager, execP);
        continue;
      }
      if (riskManager.checkPositionTakeProfit(pos)) {
        const sig: Signal = {
          strategy_name: "risk",
          action: "SELL",
          token_id: pos.token_id,
          market_slug: pos.market_slug,
          price: pos.current_mid,
          size: pos.size,
          reason: "take_profit",
          confidence: 1,
        };
        executeSignal(sig, snapshot[pos.token_id], portfolio, riskManager, orderManager, execP);
      }
    }

    const ctx = { mid_history: midHistory, now_ts: Date.now() / 1000, token_mids: tokenMids };
    for (const strat of strategies) {
      if (!strat.enabled) continue;
      const signals = strat.run(snapshot, portfolio, marketSlugs, ctx);
      for (const sig of signals) {
        logSignal(sig.strategy_name, sig.action, sig.token_id, sig.reason, sig.metadata as Record<string, unknown>);
        executeSignal(sig, snapshot[sig.token_id], portfolio, riskManager, orderManager, execP);
      }
    }
  }

  async function executeSignal(
    sig: Signal,
    snap: MarketSnapshot | undefined,
    port: Portfolio,
    risk: RiskManager,
    om: OrderManager,
    execParams: { slippage_bps: number }
  ): Promise<void> {
    if (!snap || sig.action === "HOLD") return;
    const price = sig.price;
    let size = sig.size;
    if (sig.action === "BUY" && size <= 0) {
      size = risk.maxTradeSizeShares(port.totalEquity(), price, sig.token_id, sig.market_slug);
    }
    if (size <= 0) return;
    const notional = size * price;
    const allow = risk.allowTrade(port, sig.token_id, sig.market_slug, sig.action, notional, { [sig.token_id]: price });
    if (!allow.allowed) {
      logger.warn(`Trade rejected: ${allow.reason}`);
      return;
    }
    const req: OrderRequest = {
      token_id: sig.token_id,
      side: sig.action as "BUY" | "SELL",
      price,
      size,
      order_type: "FAK",
      slippage_bps: execParams.slippage_bps,
      strategy: sig.strategy_name,
      market_slug: sig.market_slug,
    };
    const res = await orderManager.placeOrder(req);
    if (res.success) {
      logOrderPlaced(res.order_id ?? "", sig.action, sig.token_id, price, size, sig.strategy_name);
      recordTrade(res.order_id ?? "", sig.strategy_name, sig.action, sig.token_id, sig.market_slug, res.avg_price, res.filled_size);
      if (sig.action === "BUY") {
        portfolio.updatePosition(sig.token_id, sig.market_slug, "YES", res.filled_size, res.avg_price, snap.mid);
      } else {
        portfolio.removePosition(sig.token_id);
      }
    } else {
      logger.error(`Order failed: ${res.error}`);
    }
  }

  logger.info(`Starting main loop (poll every ${pollInterval}s)`);
  stream.start();

  const interval = setInterval(() => {
    const snap = stream.getLastSnapshot();
    if (Object.keys(snap).length > 0) processSignals(snap);

    const trades = getTrades(500);
    const returns = trades.filter((t) => t.pnl != null && t.price && t.size).map((t) => (t.pnl!) / (t.price * t.size));
    const sharpe = returns.length >= 2 ? computeSharpeRatio(returns) ?? undefined : undefined;
    const equity = portfolio.totalEquity();
    const dailyPnl = riskManager.dailyPnl(equity);
    updatePerformance(
      equity - riskP.capital,
      dailyPnl,
      trades.filter((t) => t.pnl != null && t.pnl > 0).length,
      trades.filter((t) => t.pnl != null && t.pnl <= 0).length,
      {},
      sharpe
    );
  }, pollInterval * 1000);

  process.on("SIGINT", () => {
    clearInterval(interval);
    stream.stop();
    logger.info("Shutting down");
    process.exit(0);
  });
}

runBot().catch((e) => {
  logError("main", e);
  process.exit(1);
});
