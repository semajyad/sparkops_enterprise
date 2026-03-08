-- Sprint 4: Safety test evidence + compliance/certificate metadata
-- AS/NZS 3000 liability-shield schema additions

ALTER TABLE IF EXISTS public.job_drafts
  ADD COLUMN IF NOT EXISTS client_email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS compliance_status VARCHAR(32),
  ADD COLUMN IF NOT EXISTS certificate_pdf_url VARCHAR(1000),
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.safety_tests (
  id UUID PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.job_drafts(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  user_id UUID NOT NULL,
  test_type VARCHAR(64) NOT NULL,
  value_text VARCHAR(64),
  unit VARCHAR(32),
  result VARCHAR(16),
  gps_lat NUMERIC(9,6),
  gps_lng NUMERIC(9,6),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_safety_tests_job_id ON public.safety_tests(job_id);
CREATE INDEX IF NOT EXISTS idx_safety_tests_org_id ON public.safety_tests(organization_id);
CREATE INDEX IF NOT EXISTS idx_safety_tests_user_id ON public.safety_tests(user_id);
