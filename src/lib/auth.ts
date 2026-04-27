import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { isLocked, recordFailure, recordSuccess } from "@/lib/auth-rate-limit";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Пароль", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = credentials.email as string;

        if (isLocked(email)) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user || !user.isActive) {
          recordFailure(email);
          return null;
        }

        const isPasswordValid = await bcrypt.compare(
          credentials.password as string,
          user.password
        );

        if (!isPasswordValid) {
          recordFailure(email);
          return null;
        }

        recordSuccess(email);

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          phone: user.phone,
          image: user.avatar,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id!;
        token.role = user.role;
        token.image = user.image;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.role = token.role as import("@prisma/client").Role;
        session.user.image = (token.image as string) ?? null;
      }
      return session;
    },
    async authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnDashboard = nextUrl.pathname.startsWith("/dashboard");
      const isOnAdmin = nextUrl.pathname.startsWith("/admin");
      const isOnAuth = nextUrl.pathname.startsWith("/login") || nextUrl.pathname.startsWith("/register");

      if (isOnDashboard || isOnAdmin) {
        if (!isLoggedIn) {
          const callbackUrl = nextUrl.pathname + nextUrl.search;
          return Response.redirect(new URL(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`, nextUrl));
        }

        const role = auth.user.role;

        // Admins/Managers/Engineers/Financiers on /dashboard → redirect to /admin
        if (isOnDashboard && ["SUPER_ADMIN", "MANAGER", "ENGINEER", "FINANCIER"].includes(role)) {
          return Response.redirect(new URL("/admin", nextUrl));
        }

        // Clients on /admin → redirect to /dashboard
        if (isOnAdmin && role === "CLIENT") {
          return Response.redirect(new URL("/dashboard", nextUrl));
        }

        // Super admin only routes
        if (isOnAdmin) {
          const superAdminRoutes = ["/admin/users", "/admin/settings"];
          if (superAdminRoutes.some((r) => nextUrl.pathname.startsWith(r))) {
            if (role !== "SUPER_ADMIN") {
              return Response.redirect(new URL("/admin", nextUrl));
            }
          }
        }

        return true;
      }

      // Redirect logged in users from auth pages
      if (isOnAuth && isLoggedIn) {
        const role = auth.user.role;
        if (role === "CLIENT") {
          return Response.redirect(new URL("/dashboard", nextUrl));
        }
        return Response.redirect(new URL("/admin", nextUrl));
      }

      return true;
    },
  },
});
