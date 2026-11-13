import { callRpc, readBody, withPlayer } from "@/lib/multiplayer/http";
import type { SupabaseClient } from "@supabase/supabase-js";

async function withCountry(admin: SupabaseClient, userId: string, profile: Awaited<ReturnType<typeof callRpc>>) {
  if (!profile.ok) return profile;
  const { data, error } = await admin.from("player_profiles").select("country_code").eq("id", userId).single();
  if (error) return { ok: false, error: "try_again" };
  return { ...profile, profile: { ...profile.profile as object, countryCode: data.country_code } };
}

// Legacy guests may read their profile and claim a username: both are steps
// of upgrading a guest to a permanent account.
export function GET(request: Request) {
  return withPlayer(request, async (userId, admin) => withCountry(admin, userId,
    await callRpc(admin, "get_profile", { p_user: userId })), {
    allowAnonymous: true,
  });
}

/** `{ username }`: claim or change the username. */
export function POST(request: Request) {
  return withPlayer(
    request,
    async (userId, admin) => {
      const { username } = await readBody(request);
      if (typeof username !== "string") return { ok: false, error: "invalid_username" };
      return withCountry(admin, userId, await callRpc(admin, "set_username", { p_user: userId, p_username: username }));
    },
    { allowAnonymous: true },
  );
}
