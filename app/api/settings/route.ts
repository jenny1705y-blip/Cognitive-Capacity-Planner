import { getUserFromRequest, jsonError } from "@/lib/api";

export async function GET(request: Request) {
  const { error, user, token } = await getUserFromRequest(request);
  if (error || !user || !token) return jsonError(error ?? "Unauthorized", 401);

  const { createRequestSupabase } = await import("@/lib/supabase-admin");
  const supabase = createRequestSupabase(token);
  const { data } = await supabase.from("user_settings").select("*").eq("user_id", user.id).single();

  return Response.json({
    settings: data ?? {
      chronotype: "neutral",
      caffeine_sensitivity: 1,
      circadian_peak_hour: 17
    }
  });
}

export async function POST(request: Request) {
  const { error, user, token } = await getUserFromRequest(request);
  if (error || !user || !token) return jsonError(error ?? "Unauthorized", 401);

  const body = await request.json();
  const { createRequestSupabase } = await import("@/lib/supabase-admin");
  const supabase = createRequestSupabase(token);

  const { data, error: writeError } = await supabase
    .from("user_settings")
    .upsert({
      user_id: user.id,
      chronotype: body.chronotype ?? "neutral",
      caffeine_sensitivity: body.caffeine_sensitivity ?? 1,
      circadian_peak_hour: body.circadian_peak_hour ?? 17,
      updated_at: new Date().toISOString()
    })
    .select()
    .single();

  if (writeError) return jsonError(writeError.message, 400);
  return Response.json({ settings: data });
}
