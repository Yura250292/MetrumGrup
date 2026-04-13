import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const NON_WWW_HOST = "metrum-grup.biz.ua";
const WWW_HOST = "www.metrum-grup.biz.ua";

/**
 * Middleware:
 * 1. Non-www → www redirect (must run before vercel.json redirects
 *    which can't handle OPTIONS preflight — they return 307 which
 *    browsers reject on preflight)
 * 2. NextAuth `authorized` callback handles all auth logic
 */
export default auth((request) => {
  const host = request.headers.get("host") ?? "";

  // Non-www → www redirect for all routes
  if (host === NON_WWW_HOST) {
    // OPTIONS preflight can't follow redirects — respond with CORS headers
    if (request.method === "OPTIONS") {
      return new NextResponse(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": `https://${WWW_HOST}`,
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    const url = new URL(request.url);
    url.host = WWW_HOST;
    url.protocol = "https:";
    return NextResponse.redirect(url, 308);
  }

  // Auth redirects handled by `authorized` callback in src/lib/auth.ts
  return undefined;
});

export const config = {
  matcher: [
    /*
     * Match all paths except static assets.
     * This is needed so non-www → www redirect works for ALL routes.
     * For www domain, auth logic only triggers on protected routes
     * (handled by the `authorized` callback in auth.ts).
     */
    "/((?!_next/static|_next/image|favicon\\.ico|manifest\\.json|sw\\.js|workbox-|icons/|robots\\.txt|sitemap).*)",
  ],
};
