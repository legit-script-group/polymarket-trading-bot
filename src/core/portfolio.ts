/**
 * Portfolio: USD balance, token balances, open positions, equity.
 */

import type { Position } from "../types.js";

const SCALE = 1e6;

export class Portfolio {
  private usd: number;
  private initialUsd: number;
  private tokenBalances: Record<string, number> = {};
  private positions: Record<string, Position> = {};

  constructor(initialUsd = 0) {
    this.usd = initialUsd;
    this.initialUsd = initialUsd;
  }

  getUsd(): number {
    return this.usd;
  }

  setUsd(value: number): void {
    this.usd = value;
  }

  getInitialUsd(): number {
    return this.initialUsd;
  }

  getTokenBalance(tokenId: string): number {
    return this.tokenBalances[tokenId] ?? 0;
  }

  setTokenBalance(tokenId: string, balance: number): void {
    this.tokenBalances[tokenId] = balance;
  }

  getPositions(): Record<string, Position> {
    return { ...this.positions };
  }

  getPosition(tokenId: string): Position | undefined {
    return this.positions[tokenId];
  }

  updatePosition(
    tokenId: string,
    marketSlug: string,
    side: string,
    size: number,
    avgEntryPrice: number,
    currentMid = 0
  ): void {
    const unrealizedPnl = currentMid > 0 ? (currentMid - avgEntryPrice) * size : 0;
    this.positions[tokenId] = {
      token_id: tokenId,
      market_slug: marketSlug,
      side,
      size,
      avg_entry_price: avgEntryPrice,
      current_mid: currentMid,
      unrealized_pnl: unrealizedPnl,
      updated_at: Date.now() / 1000,
    };
  }

  removePosition(tokenId: string): void {
    delete this.positions[tokenId];
  }

  totalEquity(tokenMids?: Record<string, number>): number {
    let equity = this.usd;
    const mids = tokenMids ?? {};
    for (const [tid, bal] of Object.entries(this.tokenBalances)) {
      if (bal <= 0) continue;
      const mid = mids[tid] ?? this.positions[tid]?.current_mid;
      if (mid != null && mid > 0) equity += bal * mid;
    }
    return equity;
  }
}
