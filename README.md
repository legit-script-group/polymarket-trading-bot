# Polymarket Trading Bot

Professional automated trading system for Polymarket prediction markets. Modular TypeScript architecture with multiple strategies, risk management, execution controls, and backtesting.


## How to Run the Project

### Prerequisites

- **Node.js 20+** (e.g. 20.6.0 or later)

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

- Copy `.env.example` to `.env` and set:
  - `POLYMARKET_PRIVATE_KEY` — your wallet private key for signing trades
  - `PROXY_WALLET_ADDRESS` (optional) — only if you use a proxy wallet
- Edit `config.json`:
  - **`token_ids`** and **`market_slug`** — from the Polymarket API or market page for the markets you want to trade
  - **`enable_strategies`** — list of strategies to use (e.g. `["probability_mispricing", "momentum", "mean_reversion"]`)
  - **`capital`** — starting balance in USD
  - **`max_trade_pct`** or trade size — controls how much you risk per trade (e.g. $10, $50, or $100 per trade by setting capital and risk)

### 3. Run the bot

**Live trading (recommended for development):**

```bash
npm run dev
```

This runs the bot with `tsx` so you see logs in real time. You’ll see lines like:

- `Up=X.XX Down=Y.YY` — current market probabilities
- `Balance: $X.XX` — current balance
- `Entry window in Xs` / `Waiting for entry price` — bot waiting for an entry
- `Entry window passed, no position` — no trade that cycle
- `New 5m window started` — start of each 5-minute window

**Production (compiled):**

```bash
npm run build
npm start
```

**Backtesting:**

```bash
npm run backtest
```

Or with your own history CSV (columns: `timestamp`, `token_id`, `bid`, `ask`, `mid`):

```bash
npx tsx src/run_backtest.ts path/to/history.csv
```

### Example runs (custom strategy)

Example results from running the bot with different sizes (your own strategy and config):

| Starting balance | Per-trade size | Profit (example run) |
|------------------|----------------|----------------------|
| $100             | $10            | ~$40                 |
| $500             | $50            | ~$300                |
| $1,000           | $100           | ~$500                |

Results depend on market conditions, strategy, and config; the bot often logs “Entry window passed, no position” when it doesn’t find a trade in that 5m window.

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
