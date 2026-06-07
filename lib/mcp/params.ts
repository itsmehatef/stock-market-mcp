/**
 * Reusable zod validators and coercion helpers for MCP tool input schemas.
 *
 * These keep the per-tool `inputSchema` objects consistent across tool groups:
 * the same `symbol` / `symbols` / `dateParam` shapes are reused verbatim so
 * every tool that accepts a ticker or a date describes it the same way.
 *
 * NOTE: the exported schemas are PLAIN zod validators (not wrapped in
 * `z.object`) — they are meant to be dropped straight into a tool's
 * `inputSchema` object, e.g. `inputSchema: { symbol, period1: dateParam }`.
 */
import { z } from "zod";

/** A single non-empty ticker symbol, e.g. `"AAPL"`. */
export const symbol = z
  .string()
  .min(1)
  .describe('A single ticker symbol, e.g. "AAPL".');

/**
 * One symbol or an array of symbols. Methods like `quote` /
 * `recommendationsBySymbol` accept both shapes and batch the array form.
 */
export const symbols = z
  .union([z.string(), z.array(z.string())])
  .describe('A single symbol or an array of symbols, e.g. "AAPL" or ["AAPL","MSFT"].');

/**
 * A date-typed parameter (e.g. `period1` / `period2`).
 *
 * Accepts either an ISO date string (`"2024-01-01"`) or a unix timestamp in
 * seconds (`1704067200`). `yahoo-finance2` accepts `string | number | Date`
 * for these params and coerces internally; we pass the value straight through
 * and only call {@link toDate} when a concrete `Date` instance is required.
 */
export const dateParam = z
  .union([z.string(), z.number()])
  .describe(
    'A date: either an ISO date string (e.g. "2024-01-01") or a unix timestamp in seconds.',
  );

/**
 * Coerce a {@link dateParam} value into a `Date`.
 *
 * - `number` is treated as unix **seconds** (multiplied to milliseconds).
 * - `string` is parsed by the `Date` constructor (ISO 8601 etc.).
 *
 * Only needed when a method signature demands a real `Date`; otherwise the
 * raw `string | number` can be forwarded to `yahoo-finance2` unchanged.
 */
export function toDate(v: string | number): Date {
  return typeof v === "number" ? new Date(v * 1000) : new Date(v);
}
