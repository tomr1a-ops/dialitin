import type { HarvestTier } from "@/lib/harvest/constants";
import { passesHarvestFilters } from "@/lib/harvest/constants";
import type { HarvestSearchHit } from "@/lib/harvest/youtube-search";
import { createSecretSupabaseClient } from "@/lib/supabase/admin";

/** Re-use cached YouTube search results for this many days before calling the API again. */
export const HARVEST_QUERY_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function isHarvestQueryCacheFresh(searchedAt: string | Date): boolean {
  const searchedMs =
    searchedAt instanceof Date ? searchedAt.getTime() : new Date(searchedAt).getTime();
  if (!Number.isFinite(searchedMs)) {
    return false;
  }
  const age = Date.now() - searchedMs;
  return age >= 0 && age < HARVEST_QUERY_CACHE_TTL_MS;
}

export async function getCachedHarvestSearch(
  query: string,
  tier: HarvestTier,
): Promise<HarvestSearchHit[] | null> {
  const secret = createSecretSupabaseClient();
  const { data, error } = await secret
    .from("harvest_queries")
    .select("raw_results, searched_at")
    .eq("query", query)
    .eq("tier", tier)
    .maybeSingle();

  if (error || !data?.raw_results || !data.searched_at) {
    return null;
  }
  if (!isHarvestQueryCacheFresh(data.searched_at)) {
    return null;
  }

  const hits = data.raw_results as HarvestSearchHit[];
  if (!Array.isArray(hits) || hits.length === 0) {
    return null;
  }
  return hits;
}

export async function setCachedHarvestSearch(
  query: string,
  tier: HarvestTier,
  hits: HarvestSearchHit[],
): Promise<void> {
  const secret = createSecretSupabaseClient();
  const videoIds = hits.map((hit) => hit.videoId);
  const { error } = await secret.from("harvest_queries").upsert(
    {
      query,
      tier,
      video_ids: videoIds,
      raw_results: hits,
      searched_at: new Date().toISOString(),
    },
    { onConflict: "query,tier" },
  );
  if (error) {
    console.warn("harvest_queries cache write failed:", error.message);
  }
}

/** Re-apply tier/sourceLine and filter flags when serving cached rows. */
export function refreshCachedHarvestHits(
  hits: HarvestSearchHit[],
  tier: HarvestTier,
  sourceLine: string,
): HarvestSearchHit[] {
  return hits.map((hit) => ({
    ...hit,
    tier,
    sourceLine,
    passedFilters: passesHarvestFilters(hit),
  }));
}
