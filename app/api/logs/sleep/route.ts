import { getUserFromRequest, jsonError } from "@/lib/api";
import { createRequestSupabase } from "@/lib/supabase-admin";

export async function GET(request: Request) {
  const { error, user, token } = await getUserFromRequest(request);
  if (error || !user || !token) return jsonError(error ?? "Unauthorized", 401);

  const supabase = createRequestSupabase(token);
  const { data, error: readError } = await supabase
    .from("sleep_logs")
    .select("*")
    .eq("user_id", user.id)
    .order("sleep_end", { ascending: false })
    .limit(20);

  if (readError) return jsonError(readError.message, 400);
  return Response.json({ sleepLogs: data ?? [] });
}

export async function POST(request: Request) {
  const { error, user, token } = await getUserFromRequest(request);
  if (error || !user || !token) return jsonError(error ?? "Unauthorized", 401);

  const body = await request.json();
  const supabase = createRequestSupabase(token);
  const { data, error: writeError } = await supabase
    .from("sleep_logs")
    .insert({ ...body, user_id: user.id })
    .select()
    .single();

  if (writeError) return jsonError(writeError.message, 400);
  return Response.json({ sleepLog: data });
}

export async function PATCH(request: Request) {
  const { error, user, token } = await getUserFromRequest(request);
  if (error || !user || !token) return jsonError(error ?? "Unauthorized", 401);

  const body = await request.json();
  if (!body.id) return jsonError("Missing sleep log id.", 400);

  const supabase = createRequestSupabase(token);
  const { data, error: writeError } = await supabase
    .from("sleep_logs")
    .update({
      sleep_start: body.sleep_start,
      sleep_end: body.sleep_end,
      quality: body.quality ?? null,
      notes: body.notes ?? null
    })
    .eq("id", body.id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (writeError) return jsonError(writeError.message, 400);
  return Response.json({ sleepLog: data });
}

export async function DELETE(request: Request) {
  const { error, user, token } = await getUserFromRequest(request);
  if (error || !user || !token) return jsonError(error ?? "Unauthorized", 401);

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return jsonError("Missing sleep log id.", 400);

  const supabase = createRequestSupabase(token);
  const { error: deleteError } = await supabase.from("sleep_logs").delete().eq("id", id).eq("user_id", user.id);

  if (deleteError) return jsonError(deleteError.message, 400);
  return Response.json({ ok: true });
}
