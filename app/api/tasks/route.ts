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
