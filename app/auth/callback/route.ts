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

export async function GET(request: Request): Promise<Response> {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

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
