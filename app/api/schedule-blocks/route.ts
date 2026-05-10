import { getUserFromRequest, jsonError } from "@/lib/api";
import { createRequestSupabase } from "@/lib/supabase-admin";

export async function GET(request: Request) {
  const { error, user, token } = await getUserFromRequest(request);
  if (error || !user || !token) return jsonError(error ?? "Unauthorized", 401);

  const supabase = createRequestSupabase(token);
  const { data, error: readError } = await supabase
    .from("schedule_blocks")
    .select("*")
    .eq("user_id", user.id)
    .order("start_at", { ascending: true })
    .limit(30);

  if (readError) return jsonError(readError.message, 400);
  return Response.json({ scheduleBlocks: data ?? [] });
}
