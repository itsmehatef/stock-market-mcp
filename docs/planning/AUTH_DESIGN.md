# AUTH_DESIGN — OAuth 2.1 + DCR + Static Bearer

**Date:** 2026-06-07
**Spec baseline:** MCP Authorization 2025-06-18 (+ cheap DRAFT items). RFC 9728 / 8414 / 7591 / 7636 / 8707 / 9207.

---

## 1. Roles

- **Resource Server (RS):** this MCP server on Vercel (`https://<app>.vercel.app`). Validates bearer tokens; serves PRM; returns 401 challenge.
- **Authorization Server (AS):** **Supabase Auth** native OAuth 2.1 + OIDC server. Serves AS metadata, `/authorize`, `/token`, `/register` (DCR), JWKS. Issues access/refresh tokens.
- **End-user IdP:** Supabase Auth (same project).
- **Clients:** Claude.ai web connector (OAuth, DCR/CIMD), ChatGPT (OAuth or — for our use — static bearer in dev mode/Desktop/Cursor), curl/CI (static bearer).

**Critical correction to the original premise:** "Claude takes OAuth, ChatGPT takes bearer" is **backwards/incorrect**. Neither claude.ai nor ChatGPT's *web* surface accepts a user-pasted static bearer. Both use OAuth 2.1 + PKCE. **Static bearer tokens are accepted by ChatGPT developer-mode / Desktop / Cursor / Cline and CLI clients — NOT the claude.ai or chatgpt.com web connectors.** We therefore build **both**: full OAuth 2.1 (so the Claude.ai web connector works) AND issued static bearers (so ChatGPT-dev/Desktop/Cursor/curl work). This is the dual-auth design. (See compatibility matrix §7.)

---

## 2. Auth decisions (firm)

- **AUTH-DEC-1:** Supabase Auth is the AS. We do not hand-roll authorize/token/register. (Reduces surface; Supabase ships RFC 7591 DCR, PKCE, refresh rotation, JWKS, consent.)
- **AUTH-DEC-2:** RS serves PRM (RFC 9728) on its own origin via `mcp-handler`'s `protectedResourceHandler`, pointing `authorization_servers` at the Supabase issuer.
- **AUTH-DEC-3:** Access tokens are **RS256 JWTs** verified by the RS via Supabase JWKS (no shared secret). Migrate Supabase signing HS256 → RS256 in Phase 0.
- **AUTH-DEC-4:** A **Custom Access Token Hook** sets `aud` = `MCP_SERVER_URL`. RS rejects tokens whose `aud` != its canonical URI (RFC 8707).
- **AUTH-DEC-5:** **DCR enabled** (Supabase `/oauth/clients/register`) for Claude. We also advertise `client_id_metadata_document_supported: true` opportunistically; Supabase lacks CIMD issuance today, so DCR is the working path. Accept DCR's per-connection client growth as a known cost.
- **AUTH-DEC-6:** Static bearer tokens are **opaque, prefixed (`yfmcp_`), SHA-256-hashed at rest (+ server pepper), revocable, optionally expiring**. Stored in `mcp_bearer_tokens`. Never JWTs (so they're independently revocable and don't rely on Supabase session lifetime).
- **AUTH-DEC-7:** `verifyToken` is **dual-path** (static-first, JWT-second). One MCP endpoint, no separate routes.
- **AUTH-DEC-8:** PKCE **S256 only**; reject `plain`. Validate RFC 9207 `iss` on the authorize response. Never forward the client token to Yahoo.

---

## 3. Endpoints we (the RS) serve

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/.well-known/oauth-protected-resource` | RFC 9728 PRM (root form). |
| OPTIONS | `/.well-known/oauth-protected-resource` | CORS preflight (`metadataCorsOptionsRequestHandler`). |
| GET | `/.well-known/oauth-protected-resource/api/mcp` | PRM path-inserted variant (clients probe both). |
| GET/POST/DELETE | `/api/mcp` | MCP Streamable HTTP endpoint (auth-wrapped). |
| OPTIONS | `/api/mcp` | CORS preflight exposing MCP headers. |
| GET | `/dashboard` | Token-mint UI (Supabase-auth gated). |
| POST (server action) | `/dashboard` mint/revoke | Create/revoke static bearer tokens. |
| GET | `/auth/callback` | Supabase login callback for the dashboard. |

### PRM document (served at the two PRM paths)
```json
{
  "resource": "https://<app>.vercel.app/api/mcp",
  "authorization_servers": ["https://<project>.supabase.co/auth/v1"],
  "bearer_methods_supported": ["header"],
  "scopes_supported": ["mcp:read"],
  "resource_name": "Stock Market MCP",
  "resource_documentation": "https://<app>.vercel.app"
}
```

### 401 challenge (emitted by `withMcpAuth` when no/invalid token)
```
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer resource_metadata="https://<app>.vercel.app/.well-known/oauth-protected-resource", scope="mcp:read"
```
- Missing scope → `403` + `WWW-Authenticate: Bearer error="insufficient_scope", scope="mcp:read", resource_metadata="..."`.
- Malformed token / request → `400`.
- **The `resource_metadata` URL and the PRM `resource` value MUST exactly match the connector URL** (known 2026 Claude bug if mismatched — `aud` then fails and the Bearer is dropped).

## 4. Endpoints served by the AS (Supabase) — referenced, not built
| Path (on Supabase origin) | Purpose |
|---|---|
| `/auth/v1/.well-known/oauth-authorization-server` | RFC 8414 AS metadata. |
| `/auth/v1/.well-known/openid-configuration` | OIDC discovery (clients try this too). |
| `/auth/v1/authorize` | Authorization Code + PKCE S256, `resource` param, returns `code` + `iss`. |
| `/auth/v1/token` | Token exchange (`application/x-www-form-urlencoded`), audience-bound access token, rotated refresh. |
| `/oauth/clients/register` | RFC 7591 DCR (`application/json`). |
| `/auth/v1/.well-known/jwks.json` | Public keys for RS verification. |

AS metadata MUST advertise `code_challenge_methods_supported: ["S256"]`, `grant_types_supported: ["authorization_code","refresh_token"]`, `response_types_supported: ["code"]`, `registration_endpoint`, and `issuer` exactly matching the fetch URL.

---

## 5. Supabase schema (SQL)

`supabase/migrations/0001_bearer_tokens.sql`:
```sql
-- Static bearer tokens for ChatGPT-dev / Desktop / Cursor / CLI clients.
-- Plaintext token is shown to the user ONCE at mint time; only the hash is stored.

create table if not exists public.mcp_bearer_tokens (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  token_hash    text not null unique,          -- sha256(pepper || plaintext), hex
  token_prefix  text not null,                 -- first 12 chars for display, e.g. yfmcp_ab12
  name          text not null default 'default',
  scopes        text[] not null default array['mcp:read'],
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  expires_at    timestamptz,                   -- null = non-expiring
  revoked_at    timestamptz                    -- null = active
);

create index if not exists mcp_bearer_tokens_user_idx on public.mcp_bearer_tokens(user_id);
create unique index if not exists mcp_bearer_tokens_hash_idx on public.mcp_bearer_tokens(token_hash);

-- RLS: a user sees only their own tokens via the dashboard (anon/auth client).
alter table public.mcp_bearer_tokens enable row level security;

create policy "owner can read own tokens"
  on public.mcp_bearer_tokens for select
  using (auth.uid() = user_id);

create policy "owner can insert own tokens"
  on public.mcp_bearer_tokens for insert
  with check (auth.uid() = user_id);

create policy "owner can revoke own tokens"
  on public.mcp_bearer_tokens for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- The RS validates tokens with the SERVICE ROLE key (bypasses RLS) on /api/mcp.
```

`supabase/migrations/0002_access_token_hook.sql` — Custom Access Token Hook to bind `aud` to the MCP URI:
```sql
-- Sets the access-token `aud` claim to the MCP canonical URI so the
-- Resource Server's RFC 8707 audience check passes. Configure this function
-- as the project's "Custom Access Token" auth hook in Supabase dashboard/CLI.

create or replace function public.mcp_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  claims jsonb;
begin
  claims := event->'claims';
  -- MCP_SERVER_URL is the canonical resource URI; keep in sync with the env var.
  claims := jsonb_set(claims, '{aud}', to_jsonb('https://<app>.vercel.app/api/mcp'::text));
  -- ensure the read scope is present
  if claims ? 'scope' then
    null;
  else
    claims := jsonb_set(claims, '{scope}', to_jsonb('mcp:read'::text));
  end if;
  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$$;

-- grant + enable per Supabase auth-hook docs:
grant execute on function public.mcp_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.mcp_access_token_hook(jsonb) from authenticated, anon, public;
```

> Note: the literal MCP URI in the hook must match `MCP_SERVER_URL`. If multiple deployments share one Supabase project, read it from a config table instead of a literal.

---

## 6. Token verification (`lib/auth/verifyToken.ts`)

```ts
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { sha256Hex } from './staticTokens';
import { admin } from '../supabase/admin';

const JWKS = createRemoteJWKSet(new URL(process.env.SUPABASE_JWKS_URL!));
const RESOURCE = process.env.MCP_SERVER_URL!;          // canonical aud
const ISSUER = process.env.OAUTH_ISSUER!;              // Supabase AS issuer
const PREFIX = process.env.BEARER_TOKEN_PREFIX ?? 'yfmcp_';

export async function verifyToken(
  _req: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;

  // (1) Static bearer path — opaque, hashed, revocable.
  if (bearerToken.startsWith(PREFIX)) {
    const hash = sha256Hex(bearerToken);             // pepper applied inside
    const { data } = await admin
      .from('mcp_bearer_tokens')
      .select('user_id, scopes, revoked_at, expires_at')
      .eq('token_hash', hash)
      .maybeSingle();
    if (!data || data.revoked_at) return undefined;
    if (data.expires_at && new Date(data.expires_at) < new Date()) return undefined;
    // fire-and-forget last_used_at update (no await blocking the request)
    void admin.from('mcp_bearer_tokens').update({ last_used_at: new Date().toISOString() }).eq('token_hash', hash);
    return {
      token: bearerToken,
      clientId: 'static',
      scopes: data.scopes ?? ['mcp:read'],
      extra: { userId: data.user_id },
    };
  }

  // (2) OAuth JWT path — verify signature, issuer, audience, expiry.
  try {
    const { payload } = await jwtVerify(bearerToken, JWKS, {
      issuer: ISSUER,
      audience: RESOURCE,                              // RFC 8707 audience binding
    });
    const scopes = String(payload.scope ?? '').split(' ').filter(Boolean);
    return {
      token: bearerToken,
      clientId: String(payload.client_id ?? payload.azp ?? 'oauth'),
      scopes: scopes.length ? scopes : ['mcp:read'],
      expiresAt: payload.exp,
      extra: { userId: String(payload.sub) },
    };
  } catch {
    return undefined;                                 // -> mcp-handler emits 401 challenge
  }
}
```

Inside a tool, identity is read via `extra.authInfo?.extra?.userId`. The MCP server **never** uses this to authenticate to Yahoo — Yahoo is called anonymously.

Static-token mint (`lib/auth/staticTokens.ts`): generate 32 random bytes → `yfmcp_` + base62; show plaintext once; store `sha256Hex(pepper + plaintext)`; return `{ id, prefix }`.

---

## 7. Claude vs ChatGPT compatibility matrix

| Capability | **Claude.ai** (web custom connector) | **ChatGPT** (dev mode / Desktop / Cursor / Cline) |
|---|---|---|
| No-auth allowed | Yes (authless connectors; Free=1) | Yes, but only read-only / non-user-specific |
| OAuth required | Optional (only for per-user data) | Required for authenticated path |
| OAuth profile | Auth Code + **PKCE S256** | Auth Code + **PKCE S256** |
| Client registration | DCR (RFC 7591) ✓ or CIMD (preferred) or Anthropic-held | CIMD (strongly preferred) or DCR |
| **User-pasted static bearer** | **NO** (web connector; `static_bearer` "not yet supported") | **YES** in dev-mode/Desktop/Cursor/Cline (NOT chatgpt.com web) |
| PRM discovery (RFC 9728) | Required (well-known + 401 hint) | Required (well-known + 401 hint) |
| AS metadata (RFC 8414/OIDC) | Required | Required |
| mTLS client cert | Not required | Presents OpenAI-managed cert (SAN `mtls.prod.connectors.openai.com`); terminated at Vercel edge — see risk |
| search+fetch tool contract | Ignored (harmless) | **Required** for deep-research/company-knowledge surface |

**Our coverage:** We serve OAuth 2.1 + DCR + PRM/AS discovery (Claude web works), AND issue static bearers (ChatGPT-dev/Desktop/Cursor/curl work), AND expose `search`+`fetch` (ChatGPT deep-research works). Claude ignores the static tokens and the search/fetch shim — no conflict.

---

## 8. Security gotchas enforced

1. **Audience validation is load-bearing** — reject wrong-`aud` tokens (401). Most-skipped step; the Custom Access Token Hook makes it pass for legit tokens.
2. **No token passthrough** — never forward the client bearer to Yahoo (confused-deputy). Yahoo gets no per-user credential.
3. **PKCE S256 only** — reject `plain` (AS-side; verify in E2E).
4. **PRM `resource` == connector URL exactly** — avoids the 2026 "OAuth completes but Bearer not sent" bug.
5. **Issuer consistency** — `OAUTH_ISSUER` must equal AS metadata `issuer` and the JWT `iss`.
6. **Static tokens hashed at rest** (+ pepper), revocable, optional expiry; plaintext shown once.
7. **No tokens in URI query** — header only (`bearer_methods_supported: ["header"]`).
8. **Service-role key server-only** — used solely in `lib/supabase/admin.ts` on the Function; never shipped to the browser.

---

## 9. Open risk to verify in build (not a blocker to planning)
- **ChatGPT mTLS at Vercel:** OpenAI presents a managed client cert. Vercel terminates TLS and does not, by default, require/validate a client cert — so the connection should succeed, but ChatGPT-side enforcement of *its own* cert chain is what matters, not ours. If ChatGPT refuses to connect, this is the first thing to test empirically (E2E A9). Documented as a risk, not a build task.
- **Supabase OAuth server is public beta** — confirm DCR endpoint path and the access-token-hook config surface against live Supabase docs during Phase 0; adjust endpoint literals if Supabase paths differ.
