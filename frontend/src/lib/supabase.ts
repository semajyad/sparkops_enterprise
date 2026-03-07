import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (typeof window !== "undefined") {
  console.log("Supabase Config Check:");
  console.log("- URL Exists:", !!supabaseUrl);
  console.log("- Key Exists:", !!supabaseKey);
  console.log("- Key Prefix:", supabaseKey ? `${supabaseKey.substring(0, 5)}...` : "NONE");
}

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase Environment Variables");
}

export const supabase = createClient(supabaseUrl, supabaseKey);
