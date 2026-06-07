import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Server-side, RLS-scoped Supabase client bound to the Next.js request cookies.
 *
 * Used by the dashboard server component and server actions so every query runs
 * as the signed-in user (`auth.uid()`), letting the `mcp_bearer_tokens` RLS
 * policies enforce per-user ownership. No service-role key is involved.
 *
 * Env is read lazily (inside the function) so `next build` succeeds without the
 * variables — a missing var only fails at request time.
 *
 * In Next.js 16 `cookies()` is async; we await it here. `setAll` is wrapped in a
 * try/catch because it throws when called during a Server Component render (you
 * can only set cookies in a Server Action or Route Handler). Session refresh
 * cookie writes that happen during render are then safely ignored.
 */
export async function createClient(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  }
  if (!anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set");
  }

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(
        cookiesToSet: { name: string; value: string; options: CookieOptions }[],
      ) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component render where cookies are read-only.
          // Safe to ignore: session refresh is handled in route handlers /
          // server actions where setAll succeeds.
        }
      },
    },
  });
}
