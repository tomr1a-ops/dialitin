-- Phase 2e: ball detection labels, strike features, strike labels.

ALTER TABLE public.test_swing_keypoints
  ADD COLUMN IF NOT EXISTS ball_labels jsonb,
  ADD COLUMN IF NOT EXISTS strike_features jsonb,
  ADD COLUMN IF NOT EXISTS strike_label text
    CHECK (
      strike_label IS NULL
      OR strike_label IN ('center', 'heel', 'toe', 'thin', 'fat')
    );

ALTER TABLE public.swings
  ADD COLUMN IF NOT EXISTS strike_features jsonb,
  ADD COLUMN IF NOT EXISTS shot_record jsonb;

COMMENT ON COLUMN public.test_swing_keypoints.ball_labels IS
  'Admin click-to-label ball boxes per frame index (YOLO training seed).';
COMMENT ON COLUMN public.test_swing_keypoints.strike_features IS
  'Echo-gated strike transient features (Phase 2e).';
COMMENT ON COLUMN public.test_swing_keypoints.strike_label IS
  'Ground-truth strike label; requires capture_path + club_family on parent swing.';
COMMENT ON COLUMN public.swings.strike_features IS
  'Echo-gated strike transient features captured at ingest.';
COMMENT ON COLUMN public.swings.shot_record IS
  'Engine-measured shot outcomes (start_line from ball track, Sec 6.12).';
