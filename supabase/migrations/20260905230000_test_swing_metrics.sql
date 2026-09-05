-- DialItIn Rev 27 Prompt 1-3: face-on metrics storage.
ALTER TABLE public.test_swing_keypoints
  ADD COLUMN IF NOT EXISTS metrics jsonb;
