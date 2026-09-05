-- DialItIn Rev 27 Prompt 0c-2: filming-day test set.
-- Adapts the earlier test_swings tables to Sec 4b / 5.3 / 6.4.

DROP TABLE IF EXISTS public.test_swing_pose_runs;
DROP TABLE IF EXISTS public.test_swing_keypoints;

ALTER TABLE public.test_swings
  ALTER COLUMN golfer_label DROP NOT NULL,
  ALTER COLUMN intent DROP NOT NULL,
  ALTER COLUMN camera_yaw_marker DROP NOT NULL,
  ALTER COLUMN frame_rate DROP NOT NULL,
  ALTER COLUMN handedness DROP NOT NULL,
  ALTER COLUMN club_family TYPE text USING club_family::text,
  ALTER COLUMN intent TYPE text USING intent::text,
  ALTER COLUMN angle TYPE text USING angle::text,
  ALTER COLUMN handedness TYPE text USING handedness::text,
  ALTER COLUMN capture_path TYPE text USING (
    CASE
      WHEN capture_path::text = 'upload' THEN 'native_slomo'
      ELSE capture_path::text
    END
  ),
  ALTER COLUMN frame_rate TYPE integer USING round(frame_rate)::integer;

ALTER TABLE public.test_swings
  DROP CONSTRAINT IF EXISTS test_swings_club_family_check,
  DROP CONSTRAINT IF EXISTS test_swings_intent_check,
  DROP CONSTRAINT IF EXISTS test_swings_angle_check,
  DROP CONSTRAINT IF EXISTS test_swings_handedness_check,
  DROP CONSTRAINT IF EXISTS test_swings_capture_path_check,
  DROP CONSTRAINT IF EXISTS test_swings_camera_yaw_marker_check,
  DROP CONSTRAINT IF EXISTS test_swings_frame_rate_check;

ALTER TABLE public.test_swings
  ADD CONSTRAINT test_swings_club_family_check
    CHECK (
      club_family IS NULL
      OR club_family IN (
        'driver', 'wood_hybrid', 'long_iron', 'short_iron', 'wedge'
      )
    ),
  ADD CONSTRAINT test_swings_intent_check
    CHECK (
      intent IS NULL
      OR intent IN ('stock', 'draw', 'fade', 'knockdown', 'punch', 'flop')
    ),
  ADD CONSTRAINT test_swings_angle_check
    CHECK (angle IS NULL OR angle IN ('dtl', 'face_on')),
  ADD CONSTRAINT test_swings_handedness_check
    CHECK (handedness IS NULL OR handedness IN ('right', 'left')),
  ADD CONSTRAINT test_swings_capture_path_check
    CHECK (capture_path IS NULL OR capture_path IN ('in_app', 'native_slomo')),
  ADD CONSTRAINT test_swings_camera_yaw_marker_check
    CHECK (camera_yaw_marker IS NULL OR camera_yaw_marker IN (0, 5, -5, 10, -10, 15, -15)),
  ADD CONSTRAINT test_swings_frame_rate_check
    CHECK (frame_rate IS NULL OR (frame_rate > 0 AND frame_rate <= 480));

CREATE TABLE public.test_swing_keypoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  test_swing_id uuid NOT NULL REFERENCES public.test_swings (id) ON DELETE CASCADE,
  model_version text NOT NULL,
  frame_rate_detected numeric NOT NULL,
  keypoints jsonb NOT NULL,
  coverage jsonb NOT NULL
);

CREATE INDEX test_swing_keypoints_swing_idx
  ON public.test_swing_keypoints (test_swing_id, created_at DESC);

ALTER TABLE public.test_swing_keypoints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS test_swing_keypoints_admin_select ON public.test_swing_keypoints;
DROP POLICY IF EXISTS test_swing_keypoints_admin_insert ON public.test_swing_keypoints;
DROP POLICY IF EXISTS test_swing_keypoints_admin_update ON public.test_swing_keypoints;
DROP POLICY IF EXISTS test_swing_keypoints_admin_delete ON public.test_swing_keypoints;

CREATE POLICY test_swing_keypoints_admin_select
  ON public.test_swing_keypoints FOR SELECT TO authenticated
  USING (public.is_admin());
CREATE POLICY test_swing_keypoints_admin_insert
  ON public.test_swing_keypoints FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());
CREATE POLICY test_swing_keypoints_admin_update
  ON public.test_swing_keypoints FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY test_swing_keypoints_admin_delete
  ON public.test_swing_keypoints FOR DELETE TO authenticated
  USING (public.is_admin());

REVOKE ALL ON TABLE public.test_swing_keypoints FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.test_swing_keypoints
  TO authenticated;
