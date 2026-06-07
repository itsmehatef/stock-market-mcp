import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Supabase auth callback.
 *
 * The magic-link / OTP flow redirects back here with a `?code=...` (PKCE auth
 * code). We exchange it for a session — which writes the auth cookies via the
 * cookie-bound server client — then redirect to the dashboard.
 *
 * Env is read lazily inside `createClient`, so this route compiles at build
 * time without the Supabase variables present.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Only allow same-origin, app-relative redirect targets. `next` comes from the
 * (attacker-controllable) callback query string, so anything that could escape
 * the origin — absolute URLs, protocol-relative `//host`, or backslash-escaped
 * `/\host` (which browsers normalize to `//host`) — is rejected and falls back
 * to the dashboard. This closes the open-redirect.
 */
function safeNext(raw: string | null): string {
  if (!raw) return "/dashboard";
  if (!raw.startsWith("/")) return "/dashboard"; // must be path-absolute
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/dashboard";
  return raw;
}

export async function GET(request: Request): Promise<Response> {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // No code, or the exchange failed — bounce back to the dashboard sign-in.
  return NextResponse.redirect(`${origin}/dashboard?error=auth`);
}
