import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client built from the publishable (anon) key.
 * (Not importing the `server-only` marker package since it is not a
 * dependency here; this module is only ever imported from server code and
 * reads `SUPABASE_ANON_KEY`, which is not exposed to the browser.)
 *
 * Used by `verifyToken` to call the `verify_bearer_token` SECURITY DEFINER
 * RPC. No service-role key is used anywhere — the RPC runs with definer
 * privileges and returns rows only for valid, unrevoked, unexpired tokens.
 *
 * Env is read lazily (inside the function), so `next build` succeeds even
 * when the variables are absent; a missing var only fails at request time.
 */

let cached: SupabaseClient | undefined;

export function getAnonClient(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  }
  if (!anonKey) {
    throw new Error("SUPABASE_ANON_KEY is not set");
  }

  cached = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return cached;
}
