-- DialItIn Rev 27 Prompt 1-1: store swing phases on the same keypoint row.
ALTER TABLE public.test_swing_keypoints
  ADD COLUMN IF NOT EXISTS phases jsonb;
