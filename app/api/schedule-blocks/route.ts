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
  const seen = new Set<string>();
  const scheduleBlocks = (data ?? []).filter((block) => {
    const key =
      block.google_event_id ??
      `${block.task_id ?? ""}|${block.title}|${block.start_at}|${block.end_at}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return Response.json({ scheduleBlocks });
}
