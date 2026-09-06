-- Harvest pipeline: nullable pre-pipeline labels + 200 MB test-swings bucket.

ALTER TABLE public.test_swings
  ALTER COLUMN angle DROP NOT NULL,
  ALTER COLUMN club_family DROP NOT NULL,
  ALTER COLUMN capture_path DROP NOT NULL;

UPDATE storage.buckets
SET file_size_limit = 209715200
WHERE id = 'test-swings';
