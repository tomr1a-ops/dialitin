-- Phase 2: The Coach — golfer loop, diagnosis persistence, coach review.

CREATE TYPE public.diagnosis_outcome AS ENUM (
  'fault',
  'dont_fix_it',
  'refuse',
  'insufficient_data'
);

CREATE TYPE public.diagnosis_mode AS ENUM (
  'diagnose',
  'retest',
  'problem'
);

CREATE TYPE public.did_it_work AS ENUM (
  'better',
  'same',
  'worse',
  'not_sure'
);

CREATE TYPE public.coach_mark_verdict AS ENUM (
  'right',
  'wrong',
  'right_but_badly_worded'
);

-- ---------------------------------------------------------------------------
-- Golfer swings and diagnoses
-- ---------------------------------------------------------------------------

CREATE TABLE public.swings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  golfer_id uuid NOT NULL,
  storage_ref text,
  phases jsonb NOT NULL DEFAULT '{}'::jsonb,
  angle text NOT NULL CHECK (angle IN ('dtl', 'face_on')),
  metrics jsonb,
  content_version_id uuid REFERENCES public.content_versions (id),
  capture_path text CHECK (capture_path IN ('in_app', 'native_slomo', 'upload')),
  club_family public.club_family NOT NULL DEFAULT 'short_iron',
  intent public.shot_intent NOT NULL DEFAULT 'stock',
  handedness text NOT NULL DEFAULT 'right' CHECK (handedness IN ('left', 'right')),
  level text NOT NULL DEFAULT 'intermediate'
    CHECK (level IN ('beginner', 'intermediate', 'advanced')),
  stated_symptom public.ball_symptom,
  keypoints jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX swings_golfer_id_idx ON public.swings (golfer_id, created_at DESC);

CREATE TABLE public.diagnoses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  swing_id uuid NOT NULL REFERENCES public.swings (id) ON DELETE CASCADE,
  outcome public.diagnosis_outcome NOT NULL,
  headline_fault text,
  fault_key text,
  family text,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  protocol_id uuid,
  mode public.diagnosis_mode NOT NULL DEFAULT 'diagnose',
  coach_output jsonb,
  score_internal numeric,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  first_guilty_frame int,
  delta_pct_stance numeric,
  prior_diagnosis_id uuid REFERENCES public.diagnoses (id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX diagnoses_swing_id_idx ON public.diagnoses (swing_id);

CREATE TABLE public.outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  diagnosis_id uuid NOT NULL REFERENCES public.diagnoses (id) ON DELETE CASCADE,
  did_it_work public.did_it_work NOT NULL,
  shot_log jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX outcomes_diagnosis_id_idx ON public.outcomes (diagnosis_id);

CREATE TABLE public.baselines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  golfer_id uuid NOT NULL,
  club_family public.club_family NOT NULL,
  angle text NOT NULL CHECK (angle IN ('dtl', 'face_on')),
  intent public.shot_intent NOT NULL DEFAULT 'stock',
  swing_id uuid NOT NULL REFERENCES public.swings (id) ON DELETE CASCADE,
  saved_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (golfer_id, club_family, angle, intent)
);

CREATE INDEX baselines_golfer_id_idx ON public.baselines (golfer_id);

CREATE TABLE public.coach_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  diagnosis_id uuid REFERENCES public.diagnoses (id) ON DELETE SET NULL,
  prompt text NOT NULL,
  output jsonb,
  validation_result jsonb,
  model text,
  input_tokens int,
  output_tokens int,
  cost_usd numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX coach_calls_created_at_idx ON public.coach_calls (created_at DESC);

CREATE TABLE public.coach_marks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_call_id uuid NOT NULL REFERENCES public.coach_calls (id) ON DELETE CASCADE,
  verdict public.coach_mark_verdict NOT NULL,
  marked_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (coach_call_id)
);

-- Free tier tracking per golfer (1 diagnosis + 2 retests)
CREATE TABLE public.golfer_usage (
  golfer_id uuid PRIMARY KEY,
  diagnoses_used int NOT NULL DEFAULT 0,
  retests_used int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- RLS: golfer rows by golfer_id cookie; admin reads all
-- ---------------------------------------------------------------------------

ALTER TABLE public.swings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diagnoses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_marks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.golfer_usage ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.golfer_id_from_header()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(
    current_setting('request.headers', true)::json ->> 'x-golfer-id',
    ''
  )::uuid;
$$;

-- Service role bypasses RLS; anon/authenticated use golfer_id header.
CREATE POLICY swings_golfer_select ON public.swings
  FOR SELECT TO anon, authenticated
  USING (golfer_id = public.golfer_id_from_header());

CREATE POLICY swings_golfer_insert ON public.swings
  FOR INSERT TO anon, authenticated
  WITH CHECK (golfer_id = public.golfer_id_from_header());

CREATE POLICY diagnoses_golfer_select ON public.diagnoses
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.swings s
      WHERE s.id = swing_id AND s.golfer_id = public.golfer_id_from_header()
    )
  );

CREATE POLICY diagnoses_golfer_insert ON public.diagnoses
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.swings s
      WHERE s.id = swing_id AND s.golfer_id = public.golfer_id_from_header()
    )
  );

CREATE POLICY outcomes_golfer_all ON public.outcomes
  FOR ALL TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.diagnoses d
      JOIN public.swings s ON s.id = d.swing_id
      WHERE d.id = diagnosis_id AND s.golfer_id = public.golfer_id_from_header()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.diagnoses d
      JOIN public.swings s ON s.id = d.swing_id
      WHERE d.id = diagnosis_id AND s.golfer_id = public.golfer_id_from_header()
    )
  );

CREATE POLICY baselines_golfer_all ON public.baselines
  FOR ALL TO anon, authenticated
  USING (golfer_id = public.golfer_id_from_header())
  WITH CHECK (golfer_id = public.golfer_id_from_header());

CREATE POLICY golfer_usage_golfer_all ON public.golfer_usage
  FOR ALL TO anon, authenticated
  USING (golfer_id = public.golfer_id_from_header())
  WITH CHECK (golfer_id = public.golfer_id_from_header());

CREATE POLICY swings_admin ON public.swings
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY diagnoses_admin ON public.diagnoses
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY outcomes_admin ON public.outcomes
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY baselines_admin ON public.baselines
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY coach_calls_admin ON public.coach_calls
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY coach_marks_admin ON public.coach_marks
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY golfer_usage_admin ON public.golfer_usage
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

GRANT SELECT, INSERT ON public.swings TO anon, authenticated;
GRANT SELECT, INSERT ON public.diagnoses TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.outcomes TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.baselines TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.golfer_usage TO anon, authenticated;
GRANT ALL ON public.swings TO service_role;
GRANT ALL ON public.diagnoses TO service_role;
GRANT ALL ON public.outcomes TO service_role;
GRANT ALL ON public.baselines TO service_role;
GRANT ALL ON public.coach_calls TO service_role;
GRANT ALL ON public.coach_marks TO service_role;
GRANT ALL ON public.golfer_usage TO service_role;
