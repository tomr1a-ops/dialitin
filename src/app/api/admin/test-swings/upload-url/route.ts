import { NextResponse } from "next/server";
import { jsonError, requireAdminApi } from "@/lib/admin/api";
import { TEST_SWING_BUCKET, safeClipFileName } from "@/lib/admin/test-swings";
import { createSecretSupabaseClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) {
    return auth.response;
  }

  let body: { filename?: string; contentType?: string };
  try {
    body = (await request.json()) as {
      filename?: string;
      contentType?: string;
    };
  } catch {
    return jsonError("Expected JSON body.");
  }

  const filename = safeClipFileName(String(body.filename ?? "clip.mp4"));
  const path = `${crypto.randomUUID()}/${filename}`;
  const secret = createSecretSupabaseClient();
  const { data, error } = await secret.storage
    .from(TEST_SWING_BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data) {
    return jsonError(error?.message ?? "Could not create upload URL.", 500);
  }

  return NextResponse.json({
    path: data.path,
    token: data.token,
    signedUrl: data.signedUrl,
    contentType: body.contentType ?? "video/mp4",
  });
}
