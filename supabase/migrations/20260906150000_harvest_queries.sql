-- Phase 0a-1 Step 4: YouTube search cache (7-day TTL, one API call per query+tier per week)

CREATE TABLE IF NOT EXISTS public.harvest_queries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query text NOT NULL,
  tier public.harvest_tier NOT NULL,
  video_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_results jsonb,
  searched_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT harvest_queries_query_tier_key UNIQUE (query, tier)
);

CREATE INDEX IF NOT EXISTS harvest_queries_searched_at_idx
  ON public.harvest_queries (searched_at DESC);

COMMENT ON TABLE public.harvest_queries IS
  'YouTube search cache; re-use when searched_at is within 7 days before calling the API.';

ALTER TABLE public.harvest_queries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.harvest_queries FROM PUBLIC, anon, authenticated;
