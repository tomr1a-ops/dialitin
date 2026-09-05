-- DialItIn coaching-data schema (admin only).
-- Source of truth: docs/DialItIn_Design_Rev25.docx
-- Versioning: object identity is object_id; each save INSERTs a new version row.
-- Payload columns are immutable. The only allowed UPDATE is published → draft
-- so exactly one published version exists per object.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE public.admin_users (
  email text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_users_email_lower CHECK (email = lower(email))
);

CREATE TYPE public.coaching_status AS ENUM ('draft', 'published');
CREATE TYPE public.metric_angle AS ENUM ('dtl', 'face_on', 'either');
CREATE TYPE public.metric_unit AS ENUM (
  'pct_stance',
  'pct_hip_height',
  'ratio',
  'normalized_rotation',
  'boolean',
  'seconds'
);
CREATE TYPE public.club_family AS ENUM (
  'driver',
  'wood_hybrid',
  'long_iron',
  'short_iron',
  'wedge'
);
CREATE TYPE public.shot_intent AS ENUM (
  'stock',
  'draw',
  'fade',
  'knockdown',
  'punch',
  'flop'
);
CREATE TYPE public.fault_tier AS ENUM (
  'setup',
  'backswing',
  'downswing',
  'impact'
);
CREATE TYPE public.protocol_ball AS ENUM ('none', 'ball');
CREATE TYPE public.ball_symptom AS ENUM (
  'slice',
  'hook',
  'fat',
  'thin',
  'shank',
  'push',
  'pull',
  'topping',
  'more_distance',
  'consistent_contact'
);

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_users
    WHERE email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

CREATE OR REPLACE FUNCTION public.coaching_prevent_in_place_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  old_payload jsonb;
  new_payload jsonb;
BEGIN
  old_payload := to_jsonb(OLD) - 'status';
  new_payload := to_jsonb(NEW) - 'status';
  IF old_payload IS DISTINCT FROM new_payload THEN
    RAISE EXCEPTION
      'coaching rows are versioned: insert a new row instead of updating in place';
  END IF;
  IF OLD.status = 'published' AND NEW.status = 'draft' THEN
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'only published→draft demotion is allowed on existing rows';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.coaching_forbid_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'coaching rows are versioned and cannot be deleted';
END;
$$;

-- ---------------------------------------------------------------------------
-- Versioned content tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id uuid NOT NULL,
  version int NOT NULL CHECK (version >= 1),
  status public.coaching_status NOT NULL,
  created_by uuid REFERENCES auth.users (id),
  created_by_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  key text NOT NULL,
  name text NOT NULL,
  angle public.metric_angle NOT NULL,
  unit public.metric_unit NOT NULL,
  description text NOT NULL DEFAULT '',
  requires_club boolean NOT NULL DEFAULT false,
  UNIQUE (object_id, version)
);
CREATE UNIQUE INDEX metrics_one_published_per_object
  ON public.metrics (object_id) WHERE status = 'published';
CREATE UNIQUE INDEX metrics_one_published_key
  ON public.metrics (key) WHERE status = 'published';

CREATE TABLE public.bands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id uuid NOT NULL,
  version int NOT NULL CHECK (version >= 1),
  status public.coaching_status NOT NULL,
  created_by uuid REFERENCES auth.users (id),
  created_by_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  metric_object_id uuid NOT NULL,
  club_family public.club_family NOT NULL,
  intent public.shot_intent NOT NULL,
  functional_low numeric,
  functional_high numeric,
  tolerance_beginner numeric,
  tolerance_intermediate numeric,
  tolerance_advanced numeric,
  UNIQUE (object_id, version)
);
CREATE UNIQUE INDEX bands_one_published_per_object
  ON public.bands (object_id) WHERE status = 'published';
CREATE UNIQUE INDEX bands_one_published_identity
  ON public.bands (metric_object_id, club_family, intent)
  WHERE status = 'published';

CREATE TABLE public.faults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id uuid NOT NULL,
  version int NOT NULL CHECK (version >= 1),
  status public.coaching_status NOT NULL,
  created_by uuid REFERENCES auth.users (id),
  created_by_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  key text NOT NULL,
  name text NOT NULL,
  family text,
  tier public.fault_tier NOT NULL,
  severity_weight numeric,
  causal_leverage numeric,
  changeability numeric,
  metric_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (object_id, version)
);
CREATE UNIQUE INDEX faults_one_published_per_object
  ON public.faults (object_id) WHERE status = 'published';
CREATE UNIQUE INDEX faults_one_published_key
  ON public.faults (key) WHERE status = 'published';

CREATE TABLE public.fault_families (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id uuid NOT NULL,
  version int NOT NULL CHECK (version >= 1),
  status public.coaching_status NOT NULL,
  created_by uuid REFERENCES auth.users (id),
  created_by_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  key text NOT NULL,
  members text[] NOT NULL DEFAULT '{}',
  one_sentence text NOT NULL DEFAULT '',
  UNIQUE (object_id, version)
);
CREATE UNIQUE INDEX fault_families_one_published_per_object
  ON public.fault_families (object_id) WHERE status = 'published';
CREATE UNIQUE INDEX fault_families_one_published_key
  ON public.fault_families (key) WHERE status = 'published';

CREATE TABLE public.symptom_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id uuid NOT NULL,
  version int NOT NULL CHECK (version >= 1),
  status public.coaching_status NOT NULL,
  created_by uuid REFERENCES auth.users (id),
  created_by_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  symptom public.ball_symptom NOT NULL,
  fault_key text NOT NULL,
  weight numeric,
  "order" int NOT NULL DEFAULT 1,
  UNIQUE (object_id, version)
);
CREATE UNIQUE INDEX symptom_map_one_published_per_object
  ON public.symptom_map (object_id) WHERE status = 'published';
CREATE UNIQUE INDEX symptom_map_one_published_identity
  ON public.symptom_map (symptom, fault_key) WHERE status = 'published';

-- unseen_note is per symptom (6.10), not per fault mapping
CREATE TABLE public.symptom_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id uuid NOT NULL,
  version int NOT NULL CHECK (version >= 1),
  status public.coaching_status NOT NULL,
  created_by uuid REFERENCES auth.users (id),
  created_by_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  symptom public.ball_symptom NOT NULL,
  unseen_note text NOT NULL DEFAULT '',
  UNIQUE (object_id, version)
);
CREATE UNIQUE INDEX symptom_notes_one_published_per_object
  ON public.symptom_notes (object_id) WHERE status = 'published';
CREATE UNIQUE INDEX symptom_notes_one_published_symptom
  ON public.symptom_notes (symptom) WHERE status = 'published';

CREATE TABLE public.voice (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id uuid NOT NULL,
  version int NOT NULL CHECK (version >= 1),
  status public.coaching_status NOT NULL,
  created_by uuid REFERENCES auth.users (id),
  created_by_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  fault_key text NOT NULL,
  feel_cue text NOT NULL DEFAULT '',
  ball_flight_cost text NOT NULL DEFAULT '',
  explanation text NOT NULL DEFAULT '',
  signed_by text,
  signed_at timestamptz,
  UNIQUE (object_id, version),
  CONSTRAINT voice_feel_cue_max_12_words CHECK (
    cardinality(regexp_split_to_array(trim(feel_cue), '\s+')) <= 12
    OR trim(feel_cue) = ''
  )
);
CREATE UNIQUE INDEX voice_one_published_per_object
  ON public.voice (object_id) WHERE status = 'published';
CREATE UNIQUE INDEX voice_one_published_fault
  ON public.voice (fault_key) WHERE status = 'published';

CREATE TABLE public.protocols (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id uuid NOT NULL,
  version int NOT NULL CHECK (version >= 1),
  status public.coaching_status NOT NULL,
  created_by uuid REFERENCES auth.users (id),
  created_by_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  fault_key text NOT NULL,
  name text NOT NULL,
  constraint_text text NOT NULL DEFAULT '',
  reps_slow int,
  reps_rehearsal int,
  reps_live int,
  ball public.protocol_ball NOT NULL DEFAULT 'none',
  progression text NOT NULL DEFAULT '',
  success_criterion text NOT NULL DEFAULT '',
  demo_video_url text,
  UNIQUE (object_id, version)
);
CREATE UNIQUE INDEX protocols_one_published_per_object
  ON public.protocols (object_id) WHERE status = 'published';

CREATE TABLE public.setup_priority (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id uuid NOT NULL,
  version int NOT NULL CHECK (version >= 1),
  status public.coaching_status NOT NULL,
  created_by uuid REFERENCES auth.users (id),
  created_by_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  bullet_1 text NOT NULL DEFAULT '',
  bullet_2 text NOT NULL DEFAULT '',
  bullet_3 text NOT NULL DEFAULT '',
  tier_weights jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (object_id, version)
);
CREATE UNIQUE INDEX setup_priority_one_published_per_object
  ON public.setup_priority (object_id) WHERE status = 'published';

CREATE TABLE public.content_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users (id),
  created_by_email text,
  snapshot jsonb NOT NULL
);

-- Immutability triggers
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'metrics',
    'bands',
    'faults',
    'fault_families',
    'symptom_map',
    'symptom_notes',
    'voice',
    'protocols',
    'setup_priority'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I_immutable
         BEFORE UPDATE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.coaching_prevent_in_place_update()',
      t, t
    );
    EXECUTE format(
      'CREATE TRIGGER %I_no_delete
         BEFORE DELETE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.coaching_forbid_delete()',
      t, t
    );
  END LOOP;
END $$;

CREATE TRIGGER content_versions_no_update
  BEFORE UPDATE ON public.content_versions
  FOR EACH ROW EXECUTE FUNCTION public.coaching_forbid_delete();
CREATE TRIGGER content_versions_no_delete
  BEFORE DELETE ON public.content_versions
  FOR EACH ROW EXECUTE FUNCTION public.coaching_forbid_delete();

-- ---------------------------------------------------------------------------
-- Atomic save + optional publish snapshot
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_snapshot_published(
  p_created_by uuid,
  p_created_by_email text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_snapshot jsonb;
BEGIN
  IF NOT public.is_admin() AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'not an admin';
  END IF;

  SELECT jsonb_build_object(
    'metrics', coalesce((
      SELECT jsonb_object_agg(object_id::text, id::text)
      FROM public.metrics WHERE status = 'published'
    ), '{}'::jsonb),
    'bands', coalesce((
      SELECT jsonb_object_agg(object_id::text, id::text)
      FROM public.bands WHERE status = 'published'
    ), '{}'::jsonb),
    'faults', coalesce((
      SELECT jsonb_object_agg(object_id::text, id::text)
      FROM public.faults WHERE status = 'published'
    ), '{}'::jsonb),
    'fault_families', coalesce((
      SELECT jsonb_object_agg(object_id::text, id::text)
      FROM public.fault_families WHERE status = 'published'
    ), '{}'::jsonb),
    'symptom_map', coalesce((
      SELECT jsonb_object_agg(object_id::text, id::text)
      FROM public.symptom_map WHERE status = 'published'
    ), '{}'::jsonb),
    'symptom_notes', coalesce((
      SELECT jsonb_object_agg(object_id::text, id::text)
      FROM public.symptom_notes WHERE status = 'published'
    ), '{}'::jsonb),
    'voice', coalesce((
      SELECT jsonb_object_agg(object_id::text, id::text)
      FROM public.voice WHERE status = 'published'
    ), '{}'::jsonb),
    'protocols', coalesce((
      SELECT jsonb_object_agg(object_id::text, id::text)
      FROM public.protocols WHERE status = 'published'
    ), '{}'::jsonb),
    'setup_priority', coalesce((
      SELECT jsonb_object_agg(object_id::text, id::text)
      FROM public.setup_priority WHERE status = 'published'
    ), '{}'::jsonb)
  ) INTO v_snapshot;

  INSERT INTO public.content_versions (created_by, created_by_email, snapshot)
  VALUES (p_created_by, p_created_by_email, v_snapshot)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_save_coaching(
  p_kind text,
  p_object_id uuid,
  p_status public.coaching_status,
  p_payload jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version int;
  v_id uuid;
  v_uid uuid := auth.uid();
  v_email text := auth.jwt() ->> 'email';
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not an admin';
  END IF;

  CASE p_kind
    WHEN 'metrics' THEN
      SELECT coalesce(max(version), 0) + 1 INTO v_version
      FROM public.metrics WHERE object_id = p_object_id;
      IF p_status = 'published' THEN
        UPDATE public.metrics SET status = 'draft'
        WHERE object_id = p_object_id AND status = 'published';
      END IF;
      INSERT INTO public.metrics (
        object_id, version, status, created_by, created_by_email,
        key, name, angle, unit, description, requires_club
      ) VALUES (
        p_object_id, v_version, p_status, v_uid, v_email,
        p_payload->>'key',
        p_payload->>'name',
        (p_payload->>'angle')::public.metric_angle,
        (p_payload->>'unit')::public.metric_unit,
        coalesce(p_payload->>'description', ''),
        coalesce((p_payload->>'requires_club')::boolean, false)
      ) RETURNING id INTO v_id;

    WHEN 'bands' THEN
      SELECT coalesce(max(version), 0) + 1 INTO v_version
      FROM public.bands WHERE object_id = p_object_id;
      IF p_status = 'published' THEN
        UPDATE public.bands SET status = 'draft'
        WHERE object_id = p_object_id AND status = 'published';
      END IF;
      INSERT INTO public.bands (
        object_id, version, status, created_by, created_by_email,
        metric_object_id, club_family, intent,
        functional_low, functional_high,
        tolerance_beginner, tolerance_intermediate, tolerance_advanced
      ) VALUES (
        p_object_id, v_version, p_status, v_uid, v_email,
        (p_payload->>'metric_object_id')::uuid,
        (p_payload->>'club_family')::public.club_family,
        (p_payload->>'intent')::public.shot_intent,
        nullif(p_payload->>'functional_low', '')::numeric,
        nullif(p_payload->>'functional_high', '')::numeric,
        nullif(p_payload->>'tolerance_beginner', '')::numeric,
        nullif(p_payload->>'tolerance_intermediate', '')::numeric,
        nullif(p_payload->>'tolerance_advanced', '')::numeric
      ) RETURNING id INTO v_id;

    WHEN 'faults' THEN
      SELECT coalesce(max(version), 0) + 1 INTO v_version
      FROM public.faults WHERE object_id = p_object_id;
      IF p_status = 'published' THEN
        UPDATE public.faults SET status = 'draft'
        WHERE object_id = p_object_id AND status = 'published';
      END IF;
      INSERT INTO public.faults (
        object_id, version, status, created_by, created_by_email,
        key, name, family, tier, severity_weight, causal_leverage,
        changeability, metric_rules
      ) VALUES (
        p_object_id, v_version, p_status, v_uid, v_email,
        p_payload->>'key',
        p_payload->>'name',
        nullif(p_payload->>'family', ''),
        (p_payload->>'tier')::public.fault_tier,
        nullif(p_payload->>'severity_weight', '')::numeric,
        nullif(p_payload->>'causal_leverage', '')::numeric,
        nullif(p_payload->>'changeability', '')::numeric,
        coalesce(p_payload->'metric_rules', '{}'::jsonb)
      ) RETURNING id INTO v_id;

    WHEN 'fault_families' THEN
      SELECT coalesce(max(version), 0) + 1 INTO v_version
      FROM public.fault_families WHERE object_id = p_object_id;
      IF p_status = 'published' THEN
        UPDATE public.fault_families SET status = 'draft'
        WHERE object_id = p_object_id AND status = 'published';
      END IF;
      INSERT INTO public.fault_families (
        object_id, version, status, created_by, created_by_email,
        key, members, one_sentence
      ) VALUES (
        p_object_id, v_version, p_status, v_uid, v_email,
        p_payload->>'key',
        CASE
          WHEN jsonb_typeof(p_payload->'members') = 'array'
            THEN ARRAY(SELECT jsonb_array_elements_text(p_payload->'members'))
          ELSE '{}'::text[]
        END,
        coalesce(p_payload->>'one_sentence', '')
      ) RETURNING id INTO v_id;

    WHEN 'symptom_map' THEN
      SELECT coalesce(max(version), 0) + 1 INTO v_version
      FROM public.symptom_map WHERE object_id = p_object_id;
      IF p_status = 'published' THEN
        UPDATE public.symptom_map SET status = 'draft'
        WHERE object_id = p_object_id AND status = 'published';
      END IF;
      INSERT INTO public.symptom_map (
        object_id, version, status, created_by, created_by_email,
        symptom, fault_key, weight, "order"
      ) VALUES (
        p_object_id, v_version, p_status, v_uid, v_email,
        (p_payload->>'symptom')::public.ball_symptom,
        p_payload->>'fault_key',
        nullif(p_payload->>'weight', '')::numeric,
        coalesce(nullif(p_payload->>'order', '')::int, 1)
      ) RETURNING id INTO v_id;

    WHEN 'symptom_notes' THEN
      SELECT coalesce(max(version), 0) + 1 INTO v_version
      FROM public.symptom_notes WHERE object_id = p_object_id;
      IF p_status = 'published' THEN
        UPDATE public.symptom_notes SET status = 'draft'
        WHERE object_id = p_object_id AND status = 'published';
      END IF;
      INSERT INTO public.symptom_notes (
        object_id, version, status, created_by, created_by_email,
        symptom, unseen_note
      ) VALUES (
        p_object_id, v_version, p_status, v_uid, v_email,
        (p_payload->>'symptom')::public.ball_symptom,
        coalesce(p_payload->>'unseen_note', '')
      ) RETURNING id INTO v_id;

    WHEN 'voice' THEN
      SELECT coalesce(max(version), 0) + 1 INTO v_version
      FROM public.voice WHERE object_id = p_object_id;
      IF p_status = 'published' THEN
        UPDATE public.voice SET status = 'draft'
        WHERE object_id = p_object_id AND status = 'published';
      END IF;
      INSERT INTO public.voice (
        object_id, version, status, created_by, created_by_email,
        fault_key, feel_cue, ball_flight_cost, explanation, signed_by, signed_at
      ) VALUES (
        p_object_id, v_version, p_status, v_uid, v_email,
        p_payload->>'fault_key',
        coalesce(p_payload->>'feel_cue', ''),
        coalesce(p_payload->>'ball_flight_cost', ''),
        coalesce(p_payload->>'explanation', ''),
        nullif(p_payload->>'signed_by', ''),
        nullif(p_payload->>'signed_at', '')::timestamptz
      ) RETURNING id INTO v_id;

    WHEN 'protocols' THEN
      SELECT coalesce(max(version), 0) + 1 INTO v_version
      FROM public.protocols WHERE object_id = p_object_id;
      IF p_status = 'published' THEN
        UPDATE public.protocols SET status = 'draft'
        WHERE object_id = p_object_id AND status = 'published';
      END IF;
      INSERT INTO public.protocols (
        object_id, version, status, created_by, created_by_email,
        fault_key, name, constraint_text, reps_slow, reps_rehearsal, reps_live,
        ball, progression, success_criterion, demo_video_url
      ) VALUES (
        p_object_id, v_version, p_status, v_uid, v_email,
        p_payload->>'fault_key',
        p_payload->>'name',
        coalesce(p_payload->>'constraint_text', ''),
        nullif(p_payload->>'reps_slow', '')::int,
        nullif(p_payload->>'reps_rehearsal', '')::int,
        nullif(p_payload->>'reps_live', '')::int,
        coalesce(p_payload->>'ball', 'none')::public.protocol_ball,
        coalesce(p_payload->>'progression', ''),
        coalesce(p_payload->>'success_criterion', ''),
        nullif(p_payload->>'demo_video_url', '')
      ) RETURNING id INTO v_id;

    WHEN 'setup_priority' THEN
      SELECT coalesce(max(version), 0) + 1 INTO v_version
      FROM public.setup_priority WHERE object_id = p_object_id;
      IF p_status = 'published' THEN
        UPDATE public.setup_priority SET status = 'draft'
        WHERE object_id = p_object_id AND status = 'published';
      END IF;
      INSERT INTO public.setup_priority (
        object_id, version, status, created_by, created_by_email,
        bullet_1, bullet_2, bullet_3, tier_weights
      ) VALUES (
        p_object_id, v_version, p_status, v_uid, v_email,
        coalesce(p_payload->>'bullet_1', ''),
        coalesce(p_payload->>'bullet_2', ''),
        coalesce(p_payload->>'bullet_3', ''),
        coalesce(p_payload->'tier_weights', '{}'::jsonb)
      ) RETURNING id INTO v_id;

    ELSE
      RAISE EXCEPTION 'unknown coaching kind: %', p_kind;
  END CASE;

  IF p_status = 'published' THEN
    PERFORM public.admin_snapshot_published(v_uid, v_email);
  END IF;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_save_coaching(text, uuid, public.coaching_status, jsonb)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_snapshot_published(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS: only emails in admin_users
-- ---------------------------------------------------------------------------

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faults ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fault_families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.symptom_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.symptom_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.protocols ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.setup_priority ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_users_select ON public.admin_users
  FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY admin_users_write ON public.admin_users
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'metrics',
    'bands',
    'faults',
    'fault_families',
    'symptom_map',
    'symptom_notes',
    'voice',
    'protocols',
    'setup_priority',
    'content_versions'
  ]
  LOOP
    EXECUTE format(
      'CREATE POLICY %I_admin_select ON public.%I
         FOR SELECT TO authenticated USING (public.is_admin())',
      t, t
    );
    EXECUTE format(
      'CREATE POLICY %I_admin_insert ON public.%I
         FOR INSERT TO authenticated WITH CHECK (public.is_admin())',
      t, t
    );
    EXECUTE format(
      'CREATE POLICY %I_admin_update ON public.%I
         FOR UPDATE TO authenticated
         USING (public.is_admin()) WITH CHECK (public.is_admin())',
      t, t
    );
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon', t);
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE ON TABLE public.%I TO authenticated',
      t
    );
  END LOOP;
END $$;

REVOKE ALL ON TABLE public.admin_users FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.admin_users TO authenticated;
