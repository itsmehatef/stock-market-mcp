/**
 * Options tool group.
 *
 * Tools backed by the Yahoo `/v7/finance/options` endpoint, e.g.
 * `get_options`.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { OptionsOptions } from "yahoo-finance2/modules/options";
import { yf } from "@/lib/yahoo";
import { toTextContent, toErrorContent } from "@/lib/mcp/format";
import { readOnly } from "@/lib/mcp/annotations";
import { symbol, dateParam } from "@/lib/mcp/params";

export function registerOptionsTools(server: McpServer): void {
  server.registerTool(
    "get_options",
    {
      title: "Get options chain",
      description:
        "Options chain for a symbol from Yahoo Finance (/v7/finance/options): " +
        "calls, puts, strikes, bid/ask, volume, open interest, implied " +
        "volatility, and the underlying quote. Omit `date` to get the nearest " +
        "expiry plus the full list of available expiration dates (in " +
        "`expirationDates`); pass `date` to fetch a specific expiration.",
      inputSchema: {
        symbol,
        date: dateParam
          .optional()
          .describe(
            "Expiration to fetch (ISO date string or unix seconds). Omit to " +
              "return the nearest expiry plus all available expiration dates.",
          ),
        formatted: z
          .boolean()
          .optional()
          .describe("Return Yahoo's formatted (human-readable) values."),
        region: z.string().optional().describe('Region code, e.g. "US".'),
        lang: z.string().optional().describe('Language code, e.g. "en-US".'),
      },
      annotations: readOnly,
    },
    async ({ symbol, date, formatted, region, lang }) => {
      try {
        const opts: OptionsOptions = {};
        // `date` accepts string | number | Date in yahoo-finance2; pass the
        // raw dateParam value straight through (no Date coercion required).
        if (date !== undefined) opts.date = date;
        if (formatted !== undefined) opts.formatted = formatted;
        if (region) opts.region = region;
        if (lang) opts.lang = lang;

        const data = await yf.options(symbol, opts);
        return toTextContent(data);
      } catch (err) {
        return toErrorContent(err);
      }
    },
  );
}
