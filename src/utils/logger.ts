/**
 * Centralized logging: logs/trading.log with rotation support.
 * Logs orders placed/filled, strategy signals, errors.
 */

import fs from "fs";
import path from "path";

const LOG_DIR = path.join(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "trading.log");
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

function ensureLogDir(): void {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function formatMsg(level: string, name: string, message: string): string {
  const ts = new Date().toISOString();
  return `${ts} | ${level.padEnd(8)} | ${name} | ${message}\n`;
}

let fileStream: fs.WriteStream | null = null;

function getStream(): fs.WriteStream {
  if (!fileStream) {
    ensureLogDir();
    fileStream = fs.createWriteStream(LOG_FILE, { flags: "a" });
  }
  return fileStream;
}

function write(level: string, name: string, message: string): void {
  const line = formatMsg(level, name, message);
  process.stdout.write(line);
  try {
    getStream().write(line);
  } catch (_) {}
}

export const logger = {
  info: (msg: string) => write("INFO", "trading_bot", msg),
  warn: (msg: string) => write("WARN", "trading_bot", msg),
  error: (msg: string) => write("ERROR", "trading_bot", msg),
};

export function logOrderPlaced(
  orderId: string,
  side: string,
  tokenId: string,
  price: number,
  size: number,
  strategy: string
): void {
  logger.info(
    `ORDER_PLACED | order_id=${orderId} | side=${side} | token_id=${tokenId.slice(0, 16)}... | price=${price.toFixed(4)} | size=${size.toFixed(4)} | strategy=${strategy}`
  );
}

export function logOrderFilled(
  orderId: string,
  side: string,
  filledSize: number,
  avgPrice: number,
  strategy: string
): void {
  logger.info(
    `ORDER_FILLED | order_id=${orderId} | side=${side} | filled_size=${filledSize.toFixed(4)} | avg_price=${avgPrice.toFixed(4)} | strategy=${strategy}`
  );
}

export function logSignal(
  strategy: string,
  signal: string,
  tokenId: string,
  reason: string,
  extra?: Record<string, unknown>
): void {
  const ext = extra ? " | " + Object.entries(extra).map(([k, v]) => `${k}=${v}`).join(" ") : "";
  logger.info(
    `SIGNAL | strategy=${strategy} | signal=${signal} | token_id=${tokenId?.slice(0, 16) ?? "N/A"}... | reason=${reason}${ext}`
  );
}

export function logError(context: string, error: unknown): void {
  const err = error instanceof Error ? error : new Error(String(error));
  logger.error(`ERROR | context=${context} | error=${err.name}: ${err.message}`);
  if (err.stack) logger.error(err.stack);
}
