import {
  passesHarvestFilters,
  parseIso8601Duration,
  parseYouTubeVideoId,
  type HarvestLine,
  type HarvestTier,
  type YouTubeSearchResult,
  youtubeWatchUrl,
} from "@/lib/harvest/constants";
import {
  getCachedHarvestSearch,
  refreshCachedHarvestHits,
  setCachedHarvestSearch,
} from "@/lib/harvest/query-cache";

type YouTubeSearchItem = {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    description?: string;
    channelTitle?: string;
    thumbnails?: { medium?: { url?: string }; default?: { url?: string } };
  };
};

type YouTubeVideoItem = {
  id?: string;
  snippet?: YouTubeSearchItem["snippet"];
  contentDetails?: { duration?: string };
};

function getYouTubeApiKey(): string {
  const key = process.env.YOUTUBE_API_KEY?.trim();
  if (!key) {
    throw new Error("YOUTUBE_API_KEY is not configured.");
  }
  return key;
}

async function youtubeFetch<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
  url.searchParams.set("key", getYouTubeApiKey());
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const response = await fetch(url.toString(), { cache: "no-store" });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`YouTube API ${path}: ${response.status} ${body.slice(0, 200)}`);
  }
  return response.json() as Promise<T>;
}

function mapVideoItem(item: YouTubeVideoItem): YouTubeSearchResult | null {
  const videoId = item.id ?? "";
  if (!videoId) {
    return null;
  }
  const durationSec = parseIso8601Duration(item.contentDetails?.duration ?? "PT0S");
  const title = item.snippet?.title ?? "";
  const description = item.snippet?.description ?? "";
  return {
    videoId,
    title,
    description,
    channelTitle: item.snippet?.channelTitle ?? "",
    thumbnailUrl:
      item.snippet?.thumbnails?.medium?.url ??
      item.snippet?.thumbnails?.default?.url ??
      null,
    durationSec,
    url: youtubeWatchUrl(videoId),
  };
}

export type HarvestSearchHit = YouTubeSearchResult & {
  tier: HarvestTier;
  sourceLine: string;
  passedFilters: boolean;
};

export async function searchYouTubeQuery(
  query: string,
  tier: HarvestTier,
  sourceLine: string,
  maxResults = 15,
): Promise<HarvestSearchHit[]> {
  const cached = await getCachedHarvestSearch(query, tier).catch(() => null);
  if (cached) {
    return refreshCachedHarvestHits(cached, tier, sourceLine);
  }

  const data = await youtubeFetch<{ items?: YouTubeSearchItem[] }>("search", {
    part: "snippet",
    type: "video",
    maxResults: String(maxResults),
    q: query,
    safeSearch: "none",
  });
  const ids = (data.items ?? [])
    .map((item) => item.id?.videoId)
    .filter((id): id is string => Boolean(id));
  if (ids.length === 0) {
    await setCachedHarvestSearch(query, tier, []).catch(() => {});
    return [];
  }
  const hits = await hydrateVideoDetails(ids, tier, sourceLine);
  await setCachedHarvestSearch(query, tier, hits).catch(() => {});
  return hits;
}

export async function hydrateVideoDetails(
  videoIds: string[],
  tier: HarvestTier,
  sourceLine: string,
): Promise<HarvestSearchHit[]> {
  if (videoIds.length === 0) {
    return [];
  }
  const data = await youtubeFetch<{ items?: YouTubeVideoItem[] }>("videos", {
    part: "snippet,contentDetails",
    id: videoIds.join(","),
  });
  const hits: HarvestSearchHit[] = [];
  for (const item of data.items ?? []) {
    const mapped = mapVideoItem(item);
    if (!mapped) {
      continue;
    }
    hits.push({
      ...mapped,
      tier,
      sourceLine,
      passedFilters: passesHarvestFilters(mapped),
    });
  }
  return hits;
}

export async function resolveHarvestLines(
  lines: HarvestLine[],
): Promise<HarvestSearchHit[]> {
  const byId = new Map<string, HarvestSearchHit>();

  for (const line of lines) {
    if (line.isUrl) {
      const videoId = parseYouTubeVideoId(line.query);
      if (!videoId) {
        continue;
      }
      const hits = await hydrateVideoDetails([videoId], line.tier, line.raw);
      for (const hit of hits) {
        byId.set(hit.videoId, hit);
      }
      continue;
    }
    const hits = await searchYouTubeQuery(line.query, line.tier, line.raw);
    for (const hit of hits) {
      if (!byId.has(hit.videoId)) {
        byId.set(hit.videoId, hit);
      }
    }
  }

  return [...byId.values()];
}
