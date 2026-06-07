// Minimal live smoke test against the deployed MCP server.
// Usage: node scripts/smoke.mjs [url] [bearerToken]
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = process.argv[2] || "https://stock-market-mcp.vercel.app/api/mcp";
const token = process.argv[3];

const transport = new StreamableHTTPClientTransport(new URL(url), {
  requestInit: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
});
const client = new Client({ name: "smoke", version: "0.0.0" }, { capabilities: {} });

await client.connect(transport);
const { tools } = await client.listTools();
console.log(`connected. ${tools.length} tool(s): ${tools.map((t) => t.name).join(", ")}`);

const res = await client.callTool({ name: "get_quote", arguments: { symbols: "AAPL" } });
const text = res.content?.[0]?.text ?? JSON.stringify(res);
let price = "(unparsed)";
try {
  const j = JSON.parse(text);
  const q = Array.isArray(j) ? j[0] : j;
  price = `${q.symbol} regularMarketPrice=${q.regularMarketPrice} ${q.currency || ""} marketState=${q.marketState}`;
} catch {}
console.log("get_quote(AAPL) ->", price);
console.log("isError:", res.isError === true);
await client.close();
