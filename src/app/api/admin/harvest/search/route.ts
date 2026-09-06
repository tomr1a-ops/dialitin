import { NextResponse } from "next/server";
import { jsonError, requireAdminApi } from "@/lib/admin/api";
import {
  parseHarvestLines,
  type HarvestTier,
} from "@/lib/harvest/constants";
import { resolveHarvestLines } from "@/lib/harvest/youtube-search";

export const dynamic = "force-dynamic";

type SearchBody = {
  text?: string;
  defaultTier?: HarvestTier;
};

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) {
    return auth.response;
  }

  if (!process.env.YOUTUBE_API_KEY?.trim()) {
    return jsonError("YOUTUBE_API_KEY is not configured.", 503);
  }

  let body: SearchBody;
  try {
    body = (await request.json()) as SearchBody;
  } catch {
    return jsonError("Expected JSON body.");
  }

  const text = String(body.text ?? "").trim();
  if (!text) {
    return jsonError("Paste search queries or YouTube URLs.");
  }

  const lines = parseHarvestLines(text, body.defaultTier ?? "reference");
  if (lines.length === 0) {
    return jsonError("No valid lines to search.");
  }

  try {
    const results = await resolveHarvestLines(lines);
    const filtered = results.filter((row) => row.passedFilters);
    return NextResponse.json({
      total: results.length,
      filtered: filtered.length,
      results: filtered,
      allResults: results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search failed.";
    return jsonError(message, 500);
  }
}

export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) {
    return auth.response;
  }
  return NextResponse.json({
    configured: Boolean(process.env.YOUTUBE_API_KEY?.trim()),
    rateLimit: 10,
  });
}
