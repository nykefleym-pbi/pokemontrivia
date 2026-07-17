// Shared CORS headers for every Edge Function invoked from the browser via
// supabase.functions.invoke(). Per Supabase's own CORS guide, the platform
// does NOT answer preflight OPTIONS requests on your behalf — each function
// must handle `OPTIONS` itself and echo these headers on every response, or
// the browser blocks the real request before it's ever sent.
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
