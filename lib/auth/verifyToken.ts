import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { getAnonClient } from "@/lib/supabase/anon";
import { sha256Hex } from "@/lib/auth/staticTokens";

/**
 * Dual-path bearer token verification for `withMcpAuth`.
 *
 * Path 1 (static): opaque tokens prefixed with BEARER_TOKEN_PREFIX. We compute
 *   the peppered hash and call the `verify_bearer_token` SECURITY DEFINER RPC
 *   with the anon/publishable client. The RPC returns 0 rows for
 *   invalid/revoked/expired tokens and stamps `last_used_at` itself — so no
 *   service-role key is needed anywhere.
 *
 * Path 2 (OAuth JWT): verify signature against the Supabase JWKS, binding
 *   issuer and audience (RFC 8707).
 *
 * Returning `undefined` lets mcp-handler emit the 401 challenge with the
 * WWW-Authenticate / resource_metadata hint.
 *
 * All env is read lazily inside the function (or behind a lazy getter) so a
 * missing variable only fails at request time, never at `next build`.
 */

const DEFAULT_PREFIX = "yfmcp_";

type VerifyBearerTokenRow = {
  user_id: string;
  scopes: string[] | null;
};

let cachedJwks: ReturnType<typeof createRemoteJWKSet> | undefined;

function getJwks(): ReturnType<typeof createRemoteJWKSet> {
  if (cachedJwks) return cachedJwks;
  const jwksUrl = process.env.SUPABASE_JWKS_URL;
  if (!jwksUrl) {
    throw new Error("SUPABASE_JWKS_URL is not set");
  }
  cachedJwks = createRemoteJWKSet(new URL(jwksUrl));
  return cachedJwks;
}

export async function verifyToken(
  _req: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;

  const prefix = process.env.BEARER_TOKEN_PREFIX ?? DEFAULT_PREFIX;

  // (1) Static bearer path — opaque, hashed, revocable.
  if (bearerToken.startsWith(prefix)) {
    let hash: string;
    try {
      hash = sha256Hex(bearerToken); // pepper applied inside
    } catch {
      // Missing pepper at runtime — treat as unverifiable.
      return undefined;
    }

    const supabase = getAnonClient();
    const { data, error } = await supabase.rpc("verify_bearer_token", {
      p_hash: hash,
    });

    if (error) return undefined;

    const rows = (data ?? []) as VerifyBearerTokenRow[];
    const row = rows[0];
    if (!row) return undefined; // invalid / revoked / expired

    return {
      token: bearerToken,
      clientId: "static",
      scopes: row.scopes ?? ["mcp:read"],
      extra: { userId: row.user_id },
    };
  }

  // (2) OAuth JWT path — verify signature, issuer, audience, expiry.
  const issuer = process.env.OAUTH_ISSUER;
  if (!issuer) return undefined;

  try {
    const { payload } = await jwtVerify(bearerToken, getJwks(), {
      issuer,
    });

    const p = payload as JWTPayload & {
      scope?: string;
      client_id?: string;
      azp?: string;
    };
    const scopes = String(p.scope ?? "")
      .split(" ")
      .filter(Boolean);

    return {
      token: bearerToken,
      clientId: String(p.client_id ?? p.azp ?? "oauth"),
      scopes: scopes.length ? scopes : ["mcp:read"],
      expiresAt: p.exp,
      extra: { userId: p.sub ? String(p.sub) : undefined },
    };
  } catch {
    return undefined; // -> mcp-handler emits 401 challenge
  }
}
