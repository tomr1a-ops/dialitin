-- DialItIn Phase 0a-1: The Harvester (Rev 30 §6.3, §9 0a/0b)
-- Source of truth: docs/DialItIn_Design_Rev30.docx

ALTER TYPE public.coaching_status ADD VALUE IF NOT EXISTS 'seeded_unsigned';

CREATE TYPE public.harvest_tier AS ENUM ('reference', 'answer_key');
CREATE TYPE public.label_status AS ENUM ('suggested', 'confirmed');

ALTER TABLE public.test_swings
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS channel text,
  ADD COLUMN IF NOT EXISTS license_note text,
  ADD COLUMN IF NOT EXISTS tier public.harvest_tier,
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.test_swings (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS excluded boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS exclude_reason text,
  ADD COLUMN IF NOT EXISTS label_status public.label_status,
  ADD COLUMN IF NOT EXISTS segment_start_ms numeric,
  ADD COLUMN IF NOT EXISTS segment_end_ms numeric;

CREATE INDEX IF NOT EXISTS test_swings_tier_idx
  ON public.test_swings (tier) WHERE tier IS NOT NULL;
CREATE INDEX IF NOT EXISTS test_swings_parent_idx
  ON public.test_swings (parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS test_swings_reference_gate_idx
  ON public.test_swings (tier, excluded)
  WHERE tier = 'reference' AND excluded = false;

CREATE TABLE IF NOT EXISTS public.harvest_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users (id),
  created_by_email text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  requested_count int NOT NULL DEFAULT 0,
  fetched_count int NOT NULL DEFAULT 0,
  processed_count int NOT NULL DEFAULT 0,
  error text,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.harvest_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS harvest_runs_admin_select ON public.harvest_runs;
DROP POLICY IF EXISTS harvest_runs_admin_insert ON public.harvest_runs;
DROP POLICY IF EXISTS harvest_runs_admin_update ON public.harvest_runs;

CREATE POLICY harvest_runs_admin_select
  ON public.harvest_runs FOR SELECT TO authenticated
  USING (public.is_admin());
CREATE POLICY harvest_runs_admin_insert
  ON public.harvest_runs FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());
CREATE POLICY harvest_runs_admin_update
  ON public.harvest_runs FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

REVOKE ALL ON TABLE public.harvest_runs FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.harvest_runs TO authenticated;
