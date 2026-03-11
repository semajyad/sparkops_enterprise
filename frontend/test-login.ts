import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://mpdvcydpiatasvreqlvx.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wZHZjeWRwaWF0YXN2cmVxbHZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1ODA3MTIsImV4cCI6MjA4ODE1NjcxMn0.V2g1_2A1C14kbO7zW3oTss_sswGtP4A9LOEtXBRRPxwg'
);

async function main() {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'jimmybobday@gmail.com',
    password: 'Samdoggy1!'
  });
  console.log(data, error);
}

main();

