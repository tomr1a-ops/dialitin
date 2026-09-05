-- DialItIn Phase 1 Prompt 1-5: ground-truth phase marks + scorer run history.

ALTER TABLE public.test_swing_keypoints
  ADD COLUMN IF NOT EXISTS phase_marks jsonb;

CREATE TABLE public.scorer_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  engine_git_sha text NOT NULL,
  content_version_id uuid REFERENCES public.content_versions (id),
  summary jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX scorer_runs_created_at_idx
  ON public.scorer_runs (created_at DESC);

ALTER TABLE public.scorer_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY scorer_runs_admin_select
  ON public.scorer_runs FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY scorer_runs_admin_insert
  ON public.scorer_runs FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

REVOKE ALL ON TABLE public.scorer_runs FROM PUBLIC, anon;
GRANT SELECT, INSERT ON TABLE public.scorer_runs TO authenticated;
