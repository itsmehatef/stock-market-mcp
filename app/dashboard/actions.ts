"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { generateToken, hashFor } from "@/lib/auth/staticTokens";

/**
 * Dashboard server actions: mint and revoke static bearer tokens.
 *
 * Both run with the user's RLS-scoped server client, so `auth.uid()` is the
 * signed-in user and the `mcp_bearer_tokens` RLS policies enforce ownership on
 * insert/update. We pass `user_id` explicitly (the policy's `with check`
 * requires `auth.uid() = user_id`).
 *
 * Mint generates a fresh plaintext, stores only its peppered hash, and surfaces
 * the plaintext to the UI exactly once via a redirect query param. The
 * dashboard renders it with a copy hint + "won't be shown again" warning and
 * the param is dropped on any subsequent navigation/refresh.
 */

async function requireUserClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/dashboard");
  }
  return { supabase, user };
}

export async function mintToken(formData: FormData): Promise<void> {
  const rawName = formData.get("name");
  const name =
    typeof rawName === "string" && rawName.trim().length > 0
      ? rawName.trim().slice(0, 80)
      : "default";

  const { supabase, user } = await requireUserClient();

  const { plaintext, prefix } = generateToken();
  const token_hash = hashFor(plaintext);

  const { error } = await supabase.from("mcp_bearer_tokens").insert({
    user_id: user.id,
    token_hash,
    token_prefix: prefix,
    name,
    scopes: ["mcp:read"],
  });

  if (error) {
    redirect(`/dashboard?error=${encodeURIComponent("mint_failed")}`);
  }

  revalidatePath("/dashboard");
  // Surface the plaintext exactly once via the redirect param.
  redirect(`/dashboard?token=${encodeURIComponent(plaintext)}`);
}

export async function revokeToken(formData: FormData): Promise<void> {
  const id = formData.get("id");
  if (typeof id !== "string" || id.length === 0) {
    redirect("/dashboard?error=revoke_failed");
  }

  const { supabase, user } = await requireUserClient();

  const { error } = await supabase
    .from("mcp_bearer_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .is("revoked_at", null);

  if (error) {
    redirect("/dashboard?error=revoke_failed");
  }

  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/dashboard");
  redirect("/dashboard");
}
