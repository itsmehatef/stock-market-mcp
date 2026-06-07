/**
 * Summary tool group.
 *
 * Tools backed by Yahoo Finance's `quoteSummary` endpoint
 * (`/v10/finance/quoteSummary`). `get_quote_summary` is the raw passthrough
 * (caller picks the modules); the rest are convenience splits that request a
 * fixed, purpose-built set of modules:
 * - `get_quote_summary`   — arbitrary modules (or `'all'`)
 * - `get_company_profile` — company / asset profile + price
 * - `get_key_statistics`  — valuation & key statistics
 * - `get_earnings`        — earnings history, trend and calendar
 * - `get_analyst_info`    — recommendations, upgrades/downgrades, price targets
 * - `get_holders`         — institutional / fund / insider / major ownership
 * - `get_sec_filings`     — SEC filing metadata + EDGAR links
 * - `get_fund_data`       — fund/ETF profile, performance and top holdings
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  QuoteSummaryModules,
  QuoteSummaryOptions,
} from "yahoo-finance2/modules/quoteSummary";
import { yf } from "@/lib/yahoo";
import { toTextContent, toErrorContent } from "@/lib/mcp/format";
import { readOnly } from "@/lib/mcp/annotations";
import { symbol } from "@/lib/mcp/params";

/** Ownership modules surfaced by `get_holders`, keyed by `holderType`. */
const HOLDER_MODULES = {
  institutional: ["institutionOwnership"],
  fund: ["fundOwnership"],
  insider: ["insiderHolders", "insiderTransactions", "netSharePurchaseActivity"],
  major: ["majorHoldersBreakdown", "majorDirectHolders"],
} satisfies Record<string, QuoteSummaryModules[]>;

/** Every ownership module, used when `holderType` is omitted or `'all'`. */
const ALL_HOLDER_MODULES: QuoteSummaryModules[] = [
  "institutionOwnership",
  "fundOwnership",
  "majorHoldersBreakdown",
  "majorDirectHolders",
  "insiderHolders",
  "insiderTransactions",
  "netSharePurchaseActivity",
];

export function registerSummaryTools(server: McpServer): void {
  server.registerTool(
    "get_quote_summary",
    {
      title: "Get quote summary",
      description:
        "Raw passthrough to Yahoo Finance's quoteSummary endpoint. Returns the " +
        "requested data modules verbatim. Choose any of the 33 modules (e.g. " +
        '"assetProfile", "financialData", "earningsTrend", "topHoldings") or ' +
        'pass "all" to request every module. Prefer a focused module list — ' +
        "fewer modules respond faster.",
      inputSchema: {
        symbol,
        modules: z
          .union([z.array(z.string()), z.literal("all")])
          .describe(
            'The quoteSummary modules to fetch: an array of module names, or "all".',
          ),
      },
      annotations: readOnly,
    },
    async ({ symbol, modules }) => {
      try {
        const opts: QuoteSummaryOptions = {
          modules:
            modules === "all"
              ? "all"
              : (modules as QuoteSummaryModules[]),
        };
        const data = await yf.quoteSummary(symbol, opts);
        return toTextContent(data);
      } catch (err) {
        return toErrorContent(err);
      }
    },
  );

  server.registerTool(
    "get_company_profile",
    {
      title: "Get company profile",
      description:
        "Company / asset profile from Yahoo Finance: business summary, sector, " +
        "industry, address, key officers, plus the live price and quote type. " +
        "Convenience split over the assetProfile, summaryProfile, price, " +
        "quoteType and summaryDetail quoteSummary modules.",
      inputSchema: { symbol },
      annotations: readOnly,
    },
    async ({ symbol }) => {
      try {
        const opts: QuoteSummaryOptions = {
          modules: [
            "assetProfile",
            "summaryProfile",
            "price",
            "quoteType",
            "summaryDetail",
          ],
        };
        const data = await yf.quoteSummary(symbol, opts);
        return toTextContent(data);
      } catch (err) {
        return toErrorContent(err);
      }
    },
  );

  server.registerTool(
    "get_key_statistics",
    {
      title: "Get key statistics",
      description:
        "Valuation and key statistics from Yahoo Finance: market cap, P/E, " +
        "margins, returns, shares outstanding, beta and more. Convenience " +
        "split over the defaultKeyStatistics, financialData and summaryDetail " +
        "quoteSummary modules.",
      inputSchema: { symbol },
      annotations: readOnly,
    },
    async ({ symbol }) => {
      try {
        const opts: QuoteSummaryOptions = {
          modules: ["defaultKeyStatistics", "financialData", "summaryDetail"],
        };
        const data = await yf.quoteSummary(symbol, opts);
        return toTextContent(data);
      } catch (err) {
        return toErrorContent(err);
      }
    },
  );

  server.registerTool(
    "get_earnings",
    {
      title: "Get earnings",
      description:
        "Earnings data from Yahoo Finance: reported vs estimated EPS history, " +
        "the earnings/estimates trend, and upcoming calendar events (next " +
        "earnings date, plus dividend / ex-dividend dates). Convenience split " +
        "over the earnings, earningsHistory, earningsTrend and calendarEvents " +
        "quoteSummary modules.",
      inputSchema: { symbol },
      annotations: readOnly,
    },
    async ({ symbol }) => {
      try {
        const opts: QuoteSummaryOptions = {
          modules: [
            "earnings",
            "earningsHistory",
            "earningsTrend",
            "calendarEvents",
          ],
        };
        const data = await yf.quoteSummary(symbol, opts);
        return toTextContent(data);
      } catch (err) {
        return toErrorContent(err);
      }
    },
  );

  server.registerTool(
    "get_analyst_info",
    {
      title: "Get analyst info",
      description:
        "Analyst coverage from Yahoo Finance: the recommendation trend " +
        "(strong buy → sell counts over time), the upgrade/downgrade history, " +
        "and analyst price targets / opinion counts (targetMeanPrice, " +
        "numberOfAnalystOpinions). Convenience split over the " +
        "recommendationTrend, upgradeDowngradeHistory and financialData " +
        "quoteSummary modules.",
      inputSchema: { symbol },
      annotations: readOnly,
    },
    async ({ symbol }) => {
      try {
        const opts: QuoteSummaryOptions = {
          modules: [
            "recommendationTrend",
            "upgradeDowngradeHistory",
            "financialData",
          ],
        };
        const data = await yf.quoteSummary(symbol, opts);
        return toTextContent(data);
      } catch (err) {
        return toErrorContent(err);
      }
    },
  );

  server.registerTool(
    "get_holders",
    {
      title: "Get holders",
      description:
        "Ownership data from Yahoo Finance. With no holderType, returns every " +
        "ownership module: institutional & fund ownership, major holders " +
        "breakdown, major direct holders, insider holders, insider " +
        "transactions and net share purchase activity. Pass holderType to " +
        "narrow to a single category.",
      inputSchema: {
        symbol,
        holderType: z
          .enum(["institutional", "fund", "insider", "major", "all"])
          .optional()
          .describe(
            "Restrict to one ownership category. Omit (or use 'all') for every module.",
          ),
      },
      annotations: readOnly,
    },
    async ({ symbol, holderType }) => {
      try {
        const modules: QuoteSummaryModules[] =
          holderType && holderType !== "all"
            ? HOLDER_MODULES[holderType]
            : ALL_HOLDER_MODULES;
        const opts: QuoteSummaryOptions = { modules };
        const data = await yf.quoteSummary(symbol, opts);
        return toTextContent(data);
      } catch (err) {
        return toErrorContent(err);
      }
    },
  );

  server.registerTool(
    "get_sec_filings",
    {
      title: "Get SEC filings",
      description:
        "SEC filing metadata from Yahoo Finance: filing type, title, date and " +
        "EDGAR links (no full text). Convenience split over the secFilings " +
        "quoteSummary module.",
      inputSchema: { symbol },
      annotations: readOnly,
    },
    async ({ symbol }) => {
      try {
        const opts: QuoteSummaryOptions = { modules: ["secFilings"] };
        const data = await yf.quoteSummary(symbol, opts);
        return toTextContent(data);
      } catch (err) {
        return toErrorContent(err);
      }
    },
  );

  server.registerTool(
    "get_fund_data",
    {
      title: "Get fund data",
      description:
        "Fund / ETF data from Yahoo Finance: fund profile (family, category, " +
        "fees), performance history, and top holdings with sector/asset " +
        "allocation. Only meaningful for funds and ETFs. Convenience split " +
        "over the fundProfile, fundPerformance and topHoldings quoteSummary " +
        "modules.",
      inputSchema: { symbol },
      annotations: readOnly,
    },
    async ({ symbol }) => {
      try {
        const opts: QuoteSummaryOptions = {
          modules: ["fundProfile", "fundPerformance", "topHoldings"],
        };
        const data = await yf.quoteSummary(symbol, opts);
        return toTextContent(data);
      } catch (err) {
        return toErrorContent(err);
      }
    },
  );
}
