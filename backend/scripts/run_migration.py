#!/usr/bin/env python3
"""Run database migrations against Supabase"""

import os
import psycopg
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def run_migration():
    """Run the migration to add full_name column"""
    
    # Get database URL from environment or construct it
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        # Construct from individual components
        supabase_url = os.getenv("SUPABASE_URL")
        if supabase_url and "your-project" not in supabase_url:
            # Extract project info from Supabase URL
            project_ref = supabase_url.replace("https://", "").replace(".supabase.co", "")
            db_url = f"postgresql://postgres.mpdvcydpiatasvreqlvx:Samdoggy122!@aws-1-ap-south-1.pooler.supabase.com:6543/postgres"
        else:
            raise ValueError("DATABASE_URL or valid SUPABASE_URL not found")
    
    print(f"Connecting to database: {db_url}")
    
    try:
        with psycopg.connect(db_url) as conn:
            with conn.cursor() as cur:
                # Run the migration
                print("Running migration 002_add_full_name_to_profiles.sql...")
                
                # Add full_name column
                cur.execute("""
                    ALTER TABLE public.profiles 
                    ADD COLUMN IF NOT EXISTS full_name TEXT
                """)
                print("✓ Added full_name column to profiles table")
                
                # Update the trigger
                cur.execute("""
                    CREATE OR REPLACE FUNCTION public.handle_new_user()
                    RETURNS TRIGGER
                    LANGUAGE plpgsql
                    SECURITY DEFINER
                    SET search_path = public
                    AS $$
                    BEGIN
                      INSERT INTO public.profiles (id, email, full_name)
                      VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name')
                      ON CONFLICT (id) DO NOTHING;
                      RETURN NEW;
                    END;
                    $$;
                """)
                print("✓ Updated handle_new_user trigger")
                
                conn.commit()
                print("✅ Migration completed successfully!")
                
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        raise

if __name__ == "__main__":
    run_migration()