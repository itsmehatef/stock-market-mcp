/**
 * Discovery tool group.
 *
 * Tools backed by Yahoo's search / insights / screening endpoints:
 * - `search`  — Yahoo Finance search (`/v1/finance/search`), reshaped to the
 *               ChatGPT deep-research `{ results: [{ id, title, url }] }` contract
 *               while still embedding the richer Yahoo quote/news fields.
 * - `fetch`   — resolves an opaque id from `search` to a readable document
 *               (`{ id, title, text, url, metadata }`). ChatGPT-only; harmless
 *               to other clients.
 * - `get_insights`  — Yahoo `/ws/insights` technical outlook + research reports.
 * - `run_screener`  — Yahoo predefined screener (`day_gainers`, etc.).
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  SearchOptions,
  SearchResult,
} from "yahoo-finance2/modules/search";
import type { InsightsOptions } from "yahoo-finance2/modules/insights";
import type {
  ScreenerOptions,
  PredefinedScreenerModules,
} from "yahoo-finance2/modules/screener";
import type {
  QuoteSummaryModules,
  QuoteSummaryResult,
} from "yahoo-finance2/modules/quoteSummary";
import { yf } from "@/lib/yahoo";
import { toTextContent, toErrorContent } from "@/lib/mcp/format";
import { readOnly } from "@/lib/mcp/annotations";
import { symbol } from "@/lib/mcp/params";

/** Yahoo Finance quote-page URL for a given symbol. */
function quoteUrl(sym: string): string {
  return `https://finance.yahoo.com/quote/${encodeURIComponent(sym)}`;
}

/** A single hit in `SearchResult.quotes` (Yahoo or non-Yahoo entity). */
type SearchQuoteHit = SearchResult["quotes"][number];
/** The Yahoo-Finance variants always carry a `symbol`; non-Yahoo hits do not. */
type SearchQuoteYahooHit = Extract<SearchQuoteHit, { isYahooFinance: true }>;

/** A Yahoo search quote hit always carries a `symbol`; non-Yahoo hits do not. */
function isYahooQuoteHit(q: SearchQuoteHit): q is SearchQuoteYahooHit {
  return q.isYahooFinance === true && typeof q.symbol === "string";
}

export function registerDiscoveryTools(server: McpServer): void {
  // ---------------------------------------------------------------------------
  // search  (ChatGPT deep-research contract + rich Yahoo payload)
  // ---------------------------------------------------------------------------
  server.registerTool(
    "search",
    {
      title: "Search Yahoo Finance",
      description:
        "Search Yahoo Finance for symbols, companies, and related news " +
        "(real /v1/finance/search endpoint; the only built-in news source). " +
        "Returns { results: [{ id, title, url, ... }] }: each result is a " +
        "quote hit (id = ticker symbol) or a news hit (id = \"news#<uuid>\"). " +
        "Each result also carries the richer Yahoo fields (exchange, quoteType, " +
        "publisher, etc.) as additional properties.",
      inputSchema: {
        query: z
          .string()
          .min(1)
          .describe('Search term: a symbol, company name, or keywords, e.g. "Apple".'),
        quotesCount: z
          .number()
          .int()
          .optional()
          .describe("Maximum number of quote (symbol) results to return. Default 6."),
        newsCount: z
          .number()
          .int()
          .optional()
          .describe("Maximum number of news results to return. Default 4."),
        enableFuzzyQuery: z
          .boolean()
          .optional()
          .describe("Enable approximate matching for typos / partial names."),
        region: z.string().optional().describe('Region code, e.g. "US".'),
        lang: z.string().optional().describe('Language code, e.g. "en-US".'),
      },
      annotations: readOnly,
    },
    async ({ query, quotesCount, newsCount, enableFuzzyQuery, region, lang }) => {
      try {
        const opts: SearchOptions = {
          quotesCount: quotesCount ?? 6,
          newsCount: newsCount ?? 4,
        };
        if (enableFuzzyQuery !== undefined) opts.enableFuzzyQuery = enableFuzzyQuery;
        if (region) opts.region = region;
        if (lang) opts.lang = lang;

        const data: SearchResult = await yf.search(query, opts);

        const results: Array<Record<string, unknown>> = [];

        for (const q of data.quotes) {
          if (!isYahooQuoteHit(q)) continue;
          results.push({
            id: q.symbol,
            title: q.shortname ?? q.longname ?? q.symbol,
            url: quoteUrl(q.symbol),
            // Richer fields for non-ChatGPT clients.
            symbol: q.symbol,
            exchange: q.exchange,
            quoteType: q.quoteType,
            typeDisp: q.typeDisp,
            shortname: q.shortname,
            longname: q.longname,
            sector: q.sector,
            industry: q.industry,
            score: q.score,
          });
        }

        for (const n of data.news) {
          results.push({
            id: `news#${n.uuid}`,
            title: n.title,
            url: n.link,
            // Richer fields for non-ChatGPT clients.
            publisher: n.publisher,
            providerPublishTime: n.providerPublishTime,
            type: n.type,
            relatedTickers: n.relatedTickers,
          });
        }

        return toTextContent({ results });
      } catch (err) {
        return toErrorContent(err);
      }
    },
  );

  // ---------------------------------------------------------------------------
  // fetch  (resolve an id from `search` to a readable document — ChatGPT)
  // ---------------------------------------------------------------------------
  server.registerTool(
    "fetch",
    {
      title: "Fetch a document by id",
      description:
        "Resolve an opaque id from the `search` tool to a readable document " +
        "(real Yahoo Finance data). A ticker id (e.g. \"AAPL\") resolves to a " +
        "company quote summary; a news id (\"news#<uuid>\") resolves to the " +
        "matching news article. Returns { id, title, text, url, metadata }.",
      inputSchema: {
        id: z
          .string()
          .min(1)
          .describe(
            'An id returned by the `search` tool: a ticker symbol (e.g. "AAPL") ' +
              'or a news id ("news#<uuid>").',
          ),
      },
      annotations: readOnly,
    },
    async ({ id }) => {
      try {
        if (id.startsWith("news#")) {
          // News ids are not directly fetchable by uuid; there is no Yahoo
          // "get-news-by-id" endpoint. Return a clear, honest note rather than
          // fabricating content.
          const uuid = id.slice("news#".length);
          return toTextContent({
            id,
            title: "News article",
            text:
              `This id refers to a Yahoo Finance news article (uuid ${uuid}). ` +
              "Yahoo Finance does not expose a fetch-by-id endpoint for news, so " +
              "the article body is not retrievable here. Re-run the `search` tool " +
              "and follow the result's `url` to read the article.",
            url: null,
            metadata: { kind: "news", uuid },
          });
        }

        // Otherwise treat the id as a ticker symbol.
        const modules: QuoteSummaryModules[] = [
          "price",
          "summaryDetail",
          "assetProfile",
        ];
        const summary: QuoteSummaryResult = await yf.quoteSummary(id, { modules });

        const price = summary.price;
        const detail = summary.summaryDetail;
        const profile = summary.assetProfile;

        const name =
          price?.longName ?? price?.shortName ?? id;
        const lines: string[] = [`${name} (${id})`];

        if (price?.regularMarketPrice !== undefined) {
          const cur = price.currency ?? "";
          lines.push(
            `Price: ${price.regularMarketPrice}${cur ? ` ${cur}` : ""}` +
              (price.regularMarketChangePercent !== undefined
                ? ` (${(price.regularMarketChangePercent * 100).toFixed(2)}%)`
                : ""),
          );
        }
        if (price?.exchangeName) lines.push(`Exchange: ${price.exchangeName}`);
        if (price?.quoteType) lines.push(`Type: ${price.quoteType}`);
        if (detail?.marketCap !== undefined) {
          lines.push(`Market cap: ${detail.marketCap}`);
        }
        if (profile?.sector) lines.push(`Sector: ${profile.sector}`);
        if (profile?.industry) lines.push(`Industry: ${profile.industry}`);
        if (profile?.website) lines.push(`Website: ${profile.website}`);
        if (profile?.fullTimeEmployees !== undefined) {
          lines.push(`Employees: ${profile.fullTimeEmployees}`);
        }
        if (profile?.longBusinessSummary) {
          lines.push("", profile.longBusinessSummary);
        }

        return toTextContent({
          id,
          title: typeof name === "string" ? name : id,
          text: lines.join("\n"),
          url: quoteUrl(id),
          metadata: { kind: "symbol", symbol: id },
        });
      } catch (err) {
        return toErrorContent(err);
      }
    },
  );

  // ---------------------------------------------------------------------------
  // get_insights
  // ---------------------------------------------------------------------------
  server.registerTool(
    "get_insights",
    {
      title: "Get insights",
      description:
        "Yahoo Finance trading insights for a symbol (real /ws/insights " +
        "endpoint): technical outlook (short/intermediate/long term), key " +
        "technicals, valuation, company-vs-sector snapshot, and research-report " +
        "metadata.",
      inputSchema: {
        symbol,
        reportsCount: z
          .number()
          .int()
          .optional()
          .describe("Number of research reports to include. Default 2."),
        region: z.string().optional().describe('Region code, e.g. "US".'),
        lang: z.string().optional().describe('Language code, e.g. "en-US".'),
      },
      annotations: readOnly,
    },
    async ({ symbol, reportsCount, region, lang }) => {
      try {
        const opts: InsightsOptions = { reportsCount: reportsCount ?? 2 };
        if (region) opts.region = region;
        if (lang) opts.lang = lang;

        const data = await yf.insights(symbol, opts);
        return toTextContent(data);
      } catch (err) {
        return toErrorContent(err);
      }
    },
  );

  // ---------------------------------------------------------------------------
  // run_screener
  // ---------------------------------------------------------------------------
  server.registerTool(
    "run_screener",
    {
      title: "Run screener",
      description:
        "Run a Yahoo Finance predefined stock screener (real /v1/finance/" +
        "screener endpoint). Pass a predefined screen id such as " +
        '"day_gainers", "day_losers", "most_actives", ' +
        '"growth_technology_stocks", "undervalued_large_caps", or ' +
        '"most_shorted_stocks". Replaces the deprecated dailyGainers/' +
        "dailyLosers methods.",
      inputSchema: {
        scrIds: z
          .string()
          .min(1)
          .describe(
            'A predefined screener id, e.g. "day_gainers", "day_losers", ' +
              '"most_actives".',
          ),
        count: z
          .number()
          .int()
          .optional()
          .describe("Maximum number of results to return."),
        region: z.string().optional().describe('Region code, e.g. "US".'),
        lang: z.string().optional().describe('Language code, e.g. "en-US".'),
      },
      annotations: readOnly,
    },
    async ({ scrIds, count, region, lang }) => {
      try {
        // `scrIds` is a free-form string at the MCP boundary; yahoo-finance2
        // types the first arg as a literal union of known predefined ids.
        // Cast through to forward the value (Yahoo validates the id server-side
        // and the handler surfaces any real error).
        const opts: ScreenerOptions = {
          scrIds: scrIds as PredefinedScreenerModules,
        };
        if (count !== undefined) opts.count = count;
        if (region) opts.region = region;
        if (lang) opts.lang = lang;

        const data = await yf.screener(opts);
        return toTextContent(data);
      } catch (err) {
        return toErrorContent(err);
      }
    },
  );
}
