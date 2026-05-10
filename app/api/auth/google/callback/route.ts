import { createAdminSupabase } from "@/lib/supabase-admin";
import { exchangeGoogleCode, fetchGoogleProfile } from "@/lib/google-oauth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const userId = url.searchParams.get("state");
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";

  if (!code || !userId) {
    return Response.redirect(`${appUrl}/?google=error`);
  }

  try {
    const tokens = await exchangeGoogleCode(code);
    const profile = await fetchGoogleProfile(tokens.access_token);
    const supabase = createAdminSupabase();

    await supabase.from("google_oauth_tokens").upsert({
      user_id: userId,
      google_email: profile?.email ?? null,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
      scope: tokens.scope ?? null,
      updated_at: new Date().toISOString()
    });

    return Response.redirect(`${appUrl}/?google=connected`);
  } catch (error) {
    console.error(error);
    return Response.redirect(`${appUrl}/?google=error`);
  }
}
