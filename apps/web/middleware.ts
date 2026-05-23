import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE_NAME = "aura_session";

export function middleware(req: NextRequest) {
  const session = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/settings/login";
    url.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/settings/((?!login).*)"],
};
