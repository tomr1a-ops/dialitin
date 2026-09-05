import { NextResponse } from "next/server";
import { execFileSync } from "node:child_process";
import { jsonError, requireAdminApi } from "@/lib/admin/api";
import { runScorer } from "@/lib/admin/scorer";

export const dynamic = "force-dynamic";

function engineGitSha(): string {
  if (process.env.VERCEL_GIT_COMMIT_SHA) {
    return process.env.VERCEL_GIT_COMMIT_SHA;
  }
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return "local";
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) {
    return auth.response;
  }

  let contentVersionId: string | null = null;
  try {
    const body = (await request.json()) as { content_version_id?: string };
    contentVersionId = body.content_version_id ?? null;
  } catch {
    contentVersionId = null;
  }

  try {
    const result = await runScorer({
      contentVersionId,
      engineGitSha: engineGitSha(),
      persist: true,
    });
    return NextResponse.json(result);
  } catch (err) {
    return jsonError(
      err instanceof Error ? err.message : "Scorer run failed.",
      500,
    );
  }
}
