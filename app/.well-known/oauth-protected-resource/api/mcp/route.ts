import { metadataCorsOptionsRequestHandler } from "mcp-handler";
import { buildPrmResponse } from "@/lib/auth/prm";

/**
 * RFC 9728 Protected Resource Metadata — path-inserted variant.
 *
 * Clients probe both `/.well-known/oauth-protected-resource` and the
 * path-inserted `/.well-known/oauth-protected-resource/api/mcp`. Both serve
 * the identical document whose `resource` == MCP_SERVER_URL exactly.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(): Response {
  return buildPrmResponse();
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
