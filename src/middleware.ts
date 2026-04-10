export { auth as middleware } from "@/lib/auth";

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/admin/:path*",
    "/admin-v2/:path*",
    "/login",
    "/register",
  ],
};
