import { NextResponse } from "next/server";
import { getAdminSession, type AdminSession } from "@/lib/admin/auth";

export async function requireAdminApi(): Promise<
  { ok: true; session: AdminSession } | { ok: false; response: NextResponse }
> {
  const session = await getAdminSession();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { ok: true, session };
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
