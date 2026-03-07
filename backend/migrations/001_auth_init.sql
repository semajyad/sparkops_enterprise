-- SparkOps Auth + RBAC bootstrap migration
-- Multi-tenant schema + RLS policies for Supabase PostgreSQL

BEGIN;

-- Roles enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('OWNER', 'EMPLOYEE');
  END IF;
END $$;

-- Organizations table
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Profiles table (linked to Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'OWNER',
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_organization_id ON public.profiles(organization_id);

-- Ensure job_drafts includes tenant ownership columns
ALTER TABLE public.job_drafts
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_job_drafts_user_id ON public.job_drafts(user_id);
CREATE INDEX IF NOT EXISTS idx_job_drafts_organization_id ON public.job_drafts(organization_id);

-- Ensure materials includes tenant ownership columns
ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_materials_user_id ON public.materials(user_id);
CREATE INDEX IF NOT EXISTS idx_materials_organization_id ON public.materials(organization_id);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;

-- Profiles: user can read own profile
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own
ON public.profiles
FOR SELECT
TO authenticated
USING (id = auth.uid());

-- Jobs: employee can read own jobs
DROP POLICY IF EXISTS job_drafts_select_employee_own ON public.job_drafts;
CREATE POLICY job_drafts_select_employee_own
ON public.job_drafts
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
);

-- Jobs: owner can read all jobs in their organization
DROP POLICY IF EXISTS job_drafts_select_owner_org ON public.job_drafts;
CREATE POLICY job_drafts_select_owner_org
ON public.job_drafts
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'OWNER'
      AND p.organization_id = job_drafts.organization_id
  )
);

-- Materials: owner full access in org; employee read-only in org
DROP POLICY IF EXISTS materials_owner_all_org ON public.materials;
CREATE POLICY materials_owner_all_org
ON public.materials
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'OWNER'
      AND p.organization_id = materials.organization_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'OWNER'
      AND p.organization_id = materials.organization_id
  )
);

DROP POLICY IF EXISTS materials_employee_read_org ON public.materials;
CREATE POLICY materials_employee_read_org
ON public.materials
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.organization_id = materials.organization_id
  )
);

-- Trigger: create organization + profile for new signups (default OWNER)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_id UUID;
  derived_name TEXT;
BEGIN
  derived_name := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(trim(NEW.email), ''),
    'New SparkOps Organization'
  );

  INSERT INTO public.organizations(name)
  VALUES (derived_name)
  RETURNING id INTO org_id;

  INSERT INTO public.profiles(id, organization_id, role, full_name)
  VALUES (
    NEW.id,
    org_id,
    'OWNER',
    NULLIF(trim(NEW.raw_user_meta_data->>'full_name'), '')
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

COMMIT;
