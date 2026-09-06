import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";

export const GOLFER_ID_COOKIE = "dialitin_golfer_id";

export async function getOrCreateGolferId(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(GOLFER_ID_COOKIE)?.value;
  if (existing) {
    return existing;
  }
  const id = randomUUID();
  jar.set(GOLFER_ID_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return id;
}

export async function readGolferId(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(GOLFER_ID_COOKIE)?.value ?? null;
}
