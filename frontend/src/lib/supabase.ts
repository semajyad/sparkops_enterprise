import { createClient } from '@supabase/supabase-js';

// 1. HARDCODED KEYS (TRUTH SOURCE)
const SUPABASE_URL = "https://mpdvcydpiatasvreqlvx.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wZHZjeWRwaWF0YXN2cmVxbHZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1ODA3MTIsImV4cCI6MjA4ODE1NjcxMn0.V2g1_2A1C14kbO7zW3oTss_sswGtP4A9LOEtXBRPxwg";

// 2. Create "Dumb" Client (No Cookies, No Magic)
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true, // Use LocalStorage instead of Cookies
    autoRefreshToken: true,
  }
});

// 3. Helper for consistency (Optional shim)
export const createClientComponentClient = () => supabase;
