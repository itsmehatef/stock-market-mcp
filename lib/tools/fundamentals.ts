/**
 * Fundamentals tool group.
 *
 * Tools backed by financial-statement data from Yahoo Finance:
 * - `get_financial_statements` — the legacy `quoteSummary` statement-history
 *   modules (largely empty since Nov 2024; kept for parity).
 * - `get_fundamentals_time_series` — the live statement source via
 *   `/ws/fundamentals-timeseries`.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { QuoteSummaryModules } from "yahoo-finance2/modules/quoteSummary";
import type { FundamentalsTimeSeriesOptions } from "yahoo-finance2/modules/fundamentalsTimeSeries";
import { yf } from "@/lib/yahoo";
import { toTextContent, toErrorContent } from "@/lib/mcp/format";
import { readOnly } from "@/lib/mcp/annotations";
import { symbol, dateParam } from "@/lib/mcp/params";

/**
 * Map a requested statement type to its `quoteSummary` history module(s).
 * Each entry is the annual module name; the `Quarterly` suffix is appended
 * when the caller requests quarterly data.
 */
const STATEMENT_BASE_MODULES = {
  income: ["incomeStatementHistory"],
  balance: ["balanceSheetHistory"],
  cashflow: ["cashflowStatementHistory"],
  all: [
    "incomeStatementHistory",
    "balanceSheetHistory",
    "cashflowStatementHistory",
  ],
} as const satisfies Record<string, QuoteSummaryModules[]>;

export function registerFundamentalsTools(server: McpServer): void {
  server.registerTool(
    "get_financial_statements",
    {
      title: "Get financial statements",
      description:
        "Income statement, balance sheet, and/or cash-flow statement history " +
        "for a symbol, via the Yahoo Finance `quoteSummary` statement-history " +
        "modules (annual by default, quarterly when `quarterly` is true). " +
        "WARNING: Yahoo has returned little to no data from these modules " +
        "since November 2024 — they are kept for API parity only. For live " +
        "statement data prefer `get_fundamentals_time_series`.",
      inputSchema: {
        symbol,
        statement: z
          .enum(["income", "balance", "cashflow", "all"])
          .optional()
          .describe(
            'Which statement(s) to fetch. Defaults to "all". One of "income", "balance", "cashflow", "all".',
          ),
        quarterly: z
          .boolean()
          .optional()
          .describe(
            "Return quarterly statements instead of annual ones. Defaults to false (annual).",
          ),
      },
      annotations: readOnly,
    },
    async ({ symbol, statement, quarterly }) => {
      try {
        const base = STATEMENT_BASE_MODULES[statement ?? "all"];
        const modules: QuoteSummaryModules[] = base.map((name) =>
          quarterly ? (`${name}Quarterly` as QuoteSummaryModules) : name,
        );
        // `earnings` carries the EPS/revenue history that still populates and
        // gives this otherwise-sparse response some real data.
        modules.push("earnings");

        const data = await yf.quoteSummary(symbol, { modules });
        return toTextContent(data);
      } catch (err) {
        return toErrorContent(err);
      }
    },
  );

  server.registerTool(
    "get_fundamentals_time_series",
    {
      title: "Get fundamentals time series",
      description:
        "Detailed financial-statement line items over time (income statement, " +
        "balance sheet, cash flow) from the Yahoo Finance " +
        "`/ws/fundamentals-timeseries` endpoint. This is the LIVE statement " +
        "source and the upstream-recommended replacement for " +
        "`get_financial_statements`, whose `quoteSummary` modules have been " +
        "empty since November 2024. Returns one record per period (annual, " +
        "quarterly, or trailing-twelve-month).",
      inputSchema: {
        symbol,
        period1: dateParam.describe(
          'Start of the window (required). ISO date string (e.g. "2020-01-01") or unix seconds.',
        ),
        period2: dateParam
          .optional()
          .describe(
            'End of the window (optional; defaults to now). ISO date string or unix seconds.',
          ),
        type: z
          .enum(["annual", "quarterly", "trailing"])
          .optional()
          .describe(
            'Reporting period granularity. One of "annual", "quarterly", "trailing".',
          ),
        module: z
          .enum(["financials", "balance-sheet", "cash-flow", "all"])
          .describe(
            'Which statement to fetch (required). One of "financials" (income statement), "balance-sheet", "cash-flow", "all".',
          ),
        region: z.string().optional().describe('Region code, e.g. "US".'),
        lang: z.string().optional().describe('Language code, e.g. "en-US".'),
      },
      annotations: readOnly,
    },
    async ({ symbol, period1, period2, type, module, region, lang }) => {
      try {
        // `period1`/`period2` accept `string | number | Date`; pass through.
        const opts: FundamentalsTimeSeriesOptions = { period1, module };
        if (period2 !== undefined) opts.period2 = period2;
        if (type) opts.type = type;
        if (region) opts.region = region;
        if (lang) opts.lang = lang;

        const data = await yf.fundamentalsTimeSeries(symbol, opts);
        return toTextContent(data);
      } catch (err) {
        return toErrorContent(err);
      }
    },
  );
}
