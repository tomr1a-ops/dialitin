-- DialItIn filming-day test set (superseded column layout).
-- Adapted to Rev 27 by 20260905183000_test_set.sql.

CREATE TYPE public.swing_view_angle AS ENUM ('dtl', 'face_on');
CREATE TYPE public.handedness AS ENUM ('right', 'left');
CREATE TYPE public.test_capture_path AS ENUM ('in_app', 'upload');

CREATE TABLE public.test_swings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users (id),
  created_by_email text,
  storage_path text NOT NULL UNIQUE,
  golfer_label text NOT NULL,
  club_family public.club_family NOT NULL,
  intent public.shot_intent NOT NULL,
  angle public.swing_view_angle NOT NULL,
  frame_rate numeric NOT NULL CHECK (frame_rate > 0 AND frame_rate <= 480),
  camera_yaw_marker int NOT NULL CHECK (
    camera_yaw_marker IN (0, 5, -5, 10, -10, 15, -15)
  ),
  capture_path public.test_capture_path NOT NULL,
  consecutive_group text,
  pro_label_fault_1 text,
  pro_label_fault_2 text,
  handedness public.handedness NOT NULL,
  notes text
);

CREATE TABLE public.test_swing_keypoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  test_swing_id uuid NOT NULL REFERENCES public.test_swings (id) ON DELETE CASCADE,
  frame_index int NOT NULL CHECK (frame_index >= 0),
  media_time numeric NOT NULL,
  landmarks jsonb NOT NULL,
  crop_box jsonb NOT NULL,
  UNIQUE (test_swing_id, frame_index)
);

CREATE TABLE public.test_swing_pose_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  test_swing_id uuid NOT NULL UNIQUE REFERENCES public.test_swings (id) ON DELETE CASCADE,
  frames_processed int NOT NULL CHECK (frames_processed >= 0),
  coverage_pct numeric NOT NULL CHECK (coverage_pct >= 0 AND coverage_pct <= 100),
  pose_path text NOT NULL CHECK (pose_path IN ('worker', 'main')),
  seconds_to_process numeric NOT NULL CHECK (seconds_to_process >= 0)
);

CREATE INDEX test_swing_keypoints_swing_idx
  ON public.test_swing_keypoints (test_swing_id, frame_index);

CREATE OR REPLACE FUNCTION public.touch_test_swings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER test_swings_touch_updated_at
  BEFORE UPDATE ON public.test_swings
  FOR EACH ROW EXECUTE FUNCTION public.touch_test_swings_updated_at();

ALTER TABLE public.test_swings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_swing_keypoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_swing_pose_runs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'test_swings',
    'test_swing_keypoints',
    'test_swing_pose_runs'
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
    EXECUTE format(
      'CREATE POLICY %I_admin_delete ON public.%I
         FOR DELETE TO authenticated USING (public.is_admin())',
      t, t
    );
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon', t);
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated',
      t
    );
  END LOOP;
END $$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'test-swings',
  'test-swings',
  false,
  104857600,
  ARRAY[
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'video/x-m4v'
  ]
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS test_swings_storage_select ON storage.objects;
DROP POLICY IF EXISTS test_swings_storage_insert ON storage.objects;
DROP POLICY IF EXISTS test_swings_storage_update ON storage.objects;
DROP POLICY IF EXISTS test_swings_storage_delete ON storage.objects;

CREATE POLICY test_swings_storage_select
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'test-swings' AND public.is_admin());

CREATE POLICY test_swings_storage_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'test-swings' AND public.is_admin());

CREATE POLICY test_swings_storage_update
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'test-swings' AND public.is_admin())
  WITH CHECK (bucket_id = 'test-swings' AND public.is_admin());

CREATE POLICY test_swings_storage_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'test-swings' AND public.is_admin());
