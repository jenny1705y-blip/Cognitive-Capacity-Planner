import { getUserFromRequest, jsonError } from "@/lib/api";
import { fetchUpcomingGoogleEvents, refreshGoogleAccessToken } from "@/lib/google-oauth";
import { runCalendarTaskGenerationAgent } from "@/lib/openai-agent";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { encodeCalendarTaskProvenance } from "@/lib/task-provenance";
import type { Difficulty, StudyTask } from "@/lib/types";

function taskKey(title: string) {
  return title.trim().toLowerCase();
}

function validDifficulty(value: unknown): Difficulty {
  return value === "low" || value === "high" ? value : "medium";
}

function isAcademicSourceEvent(event: { title: string; description: string }) {
  const text = `${event.title} ${event.description}`.replace(/<[^>]*>/g, " ").toLowerCase();
  if (/(busy-only|do not generate|unrelated to study tasks|constraint only)/.test(text)) return false;

  return /(exam|unit test|test\b|quiz|assessment|assignment|deadline|homework|project due|paper due|study session|lab assessment)/.test(text);
}

export async function POST(request: Request) {
  const { error, user } = await getUserFromRequest(request);
  if (error || !user) return jsonError(error ?? "Unauthorized", 401);

  const body = await request.json();
  const timezone = body.timezone ?? "America/New_York";
  const requestedStart = new Date(body.startIso ?? "");
  const calendarStart = Number.isNaN(requestedStart.getTime()) ? new Date() : requestedStart;
  const supabase = createAdminSupabase();
  const { data: existingRows, error: readError } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", user.id)
    .neq("status", "archived");

  if (readError) return jsonError(readError.message, 400);

  try {
    const googleAccessToken = await refreshGoogleAccessToken(user.id);
    const calendarEnd = new Date(calendarStart.getTime() + 14 * 24 * 60 * 60 * 1000);
    const calendarEvents = await fetchUpcomingGoogleEvents(googleAccessToken, calendarStart, calendarEnd);
    const academicEvents = calendarEvents.filter(isAcademicSourceEvent);
    const result = await runCalendarTaskGenerationAgent({
      timezone,
      existingTasks: (existingRows ?? []) as StudyTask[],
      calendarEvents: academicEvents
    });
    const seen = new Set((existingRows ?? []).map((task) => taskKey(task.title)));
    const generatedTasks = (result.tasks as Array<{
      title?: unknown;
      description?: unknown;
      difficulty?: unknown;
      estimated_minutes?: unknown;
      due_at?: unknown;
      source_event_title?: unknown;
      source_event_at?: unknown;
      source_event_id?: unknown;
    }>)
      .map(
        (task: {
          title?: unknown;
          description?: unknown;
          difficulty?: unknown;
          estimated_minutes?: unknown;
          due_at?: unknown;
          source_event_title?: unknown;
          source_event_at?: unknown;
          source_event_id?: unknown;
        }) => ({
          user_id: user.id,
          title: typeof task.title === "string" ? task.title.trim().slice(0, 140) : "",
          description: encodeCalendarTaskProvenance({
            calendarEventTitle:
              typeof task.source_event_title === "string" && task.source_event_title.trim()
                ? task.source_event_title.trim().slice(0, 180)
                : "Upcoming calendar event",
            calendarEventAt:
              typeof task.source_event_at === "string" && !Number.isNaN(new Date(task.source_event_at).getTime())
                ? task.source_event_at
                : null,
            calendarEventId: typeof task.source_event_id === "string" ? task.source_event_id : null,
            reason: typeof task.description === "string" ? task.description.trim().slice(0, 500) : "Preparation inferred from Google Calendar."
          }),
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
        explanation:
          academicEvents.length === 0
            ? "No upcoming exams, assessments, assignments, or deadlines were found in Google Calendar."
            : result.explanation,
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
