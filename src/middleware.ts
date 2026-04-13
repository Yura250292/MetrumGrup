import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const NON_WWW_HOST = "metrum-grup.biz.ua";
const WWW_HOST = "www.metrum-grup.biz.ua";

/**
 * Middleware:
 * 1. Non-www → www redirect with proper OPTIONS/preflight handling
 *    (vercel.json redirect handles normal navigation, but browsers
 *     reject 3xx on preflight — middleware handles that case)
 * 2. NextAuth `authorized` callback handles all auth logic
 */
export default auth((request) => {
  const host = request.headers.get("host") ?? "";

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

    // For non-preflight requests that somehow bypass vercel.json redirect
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
    "/dashboard/:path*",
    "/admin/:path*",
    "/admin-v2/:path*",
    "/login",
    "/register",
  ],
};
