import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function hasSupabaseSession(request: NextRequest) {
  return request.cookies
    .getAll()
    .some((cookie) => cookie.name.includes("-auth-token") && cookie.value);
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/admin")) {
    return NextResponse.next();
  }
  if (
    pathname.startsWith("/admin/login") ||
    pathname.startsWith("/admin/auth/")
  ) {
    return NextResponse.next();
  }
  if (!hasSupabaseSession(request)) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
