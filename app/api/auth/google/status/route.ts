import { getUserFromRequest, jsonError } from "@/lib/api";
import { hasRequiredGoogleCalendarScopes, refreshGoogleAccessToken } from "@/lib/google-oauth";
import { createAdminSupabase } from "@/lib/supabase-admin";

export async function GET(request: Request) {
  const { error, user } = await getUserFromRequest(request);
  if (error || !user) return jsonError(error ?? "Unauthorized", 401);

  const supabase = createAdminSupabase();
  const { data, error: readError } = await supabase
    .from("google_oauth_tokens")
    .select("google_email, refresh_token, scope")
    .eq("user_id", user.id)
    .maybeSingle();

  if (readError) return jsonError(readError.message, 400);

  const hasToken = Boolean(data?.refresh_token);
  const hasCalendarScopes = hasRequiredGoogleCalendarScopes(data?.scope);
  let tokenRefreshable = hasToken && hasCalendarScopes;

  if (tokenRefreshable) {
    try {
      await refreshGoogleAccessToken(user.id);
    } catch {
      tokenRefreshable = false;
    }
  }

  return Response.json({
    connected: tokenRefreshable,
    googleEmail: data?.google_email ?? null,
    needsReconnect: hasToken && !tokenRefreshable
  });
}
