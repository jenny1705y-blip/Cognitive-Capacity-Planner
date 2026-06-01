import { getUserFromRequest, jsonError } from "@/lib/api";
import { refreshGoogleAccessToken } from "@/lib/google-oauth";
import { runCalendarTaskGenerationAgent } from "@/lib/openai-agent";
import { createAdminSupabase } from "@/lib/supabase-admin";
import type { Difficulty, StudyTask } from "@/lib/types";

function taskKey(title: string) {
  return title.trim().toLowerCase();
}

function validDifficulty(value: unknown): Difficulty {
  return value === "low" || value === "high" ? value : "medium";
}

export async function POST(request: Request) {
  const { error, user } = await getUserFromRequest(request);
  if (error || !user) return jsonError(error ?? "Unauthorized", 401);

  const body = await request.json();
  const timezone = body.timezone ?? "America/New_York";
  const supabase = createAdminSupabase();
  const { data: existingRows, error: readError } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", user.id)
    .neq("status", "archived");

  if (readError) return jsonError(readError.message, 400);

  try {
    const googleAccessToken = await refreshGoogleAccessToken(user.id);
    const result = await runCalendarTaskGenerationAgent({
      googleAccessToken,
      timezone,
      existingTasks: (existingRows ?? []) as StudyTask[]
    });
    const seen = new Set((existingRows ?? []).map((task) => taskKey(task.title)));
    const generatedTasks = result.tasks
      .map(
        (task: {
          title?: unknown;
          description?: unknown;
          difficulty?: unknown;
          estimated_minutes?: unknown;
          due_at?: unknown;
        }) => ({
          user_id: user.id,
          title: typeof task.title === "string" ? task.title.trim().slice(0, 140) : "",
          description: typeof task.description === "string" ? task.description.trim().slice(0, 500) : null,
          difficulty: validDifficulty(task.difficulty),
          estimated_minutes:
            typeof task.estimated_minutes === "number"
              ? Math.max(15, Math.min(240, Math.round(task.estimated_minutes)))
              : 60,
          due_at: typeof task.due_at === "string" && !Number.isNaN(new Date(task.due_at).getTime()) ? task.due_at : null,
          status: "unscheduled",
          source: "ai"
        })
      )
      .filter((task: { title: string }) => {
        const key = taskKey(task.title);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    if (generatedTasks.length === 0) {
      return Response.json({
        explanation: result.explanation,
        tasks: []
      });
    }

    const { data: savedTasks, error: insertError } = await supabase.from("tasks").insert(generatedTasks).select();
    if (insertError) throw new Error(insertError.message);

    return Response.json({
      explanation: result.explanation,
      tasks: savedTasks ?? []
    });
  } catch (generationError) {
    const message = generationError instanceof Error ? generationError.message : "Calendar task generation failed.";
    return jsonError(message, 500);
  }
}
