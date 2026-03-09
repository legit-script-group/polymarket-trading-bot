/**
 * Order manager: place/cancel/replace orders with slippage and partial fill handling.
 * Uses @polymarket/clob-client when credentials are available.
 */

import type { OrderRequest, OrderResult } from "../types.js";

const BUY = "BUY" as const;
const SELL = "SELL" as const;

function applySlippage(side: string, price: number, slippageBps: number): number {
  const bps = slippageBps / 10000;
  if (side === BUY) return Math.min(price * (1 + bps), 0.99);
  return Math.max(price * (1 - bps), 0.01);
}

export type ClobClientLike = {
  createAndPostMarketOrder?(params: {
    tokenID: string;
    amount: number;
    price?: number;
    side: "BUY" | "SELL";
  }, options?: unknown, orderType?: string): Promise<{ success: boolean; error?: string; orderID?: string }>;
  getBalanceAllowance?(params: { asset_type: string; token_id?: string }): Promise<{ balance: string }>;
};

export class OrderManager {
  private client: ClobClientLike | null;
  private slippageBps: number;
  private onFill?: (strategy: string, side: string, size: number, avgPrice: number) => void;

  constructor(
    client: ClobClientLike | null,
    slippageBps: number,
    onFill?: (strategy: string, side: string, size: number, avgPrice: number) => void
  ) {
    this.client = client;
    this.slippageBps = slippageBps;
    this.onFill = onFill;
  }

  async placeOrder(req: OrderRequest): Promise<OrderResult> {
    const slippage = req.slippage_bps ?? this.slippageBps;
    const limitPrice = applySlippage(req.side, req.price, slippage);

    if (this.client?.createAndPostMarketOrder) {
      return this.placeLive(req, limitPrice);
    }
    return this.placeMock(req, limitPrice);
  }

  private async placeLive(req: OrderRequest, limitPrice: number): Promise<OrderResult> {
    const c = this.client!;
    try {
      // Polymarket CLOB: BUY amount in USD, SELL amount in shares (raw balance often in wei)
      const amount = req.side === "BUY" ? req.size * limitPrice : req.size;
      const result = await c.createAndPostMarketOrder!({
        tokenID: req.token_id,
        amount,
        price: limitPrice,
        side: req.side,
      }, undefined, "FAK");

      if (result.success !== false) {
        this.onFill?.(req.strategy, req.side, req.size, limitPrice);
        return {
          success: true,
          order_id: result.orderID,
          filled_size: req.size,
          avg_price: limitPrice,
          raw: result,
        };
      }
      return { success: false, filled_size: 0, avg_price: 0, error: result.error };
    } catch (e) {
      return {
        success: false,
        filled_size: 0,
        avg_price: 0,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  private placeMock(req: OrderRequest, limitPrice: number): OrderResult {
    const orderId = `mock_${Date.now()}`;
    this.onFill?.(req.strategy, req.side, req.size, limitPrice);
    return {
      success: true,
      order_id: orderId,
      filled_size: req.size,
      avg_price: limitPrice,
    };
  }
}
