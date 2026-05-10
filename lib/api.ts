import { createRequestSupabase } from "@/lib/supabase-admin";

export function getBearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const [, token] = header.match(/^Bearer\s+(.+)$/i) ?? [];
  return token;
}

export async function getUserFromRequest(request: Request) {
  const token = getBearerToken(request);
  if (!token) {
    return { error: "Missing authorization token.", token: null, user: null };
  }

  const supabase = createRequestSupabase(token);
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return { error: error?.message ?? "Invalid authorization token.", token, user: null };
  }

  return { error: null, token, user: data.user };
}

export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}
