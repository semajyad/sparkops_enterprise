import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

// HARDCODED UNBLOCK - REVERT TO ENV VARS LATER
const FORCE_URL = "https://mpdvcydpiatasvreqlvx.supabase.co";
const FORCE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wZHZjeWRwaWF0YXN2cmVxbHZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1ODA3MTIsImV4cCI6MjA4ODE1NjcxMn0.V2g1_2A1C14kbO7zW3oTss_sswGtP4A9LOEtXBRPxwg";

export const createClient = () => {
  console.log("⚠️ Using Hardcoded Supabase Credentials");
  return createClientComponentClient({
    supabaseUrl: FORCE_URL,
    supabaseKey: FORCE_KEY,
  });
};
