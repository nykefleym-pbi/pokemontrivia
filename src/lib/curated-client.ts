import { createClient } from "@supabase/supabase-js";

/**
 * Read-only Supabase client pointed at the external curated-questions project
 * (dvdorceiasaipdvyfhil). Kept separate from the Lovable Cloud-managed client
 * so it never collides with the main project's auth session storage.
 */
const url =
  import.meta.env.VITE_CURATED_SUPABASE_URL ??
  "https://dvdorceiasaipdvyfhil.supabase.co";
const key =
  import.meta.env.VITE_CURATED_SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_4xsV56UPyHng1xGrKAM8mQ_meXNg3sH";

export const curatedSupabase = createClient(url, key, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    storageKey: "curated-ro",
  },
});
