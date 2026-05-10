import { getUserFromRequest, jsonError } from "@/lib/api";
import { googleAuthUrl } from "@/lib/google-oauth";

export async function GET(request: Request) {
  const { error, user } = await getUserFromRequest(request);
  if (error || !user) return jsonError(error ?? "Unauthorized", 401);

  return Response.json({ url: googleAuthUrl(user.id) });
}
