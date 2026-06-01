import { getUserFromRequest, jsonError } from "@/lib/api";
import { refreshGoogleAccessToken } from "@/lib/google-oauth";
import { runSchedulingAgent } from "@/lib/openai-agent";
import { createAdminSupabase } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  const { error, user } = await getUserFromRequest(request);
  if (error || !user) return jsonError(error ?? "Unauthorized", 401);

  const body = await request.json();
  const tasks = body.tasks ?? [];
  const curve = body.curve ?? [];
  const startIso = body.startIso ?? new Date().toISOString();
  const timezone = body.timezone ?? "America/New_York";

  if (!Array.isArray(tasks) || !Array.isArray(curve)) {
    return jsonError("Missing tasks or capacity curve.", 400);
  }

  try {
    const googleAccessToken = await refreshGoogleAccessToken(user.id);
    const result = await runSchedulingAgent({ googleAccessToken, tasks, curve, startIso, timezone });

    const blocks: Array<{
      user_id: string;
      task_id: string | null;
      title: string;
      start_at: string;
      end_at: string;
      capacity_score: number | null;
      google_event_id: string | null;
      created_by: "ai";
    }> = result.blocks.map(
      (block: {
        task_id?: string | null;
        title: string;
        start_at: string;
        end_at: string;
        capacity_score?: number | null;
        google_event_id?: string | null;
      }) => ({
        user_id: user.id,
        task_id: block.task_id ?? null,
        title: block.title,
        start_at: block.start_at,
        end_at: block.end_at,
        capacity_score: block.capacity_score ?? null,
        google_event_id: block.google_event_id ?? null,
        created_by: "ai"
      })
    );
    const seen = new Set<string>();
    const uniqueBlocks = blocks.filter((block) => {
      const key =
        block.google_event_id ??
        `${block.task_id ?? ""}|${block.title}|${block.start_at}|${block.end_at}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const supabase = createAdminSupabase();
    const { error: deleteError } = await supabase
      .from("schedule_blocks")
      .delete()
      .eq("user_id", user.id)
      .eq("created_by", "ai");
    if (deleteError) throw new Error(deleteError.message);

    if (uniqueBlocks.length > 0) {
      const { error: insertError } = await supabase.from("schedule_blocks").insert(uniqueBlocks);
      if (insertError) throw new Error(insertError.message);
    }

    await supabase.from("agent_runs").insert({
      user_id: user.id,
      prompt: "schedule_next_24_hours",
      result: { ...result, blocks: uniqueBlocks }
    });

    return Response.json({ ...result, blocks: uniqueBlocks });
  } catch (scheduleError) {
    const message = scheduleError instanceof Error ? scheduleError.message : "Scheduling failed.";
    return jsonError(message, 500);
  }
}
