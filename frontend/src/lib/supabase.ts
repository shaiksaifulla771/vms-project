import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// createClient() throws synchronously on a missing/invalid URL. This module
// is imported transitively from main.tsx, so an unguarded throw here would
// take down the entire React mount before anything renders — a blank white
// screen with nothing but a console error on a fresh checkout that hasn't
// created frontend/.env yet.
export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured ? createClient(url, anonKey) : null;

if (!isSupabaseConfigured) {
  // eslint-disable-next-line no-console
  console.error(
    "Supabase is not configured: copy frontend/.env.example to frontend/.env and set " +
      "VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Auth is disabled until then.",
  );
}
