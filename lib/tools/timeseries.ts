/**
 * Time-series tool group.
 *
 * Tools backed by Yahoo Finance OHLCV / price-history endpoints:
 * - `get_chart`      → `/v8/finance/chart` (preferred; intraday + events)
 * - `get_historical` → legacy download endpoint (adjusted close + dividends/splits)
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ChartOptions } from "yahoo-finance2/modules/chart";
import type {
  HistoricalOptionsEventsHistory,
  HistoricalOptionsEventsDividends,
  HistoricalOptionsEventsSplit,
} from "yahoo-finance2/modules/historical";
import { yf } from "@/lib/yahoo";
import { toTextContent, toErrorContent } from "@/lib/mcp/format";
import { readOnly } from "@/lib/mcp/annotations";
import { symbol, dateParam } from "@/lib/mcp/params";

/** Intervals accepted by the chart endpoint (incl. intraday). */
const chartInterval = z
  .enum([
    "1m",
    "2m",
    "5m",
    "15m",
    "30m",
    "60m",
    "90m",
    "1h",
    "1d",
    "5d",
    "1wk",
    "1mo",
    "3mo",
  ])
  .describe('Candle interval. Default "1d". Intraday intervals have limited history.');

/** Intervals accepted by the legacy historical endpoint. */
const historicalInterval = z
  .enum(["1d", "1wk", "1mo"])
  .describe('Candle interval. Default "1d".');

/** Event series the historical endpoint can return. */
const historicalEvents = z
  .enum(["history", "dividends", "split"])
  .describe(
    'Which series to return: "history" (OHLCV, default), "dividends", or "split".',
  );

export function registerTimeseriesTools(server: McpServer): void {
  server.registerTool(
    "get_chart",
    {
      title: "Get price chart",
      description:
        "Historical OHLCV price candles, plus dividend/split events, from " +
        "Yahoo Finance's /v8/finance/chart endpoint. Supports intraday " +
        "intervals (1m–90m, 1h) and daily/weekly/monthly candles. This is the " +
        "preferred time-series tool; prefer it over get_historical unless you " +
        "specifically need adjusted-close-only output.",
      inputSchema: {
        symbol,
        period1: dateParam.describe(
          "Start of the range (ISO date string or unix seconds). Required.",
        ),
        period2: dateParam
          .optional()
          .describe("End of the range (ISO date string or unix seconds). Defaults to now."),
        interval: chartInterval.optional(),
        includePrePost: z
          .boolean()
          .optional()
          .describe("Include pre-/post-market data points."),
        events: z
          .string()
          .optional()
          .describe('Pipe-delimited events to include, e.g. "div|split|earn".'),
      },
      annotations: readOnly,
    },
    async ({ symbol, period1, period2, interval, includePrePost, events }) => {
      try {
        const opts: ChartOptions = { period1, interval: interval ?? "1d" };
        if (period2 !== undefined) opts.period2 = period2;
        if (includePrePost !== undefined) opts.includePrePost = includePrePost;
        if (events !== undefined) opts.events = events;

        const data = await yf.chart(symbol, opts);
        return toTextContent(data);
      } catch (err) {
        return toErrorContent(err);
      }
    },
  );

  server.registerTool(
    "get_historical",
    {
      title: "Get historical prices",
      description:
        "Historical daily/weekly/monthly data from Yahoo Finance's legacy " +
        "download endpoint. Returns OHLCV with adjusted close (events: " +
        '"history"), or a dividends / stock-splits series. Soft-superseded by ' +
        "get_chart, but kept for adjusted-close and dividend/split convenience.",
      inputSchema: {
        symbol,
        period1: dateParam.describe(
          "Start of the range (ISO date string or unix seconds). Required.",
        ),
        period2: dateParam
          .optional()
          .describe("End of the range (ISO date string or unix seconds). Defaults to now."),
        interval: historicalInterval.optional(),
        events: historicalEvents.optional(),
        includeAdjustedClose: z
          .boolean()
          .optional()
          .describe("Include the adjusted close column (history events only)."),
      },
      annotations: readOnly,
    },
    async ({
      symbol,
      period1,
      period2,
      interval,
      events,
      includeAdjustedClose,
    }) => {
      try {
        // The historical overloads are discriminated by the `events` literal,
        // so branch to keep each options object matched to its typed overload.
        switch (events) {
          case "dividends": {
            const opts: HistoricalOptionsEventsDividends = {
              period1,
              events: "dividends",
            };
            if (period2 !== undefined) opts.period2 = period2;
            if (interval !== undefined) opts.interval = interval;
            if (includeAdjustedClose !== undefined)
              opts.includeAdjustedClose = includeAdjustedClose;
            return toTextContent(await yf.historical(symbol, opts));
          }
          case "split": {
            const opts: HistoricalOptionsEventsSplit = {
              period1,
              events: "split",
            };
            if (period2 !== undefined) opts.period2 = period2;
            if (interval !== undefined) opts.interval = interval;
            if (includeAdjustedClose !== undefined)
              opts.includeAdjustedClose = includeAdjustedClose;
            return toTextContent(await yf.historical(symbol, opts));
          }
          default: {
            const opts: HistoricalOptionsEventsHistory = {
              period1,
              events: "history",
            };
            if (period2 !== undefined) opts.period2 = period2;
            if (interval !== undefined) opts.interval = interval;
            if (includeAdjustedClose !== undefined)
              opts.includeAdjustedClose = includeAdjustedClose;
            return toTextContent(await yf.historical(symbol, opts));
          }
        }
      } catch (err) {
        return toErrorContent(err);
      }
    },
  );
}
