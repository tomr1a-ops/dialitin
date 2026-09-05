-- DialItIn Rev 27 Prompt 1-2: camera angle estimation storage.
ALTER TABLE public.test_swing_keypoints
  ADD COLUMN IF NOT EXISTS angle jsonb,
  ADD COLUMN IF NOT EXISTS normalized_keypoints jsonb,
  ADD COLUMN IF NOT EXISTS orientation jsonb;
