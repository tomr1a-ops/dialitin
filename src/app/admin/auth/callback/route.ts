import { NextResponse } from "next/server";
import { resolveAdminAuthCallback } from "@/lib/admin/pkce-callback";
import { getSiteUrl } from "@/lib/admin/site-url";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const supabase = await createServerSupabaseClient();
  const result = await resolveAdminAuthCallback({
    code: url.searchParams.get("code"),
    nextParam: url.searchParams.get("next"),
    exchangeCode: async (code) => {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      return { error: error ? { message: error.message } : null };
    },
  });

  if (result.kind === "pkce-failure") {
    return new NextResponse(result.html, {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  return NextResponse.redirect(new URL(result.path, getSiteUrl()));
}
