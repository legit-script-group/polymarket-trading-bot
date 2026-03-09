# Polymarket Trading Bot

Professional automated trading system for Polymarket prediction markets. Modular TypeScript architecture with multiple strategies, risk management, execution controls, and backtesting.

## Structure

```
polymarket-trading-bot/
├── src/
│   ├── core/                 # Market data, orders, portfolio
│   │   ├── market_data.ts
│   │   ├── order_manager.ts
│   │   └── portfolio.ts
│   ├── strategies/
│   │   ├── base.ts
│   │   ├── probability_mispricing.ts
│   │   ├── arbitrage.ts
│   │   ├── momentum.ts
│   │   ├── mean_reversion.ts
│   │   └── liquidity_provision.ts
│   ├── risk/
│   │   ├── risk_manager.ts
│   │   ├── position_sizing.ts
│   │   └── exposure_limits.ts
│   ├── utils/
│   │   ├── logger.ts
│   │   ├── config_loader.ts
│   │   └── metrics.ts
│   ├── backtest/
│   │   └── runner.ts
│   ├── types.ts
│   ├── main_bot.ts
│   └── run_backtest.ts
├── data/                     # trades.json, performance.json
├── logs/                     # trading.log
├── config.json
├── package.json
└── tsconfig.json
```

## Setup

1. **Node 20+**
   ```bash
   npm install
   ```

2. **Config**
   - Copy `.env.example` to `.env` and set `POLYMARKET_PRIVATE_KEY` (and `PROXY_WALLET_ADDRESS` if using a proxy wallet).
   - Edit `config.json`: set `token_ids` and `market_slug` for the markets you want to trade, and enable strategies under `enable_strategies`.

3. **Run**
   - Live: `npm run dev` or `npm start` (after `npm run build`)
   - Backtest: `npm run backtest` or `npx tsx src/run_backtest.ts path/to/history.csv`

## Strategies

| Strategy | Description |
|----------|-------------|
| **probability_mispricing** | Buy when market prob < fair value, sell when > fair value. |
| **arbitrage** | Wide spread: place orders inside the spread. |
| **momentum** | Short-term trend: buy on upward move, sell on downward. |
| **mean_reversion** | Trade when price deviates from recent average (z-score). |
| **liquidity_provision** | Market making around mid with inventory limits. |

Enable/disable in `config.json` → `enable_strategies`.

## Risk

- **Max trade size**: `max_trade_pct` of portfolio per trade.
- **Max market exposure**: `max_market_exposure` per market.
- **Daily loss limit**: `daily_loss_limit_pct` (stops trading for the day).
- **Position stop-loss / take-profit**: `position_stop_loss_pct`, `position_take_profit_pct`.
- **Kill switch**: `kill_switch_loss_pct` total drawdown halts trading.

## Data & Logs

- **Trades**: `data/trades.json`
- **Performance**: `data/performance.json` (PnL, win rate, Sharpe, by strategy).
- **Logs**: `logs/trading.log` (orders, fills, signals, errors).

## Backtesting

Run `npm run backtest` for mean-reversion on synthetic data. For historical data, pass a CSV path with columns: `timestamp`, `token_id`, `bid`, `ask`, `mid`.

## Config Example

```json
{
  "token_ids": ["token_id_1", "token_id_2"],
  "market_slug": "your-market-slug",
  "enable_strategies": ["probability_mispricing", "momentum", "mean_reversion"],
  "capital": 1000,
  "risk_per_trade": 0.02,
  "max_trade_pct": 0.02,
  "max_market_exposure": 0.1,
  "daily_loss_limit_pct": 0.05
}
```

Obtain `token_ids` and `market_slug` from the Polymarket API or UI for your target market.
