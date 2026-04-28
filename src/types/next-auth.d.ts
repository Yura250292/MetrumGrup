import { Role } from "@prisma/client";
import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      phone?: string | null;
      firmId: string | null;
      /** Per-firm role override map. Key = firmId, value = effective role on that firm. */
      firmAccess: Record<string, Role>;
    } & DefaultSession["user"];
  }

  interface User {
    role: Role;
    phone?: string | null;
    firmId?: string | null;
    firmAccess?: Record<string, Role>;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    image?: string | null;
    firmId?: string | null;
    firmAccess?: Record<string, Role>;
  }
}
