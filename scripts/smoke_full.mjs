import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
const url = process.argv[2] || "https://stock-market-mcp.vercel.app/api/mcp";
const token = process.argv[3];
const t = new StreamableHTTPClientTransport(new URL(url), { requestInit: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined });
const c = new Client({ name: "smoke", version: "0" }, { capabilities: {} });
await c.connect(t);
const { tools } = await c.listTools();
console.log(`TOOLS (${tools.length}): ${tools.map(x=>x.name).sort().join(", ")}`);
const calls = [
  ["get_quote", { symbols: ["AAPL","MSFT"] }],
  ["get_company_profile", { symbol: "AAPL" }],
  ["get_chart", { symbol: "AAPL", period1: "2026-05-20", interval: "1d" }],
  ["get_fundamentals_time_series", { symbol: "AAPL", period1: "2023-01-01", module: "financials", type: "annual" }],
  ["get_options", { symbol: "AAPL" }],
  ["search", { query: "apple" }],
  ["run_screener", { scrIds: "day_gainers", count: 3 }],
  ["get_analyst_info", { symbol: "TSLA" }],
];
for (const [name, args] of calls) {
  try {
    const r = await c.callTool({ name, arguments: args });
    const txt = r.content?.[0]?.text ?? "";
    const ok = r.isError !== true && txt.length > 0;
    console.log(`${ok?"OK ":"ERR"} ${name}  (${txt.length}b)  ${txt.replace(/\s+/g," ").slice(0,110)}`);
  } catch (e) {
    console.log(`THROW ${name}: ${e.message}`);
  }
}
await c.close();
