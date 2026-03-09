/**
 * Shared types for the trading bot.
 */

export interface MarketSnapshot {
  token_id: string;
  bid: number;
  ask: number;
  mid: number;
  spread: number;
  bid_size: number;
  ask_size: number;
  timestamp: number;
}

export interface Signal {
  strategy_name: string;
  action: "BUY" | "SELL" | "HOLD";
  token_id: string;
  market_slug: string;
  price: number;
  size: number;
  reason: string;
  confidence: number;
  metadata?: Record<string, unknown>;
}

export interface Position {
  token_id: string;
  market_slug: string;
  side: string;
  size: number;
  avg_entry_price: number;
  current_mid: number;
  unrealized_pnl: number;
  updated_at: number;
}

export interface Config {
  token_ids: string[];
  market_slug: string;
  poll_interval_seconds?: number;
  capital: number;
  risk_per_trade: number;
  max_trade_pct: number;
  max_market_exposure: number;
  daily_loss_limit_pct: number;
  position_stop_loss_pct: number;
  position_take_profit_pct: number;
  kill_switch_loss_pct: number;
  enable_strategies: string[];
  strategy_params?: Record<string, Record<string, number | boolean>>;
  execution?: { slippage_bps?: number; partial_fill_ok?: boolean; order_timeout_seconds?: number };
  api?: { host?: string; chain_id?: number };
  private_key?: string;
  proxy_wallet_address?: string;
  signature_type?: number;
}

export interface OrderRequest {
  token_id: string;
  side: "BUY" | "SELL";
  price: number;
  size: number;
  order_type?: "GTC" | "FOK" | "FAK";
  slippage_bps?: number;
  strategy: string;
  market_slug: string;
}

export interface OrderResult {
  success: boolean;
  order_id?: string;
  filled_size: number;
  avg_price: number;
  error?: string;
  raw?: unknown;
}

export interface OHLCVTick {
  timestamp: number;
  token_id: string;
  bid: number;
  ask: number;
  mid: number;
}
