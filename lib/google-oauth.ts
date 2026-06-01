import { createAdminSupabase } from "@/lib/supabase-admin";

const GOOGLE_CALENDAR_EVENTS_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const GOOGLE_CALENDAR_FREEBUSY_SCOPE = "https://www.googleapis.com/auth/calendar.freebusy";

type GoogleTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  id_token?: string;
};

export function hasRequiredGoogleCalendarScopes(scope?: string | null) {
  const scopes = new Set((scope ?? "").split(" ").filter(Boolean));
  return scopes.has(GOOGLE_CALENDAR_EVENTS_SCOPE) && scopes.has(GOOGLE_CALENDAR_FREEBUSY_SCOPE);
}

export function googleAuthUrl(userId: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    throw new Error("Missing Google OAuth environment variables.");
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: userId,
    scope: `openid email profile ${GOOGLE_CALENDAR_EVENTS_SCOPE} ${GOOGLE_CALENDAR_FREEBUSY_SCOPE}`
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGoogleCode(code: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Missing Google OAuth environment variables.");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code"
    })
  });

  if (!response.ok) {
    throw new Error(`Google token exchange failed: ${await response.text()}`);
  }

  return (await response.json()) as GoogleTokenResponse;
}

export async function refreshGoogleAccessToken(userId: string) {
  const supabase = createAdminSupabase();
  const { data: tokenRow, error } = await supabase
    .from("google_oauth_tokens")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error || !tokenRow?.refresh_token) {
    throw new Error("Google Calendar is not connected yet.");
  }
  if (!hasRequiredGoogleCalendarScopes(tokenRow.scope)) {
    throw new Error("Reconnect Google Calendar to grant event and availability access.");
  }

  const expiresAt = tokenRow.expires_at ? new Date(tokenRow.expires_at).getTime() : 0;
  if (tokenRow.access_token && expiresAt - Date.now() > 60_000) {
    return tokenRow.access_token as string;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Missing Google OAuth environment variables.");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: tokenRow.refresh_token,
      grant_type: "refresh_token"
    })
  });

  if (!response.ok) {
    throw new Error(`Google token refresh failed: ${await response.text()}`);
  }

  const refreshed = (await response.json()) as GoogleTokenResponse;
  const nextExpiresAt = new Date(Date.now() + (refreshed.expires_in ?? 3600) * 1000).toISOString();

  await supabase
    .from("google_oauth_tokens")
    .update({
      access_token: refreshed.access_token,
      expires_at: nextExpiresAt,
      scope: refreshed.scope ?? tokenRow.scope,
      updated_at: new Date().toISOString()
    })
    .eq("user_id", userId);

  return refreshed.access_token;
}

export async function fetchGoogleProfile(accessToken: string) {
  const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!response.ok) return null;
  return (await response.json()) as { email?: string };
}
