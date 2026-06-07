/**
 * Quote tool group.
 *
 * Tools backed by the Yahoo `/v7/finance/quote` family and the related
 * recommendation / trending endpoints:
 * - `get_quote` — real-time / delayed quotes for one or many symbols.
 * - `get_quote_combine` — single-symbol quote via the debounced `quoteCombine`.
 * - `get_recommendations_by_symbol` — peer / similar symbols for one or many tickers.
 * - `get_trending_symbols` — currently-trending symbols for a region.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { QuoteField, QuoteOptions } from "yahoo-finance2/modules/quote";
import type { TrendingSymbolsOptions } from "yahoo-finance2/modules/trendingSymbols";
import { yf } from "@/lib/yahoo";
import { toTextContent, toErrorContent } from "@/lib/mcp/format";
import { readOnly } from "@/lib/mcp/annotations";
import { symbol, symbols } from "@/lib/mcp/params";

export function registerQuoteTools(server: McpServer): void {
  server.registerTool(
    "get_quote",
    {
      title: "Get quote",
      description:
        "Real-time / delayed market quote(s) for one or more symbols " +
        "(stocks, ETFs, indices, FX, crypto, options). Batches many symbols " +
        "in a single Yahoo Finance request.",
      inputSchema: {
        symbols,
        fields: z
          .array(z.string())
          .optional()
          .describe("Restrict the response to these quote fields."),
        region: z.string().optional().describe('Region code, e.g. "US".'),
        lang: z.string().optional().describe('Language code, e.g. "en-US".'),
      },
      annotations: readOnly,
    },
    async ({ symbols, fields, region, lang }) => {
      try {
        const opts: QuoteOptions = {};
        if (fields) opts.fields = fields as QuoteField[];
        if (region) opts.region = region;
        if (lang) opts.lang = lang;

        // Narrowing picks the typed single- vs multi-symbol overload
        // (the `string | string[]` overload would degrade the result to `any`).
        const data = Array.isArray(symbols)
          ? await yf.quote(symbols, opts)
          : await yf.quote(symbols, opts);
        return toTextContent(data);
      } catch (err) {
        return toErrorContent(err);
      }
    },
  );

  server.registerTool(
    "get_quote_combine",
    {
      title: "Get quote (combined)",
      description:
        "Real-time / delayed market quote for a single symbol via Yahoo " +
        "Finance's debounced `quoteCombine`, which coalesces concurrent " +
        "single-symbol requests into one underlying `/v7/finance/quote` call. " +
        "Returns the same quote shape as get_quote for one ticker.",
      inputSchema: {
        symbol,
        fields: z
          .array(z.string())
          .optional()
          .describe("Restrict the response to these quote fields."),
        region: z.string().optional().describe('Region code, e.g. "US".'),
        lang: z.string().optional().describe('Language code, e.g. "en-US".'),
        maxBatchSize: z
          .number()
          .optional()
          .describe(
            "Hint for the maximum number of symbols Yahoo Finance batches " +
              "per underlying request (default 100). Configured on the shared " +
              "client; accepted for API parity but does not alter this call.",
          ),
      },
      annotations: readOnly,
    },
    // `maxBatchSize` is intentionally not forwarded: `quoteCombine`'s per-call
    // options are `QuoteOptions` (fields/lang/region/return) only. The batch
    // size is a client-construction option (`QuoteCombineOptions.maxSymbolsPerRequest`),
    // not a query option, so passing it into the call would be a type error.
    async ({ symbol, fields, region, lang }) => {
      try {
        const opts: QuoteOptions = {};
        if (fields) opts.fields = fields as QuoteField[];
        if (region) opts.region = region;
        if (lang) opts.lang = lang;

        const data = await yf.quoteCombine(symbol, opts);
        return toTextContent(data);
      } catch (err) {
        return toErrorContent(err);
      }
    },
  );

  server.registerTool(
    "get_recommendations_by_symbol",
    {
      title: "Get recommendations by symbol",
      description:
        "Related / similar symbols for one or more tickers from Yahoo " +
        "Finance's algorithmic recommendations endpoint (price-movement and " +
        "sector similarity). Distinct from analyst recommendation trends. " +
        "Accepts a single symbol or an array; the array form is batched.",
      inputSchema: {
        symbols,
      },
      annotations: readOnly,
    },
    async ({ symbols }) => {
      try {
        // Narrowing picks the typed single- vs multi-symbol overload
        // (single -> Response, array -> Response[]).
        const data = Array.isArray(symbols)
          ? await yf.recommendationsBySymbol(symbols)
          : await yf.recommendationsBySymbol(symbols);
        return toTextContent(data);
      } catch (err) {
        return toErrorContent(err);
      }
    },
  );

  server.registerTool(
    "get_trending_symbols",
    {
      title: "Get trending symbols",
      description:
        "Symbols currently trending in a given region from Yahoo Finance " +
        "(based on search volume and trading activity). NOTE: the first " +
        'argument is a region code (e.g. "US", "GB", "DE"), not a ticker.',
      inputSchema: {
        region: z
          .string()
          .min(1)
          .describe('Region code, e.g. "US", "GB", or "DE".'),
        count: z
          .number()
          .optional()
          .describe("Number of trending symbols to return (default 5)."),
        lang: z.string().optional().describe('Language code, e.g. "en-US".'),
      },
      annotations: readOnly,
    },
    async ({ region, count, lang }) => {
      try {
        const opts: TrendingSymbolsOptions = {};
        if (count !== undefined) opts.count = count;
        if (lang) opts.lang = lang;

        const data = await yf.trendingSymbols(region, opts);
        return toTextContent(data);
      } catch (err) {
        return toErrorContent(err);
      }
    },
  );
}
