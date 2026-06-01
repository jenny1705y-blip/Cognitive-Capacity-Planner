import { createClient, type SupabaseClient } from "@supabase/supabase-js";

declare global {
  var __plannerSupabase: SupabaseClient | undefined;
}

export function createBrowserSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Missing Supabase browser environment variables.");
  }

  if (globalThis.__plannerSupabase) return globalThis.__plannerSupabase;

  globalThis.__plannerSupabase = createClient(url, anonKey);
  return globalThis.__plannerSupabase;
}
