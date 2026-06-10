import { getUserFromRequest, jsonError } from "@/lib/api";
import { createRequestSupabase } from "@/lib/supabase-admin";

export async function GET(request: Request) {
  const { error, user, token } = await getUserFromRequest(request);
  if (error || !user || !token) return jsonError(error ?? "Unauthorized", 401);

  const supabase = createRequestSupabase(token);
  const { data, error: readError } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", user.id)
    .neq("status", "archived")
    .order("created_at", { ascending: false });

  if (readError) return jsonError(readError.message, 400);
  return Response.json({ tasks: data ?? [] });
}

export async function POST(request: Request) {
  const { error, user, token } = await getUserFromRequest(request);
  if (error || !user || !token) return jsonError(error ?? "Unauthorized", 401);

  const body = await request.json();
  const supabase = createRequestSupabase(token);
  const { data, error: writeError } = await supabase
    .from("tasks")
    .insert({ ...body, user_id: user.id })
    .select()
    .single();

  if (writeError) return jsonError(writeError.message, 400);
  return Response.json({ task: data });
}

export async function PATCH(request: Request) {
  const { error, user, token } = await getUserFromRequest(request);
  if (error || !user || !token) return jsonError(error ?? "Unauthorized", 401);

  const body = await request.json();
  const { id, title, description, difficulty, estimated_minutes, due_at, status, source } = body;
  if (!id) return jsonError("Missing task id.", 400);

  const updates: Record<string, unknown> = {};
  if (typeof title === "string") updates.title = title.trim().slice(0, 140);
  if (typeof description === "string" || description === null) updates.description = description;
  if (difficulty === "low" || difficulty === "medium" || difficulty === "high") updates.difficulty = difficulty;
  if (typeof estimated_minutes === "number") updates.estimated_minutes = Math.max(15, Math.min(240, Math.round(estimated_minutes)));
  if (typeof due_at === "string" || due_at === null) updates.due_at = due_at;
  if (status === "unscheduled" || status === "scheduled" || status === "completed" || status === "archived") updates.status = status;
  if (source === "manual" || source === "google_calendar" || source === "ai") updates.source = source;

  if (Object.keys(updates).length === 0) return jsonError("No supported task fields to update.", 400);

  const supabase = createRequestSupabase(token);
  const { data, error: updateError } = await supabase
    .from("tasks")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (updateError) return jsonError(updateError.message, 400);
  return Response.json({ task: data });
}

export async function DELETE(request: Request) {
  const { error, user, token } = await getUserFromRequest(request);
  if (error || !user || !token) return jsonError(error ?? "Unauthorized", 401);

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return jsonError("Missing task id.", 400);

  const supabase = createRequestSupabase(token);
  const { error: deleteError } = await supabase.from("tasks").delete().eq("id", id).eq("user_id", user.id);

  if (deleteError) return jsonError(deleteError.message, 400);
  return Response.json({ ok: true });
}
