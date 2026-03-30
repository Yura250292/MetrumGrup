import { auth } from "@/lib/auth";
import { Role } from "@prisma/client";
import { NextResponse } from "next/server";

export async function getSession() {
  return await auth();
}

export async function requireAuth() {
  const session = await auth();
  if (!session?.user) {
    throw new Error("Unauthorized");
  }
  return session;
}

export async function requireRole(allowedRoles: Role[]) {
  const session = await requireAuth();
  if (!allowedRoles.includes(session.user.role)) {
    throw new Error("Forbidden");
  }
  return session;
}

export function scopeByClient(session: { user: { id: string; role: Role } }) {
  if (session.user.role === "CLIENT") {
    return { clientId: session.user.id };
  }
  return {};
}

export function unauthorizedResponse() {
  return NextResponse.json(
    { error: "Unauthorized", message: "Необхідна авторизація" },
    { status: 401 }
  );
}

export function forbiddenResponse() {
  return NextResponse.json(
    { error: "Forbidden", message: "Недостатньо прав доступу" },
    { status: 403 }
  );
}
