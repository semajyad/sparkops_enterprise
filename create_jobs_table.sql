-- Create jobs table (mirror of job_drafts structure)
CREATE TABLE IF NOT EXISTS public.jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  title TEXT,
  location TEXT,
  address TEXT,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  assigned_to_user_id UUID,
  required_trade TEXT,
  scheduled_date TIMESTAMP WITH TIME ZONE,
  customer_email TEXT,
  customer_mobile TEXT,
  status TEXT DEFAULT 'DRAFT',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own jobs" ON public.jobs
    FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can update their own jobs" ON public.jobs
    FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can insert their own jobs" ON public.jobs
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own jobs" ON public.jobs
    FOR DELETE
    USING (user_id = auth.uid());

-- Grant permissions
GRANT ALL ON public.jobs TO authenticated;
GRANT SELECT ON public.jobs TO anon;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON public.jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON public.jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_scheduled_date ON public.jobs(scheduled_date);
