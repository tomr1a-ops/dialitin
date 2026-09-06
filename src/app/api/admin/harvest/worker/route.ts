import { NextResponse } from "next/server";
import { jsonError, requireAdminApi } from "@/lib/admin/api";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type WorkerBody = {
  seed?: boolean;
  base?: string;
  maxBatch?: number;
};

function getWorkerUrl(): string | null {
  return (
    process.env.HARVEST_WORKER_URL?.trim() ||
    process.env.NEXT_PUBLIC_HARVEST_WORKER_URL?.trim() ||
    null
  );
}

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) {
    return auth.response;
  }

  const workerUrl = getWorkerUrl();
  const secret = process.env.HARVEST_WORKER_SECRET?.trim();
  if (!workerUrl) {
    return jsonError(
      "HARVEST_WORKER_URL is not configured. Set it to your Railway worker URL.",
      503,
    );
  }
  if (!secret) {
    return jsonError("HARVEST_WORKER_SECRET is not configured.", 503);
  }

  let body: WorkerBody = {};
  try {
    body = (await request.json()) as WorkerBody;
  } catch {
    /* empty body is fine */
  }

  const target = `${workerUrl.replace(/\/$/, "")}/harvest/run`;
  let workerResponse: Response;
  try {
    workerResponse = await fetch(target, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({
        seed: body.seed ?? true,
        base: body.base,
        maxBatch: body.maxBatch,
      }),
      cache: "no-store",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not reach harvest worker.";
    return jsonError(message, 502);
  }

  const text = await workerResponse.text();
  let payload: unknown = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { error: text.slice(0, 500) };
  }

  if (!workerResponse.ok) {
    const error =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof (payload as { error: unknown }).error === "string"
        ? (payload as { error: string }).error
        : `Worker returned ${workerResponse.status}.`;
    return jsonError(error, workerResponse.status >= 500 ? 502 : workerResponse.status);
  }

  return NextResponse.json(payload);
}

export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) {
    return auth.response;
  }
  return NextResponse.json({
    configured: Boolean(getWorkerUrl() && process.env.HARVEST_WORKER_SECRET?.trim()),
    workerUrl: getWorkerUrl(),
  });
}
