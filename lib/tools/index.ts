/**
 * Central tool registry.
 *
 * `registerAllTools` wires every tool group onto the MCP server. The request
 * route calls this once inside the `createMcpHandler` server callback so the
 * route stays agnostic of individual tools.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerQuoteTools } from "@/lib/tools/quote";
import { registerSummaryTools } from "@/lib/tools/summary";
import { registerFundamentalsTools } from "@/lib/tools/fundamentals";
import { registerTimeseriesTools } from "@/lib/tools/timeseries";
import { registerOptionsTools } from "@/lib/tools/options";
import { registerDiscoveryTools } from "@/lib/tools/discovery";

export function registerAllTools(server: McpServer): void {
  registerQuoteTools(server);
  registerSummaryTools(server);
  registerFundamentalsTools(server);
  registerTimeseriesTools(server);
  registerOptionsTools(server);
  registerDiscoveryTools(server);
}
