/**
 * Load and validate config from config.json and environment variables.
 */

import fs from "fs";
import path from "path";
import type { Config } from "../types.js";

const DEFAULT_CONFIG_PATH = path.join(process.cwd(), "config.json");

export function loadConfig(configPath?: string): Config {
  const p = configPath ?? DEFAULT_CONFIG_PATH;
  if (!fs.existsSync(p)) {
    throw new Error(`Config not found: ${p}`);
  }
  const raw = JSON.parse(fs.readFileSync(p, "utf-8")) as Record<string, unknown>;

  const config: Config = {
    token_ids: Array.isArray(raw.token_ids) ? raw.token_ids : [],
    market_slug: typeof raw.market_slug === "string" ? raw.market_slug : "",
    poll_interval_seconds: typeof raw.poll_interval_seconds === "number" ? raw.poll_interval_seconds : 2,
    capital: typeof raw.capital === "number" ? raw.capital : 1000,
    risk_per_trade: typeof raw.risk_per_trade === "number" ? raw.risk_per_trade : 0.02,
    max_trade_pct: typeof raw.max_trade_pct === "number" ? raw.max_trade_pct : 0.02,
    max_market_exposure: typeof raw.max_market_exposure === "number" ? raw.max_market_exposure : 0.1,
    daily_loss_limit_pct: typeof raw.daily_loss_limit_pct === "number" ? raw.daily_loss_limit_pct : 0.05,
    position_stop_loss_pct: typeof raw.position_stop_loss_pct === "number" ? raw.position_stop_loss_pct : 0.1,
    position_take_profit_pct: typeof raw.position_take_profit_pct === "number" ? raw.position_take_profit_pct : 0.2,
    kill_switch_loss_pct: typeof raw.kill_switch_loss_pct === "number" ? raw.kill_switch_loss_pct : 0.08,
    enable_strategies: Array.isArray(raw.enable_strategies) ? raw.enable_strategies : [],
    strategy_params: (raw.strategy_params as Record<string, Record<string, number | boolean>>) ?? {},
    execution: raw.execution as Config["execution"],
    api: raw.api as Config["api"],
  };

  if (process.env.POLYMARKET_PRIVATE_KEY) {
    config.private_key = process.env.POLYMARKET_PRIVATE_KEY.trim();
  }
  if (process.env.PROXY_WALLET_ADDRESS) {
    config.proxy_wallet_address = process.env.PROXY_WALLET_ADDRESS.trim();
  }
  return config;
}

export function getEnabledStrategies(config: Config): string[] {
  return [...(config.enable_strategies ?? [])];
}

export function getStrategyParams(config: Config, strategyName: string): Record<string, number | boolean> {
  return { ...(config.strategy_params?.[strategyName] ?? {}) };
}

export function getRiskParams(config: Config) {
  return {
    capital: config.capital,
    risk_per_trade: config.risk_per_trade,
    max_trade_pct: config.max_trade_pct,
    max_market_exposure: config.max_market_exposure,
    daily_loss_limit_pct: config.daily_loss_limit_pct,
    position_stop_loss_pct: config.position_stop_loss_pct,
    position_take_profit_pct: config.position_take_profit_pct,
    kill_switch_loss_pct: config.kill_switch_loss_pct,
  };
}

export function getExecutionParams(config: Config) {
  return {
    slippage_bps: config.execution?.slippage_bps ?? 10,
    partial_fill_ok: config.execution?.partial_fill_ok ?? true,
    order_timeout_seconds: config.execution?.order_timeout_seconds ?? 30,
  };
}

export function getApiParams(config: Config) {
  return {
    host: config.api?.host ?? "https://clob.polymarket.com",
    chain_id: config.api?.chain_id ?? 137,
  };
}
