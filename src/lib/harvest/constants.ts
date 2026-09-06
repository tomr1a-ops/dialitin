/** Rev 30 §6.3 — harvest search filters and tier tags. */

export const HARVEST_KEYWORDS = [
  "slow motion",
  "slo-mo",
  "slo mo",
  "down the line",
  "face on",
  "face-on",
  "dtl",
  "swing",
] as const;

export const HARVEST_MAX_DURATION_SEC = 3 * 60;
export const HARVEST_FETCH_RATE_LIMIT = 10;

export type HarvestTier = "reference" | "answer_key";

export type HarvestLine = {
  raw: string;
  tier: HarvestTier;
  query: string;
  isUrl: boolean;
};

export type YouTubeSearchResult = {
  videoId: string;
  title: string;
  description: string;
  channelTitle: string;
  thumbnailUrl: string | null;
  durationSec: number;
  url: string;
};

const YOUTUBE_URL_RE =
  /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

export function parseYouTubeVideoId(input: string): string | null {
  const trimmed = input.trim();
  const match = trimmed.match(YOUTUBE_URL_RE);
  if (match?.[1]) {
    return match[1];
  }
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }
  return null;
}

export function isYouTubeUrl(input: string): boolean {
  return parseYouTubeVideoId(input) !== null;
}

/** Parse pasted lines: optional `[reference]` or `[answer_key]` prefix. */
export function parseHarvestLines(
  text: string,
  defaultTier: HarvestTier = "reference",
): HarvestLine[] {
  const lines: HarvestLine[] = [];
  for (const rawLine of text.split("\n")) {
    const raw = rawLine.trim();
    if (!raw || raw.startsWith("#")) {
      continue;
    }
    let tier = defaultTier;
    let body = raw;
    const tierMatch = raw.match(/^\[(reference|answer_key)\]\s*(.+)$/i);
    if (tierMatch) {
      tier = tierMatch[1]!.toLowerCase() as HarvestTier;
      body = tierMatch[2]!.trim();
    }
    if (!body) {
      continue;
    }
    lines.push({
      raw,
      tier,
      query: body,
      isUrl: isYouTubeUrl(body),
    });
  }
  return lines;
}

export function parseIso8601Duration(iso: string): number {
  const match = iso.match(
    /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/,
  );
  if (!match) {
    return 0;
  }
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  return hours * 3600 + minutes * 60 + seconds;
}

export function textMatchesHarvestKeywords(text: string): boolean {
  const lower = text.toLowerCase();
  return HARVEST_KEYWORDS.some((keyword) => lower.includes(keyword));
}

export function passesHarvestFilters(input: {
  durationSec: number;
  title: string;
  description: string;
}): boolean {
  if (input.durationSec <= 0 || input.durationSec >= HARVEST_MAX_DURATION_SEC) {
    return false;
  }
  const combined = `${input.title}\n${input.description}`;
  return textMatchesHarvestKeywords(combined);
}

export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export const HARVEST_LICENSE_NOTE =
  "public footage, internal analysis only";
