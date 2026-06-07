import { metadataCorsOptionsRequestHandler } from "mcp-handler";
import { buildPrmResponse } from "@/lib/auth/prm";

/**
 * RFC 9728 Protected Resource Metadata (root form).
 *
 * The `resource` value MUST match the connector URL exactly (MCP_SERVER_URL)
 * or Claude drops the bearer. Env is read at request time, not build time.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(): Response {
  return buildPrmResponse();
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
