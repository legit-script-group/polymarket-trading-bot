/**
 * Market data: fetch prices, order book, stream updates, fair probability estimate.
 */

import type { MarketSnapshot } from "../types.js";

const CLOB_PRICES = "https://clob.polymarket.com/prices";

export async function fetchPricesRest(tokenIds: string[]): Promise<Record<string, { BUY: number; SELL: number }>> {
  if (tokenIds.length === 0) return {};
  const payload = tokenIds.flatMap((tid) => [
    { token_id: tid, side: "BUY" as const },
    { token_id: tid, side: "SELL" as const },
  ]);
  const res = await fetch(CLOB_PRICES, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Prices API: ${res.status}`);
  const raw = (await res.json()) as Record<string, { BUY?: number; SELL?: number }>;
  const out: Record<string, { BUY: number; SELL: number }> = {};
  for (const tid of tokenIds) {
    const e = raw[tid] ?? {};
    const buy = Number(e.BUY) || 0;
    const sell = Number(e.SELL) || 0;
    out[tid] = { BUY: buy, SELL: sell };
  }
  return out;
}

export function snapshotsFromPrices(
  tokenIds: string[],
  prices: Record<string, { BUY: number; SELL: number }>
): Record<string, MarketSnapshot> {
  const out: Record<string, MarketSnapshot> = {};
  const now = Date.now() / 1000;
  for (const tid of tokenIds) {
    const p = prices[tid];
    if (!p) continue;
    let bid = p.SELL || 0;
    let ask = p.BUY || 0;
    if (bid <= 0) bid = ask;
    if (ask <= 0) ask = bid;
    const mid = (bid + ask) / 2;
    out[tid] = {
      token_id: tid,
      bid,
      ask,
      mid,
      spread: ask - bid,
      bid_size: 0,
      ask_size: 0,
      timestamp: now,
    };
  }
  return out;
}

/** Mid history: token_id -> list of [timestamp, mid] */
export type MidHistory = Record<string, [number, number][]>;

export function estimateFairProbability(
  mid: number,
  recentMids: number[],
  priorWeight = 0.3
): number {
  if (recentMids.length === 0) return mid;
  const avg = recentMids.reduce((a, b) => a + b, 0) / recentMids.length;
  return (1 - priorWeight) * mid + priorWeight * avg;
}

export function spreadBps(bid: number, ask: number): number {
  if (ask <= 0 || bid <= 0 || ask <= bid) return 0;
  return ((ask - bid) / bid) * 10000;
}

/**
 * Stream: poll prices periodically and call onSnapshot with latest snapshots.
 */
export class MarketDataStream {
  private tokenIds: string[];
  private pollIntervalMs: number;
  private onSnapshot: (snap: Record<string, MarketSnapshot>) => void;
  private midHistory: MidHistory = {};
  private lastSnapshot: Record<string, MarketSnapshot> = {};
  private running = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    tokenIds: string[],
    pollIntervalSeconds: number,
    onSnapshot: (snap: Record<string, MarketSnapshot>) => void
  ) {
    this.tokenIds = [...tokenIds];
    this.pollIntervalMs = pollIntervalSeconds * 1000;
    this.onSnapshot = onSnapshot;
    for (const tid of tokenIds) this.midHistory[tid] = [];
  }

  getLastSnapshot(): Record<string, MarketSnapshot> {
    return { ...this.lastSnapshot };
  }

  getMidHistory(): MidHistory {
    return { ...this.midHistory };
  }

  private async pollOnce(): Promise<void> {
    try {
      const prices = await fetchPricesRest(this.tokenIds);
      const snap = snapshotsFromPrices(this.tokenIds, prices);
      for (const [tid, s] of Object.entries(snap)) {
        this.lastSnapshot[tid] = s;
        this.midHistory[tid] = this.midHistory[tid] ?? [];
        this.midHistory[tid].push([s.timestamp, s.mid]);
        // keep last 3600 points
        if (this.midHistory[tid].length > 3600) this.midHistory[tid].shift();
      }
      if (Object.keys(snap).length > 0) this.onSnapshot(snap);
    } catch (_) {}
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.pollOnce();
    this.timer = setInterval(() => this.pollOnce(), this.pollIntervalMs);
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
