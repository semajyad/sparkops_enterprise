-- Fix RLS policy for job_drafts table (main table)
-- Enable RLS on job_drafts table if not already enabled
ALTER TABLE public.job_drafts ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own job_drafts" ON public.job_drafts;
DROP POLICY IF EXISTS "Users can update their own job_drafts" ON public.job_drafts;
DROP POLICY IF EXISTS "Users can insert their own job_drafts" ON public.job_drafts;

-- Create comprehensive RLS policies for job_drafts
CREATE POLICY "Users can view their own job_drafts" ON public.job_drafts
    FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can update their own job_drafts" ON public.job_drafts
    FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can insert their own job_drafts" ON public.job_drafts
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- Add customer_email and customer_mobile columns to job_drafts table if not exists
ALTER TABLE public.job_drafts 
ADD COLUMN IF NOT EXISTS customer_email TEXT,
ADD COLUMN IF NOT EXISTS customer_mobile TEXT;

-- Grant necessary permissions
GRANT ALL ON public.job_drafts TO authenticated;
GRANT SELECT ON public.job_drafts TO anon;
