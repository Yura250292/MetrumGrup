import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { auditLog } from "@/lib/audit";

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function getIp(req: NextRequest): string | undefined {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    undefined
  );
}

export async function POST(request: NextRequest) {
  const limit = rateLimit(request, {
    windowMs: 15 * 60 * 1000,
    max: 10,
    key: "auth:reset-password",
  });
  if (!limit.ok) return rateLimitResponse(limit);

  let token: string;
  let password: string;
  try {
    const body = await request.json();
    token = String(body?.token || "");
    password = String(body?.password || "");
  } catch {
    return NextResponse.json(
      { error: "invalid_request" },
      { status: 400 }
    );
  }

  if (!token || !password) {
    return NextResponse.json(
      { error: "invalid_request", message: "Токен та пароль обов'язкові" },
      { status: 400 }
    );
  }

  if (password.length < 8) {
    return NextResponse.json(
      { error: "weak_password", message: "Пароль має бути не менше 8 символів" },
      { status: 400 }
    );
  }

  const tokenHash = hashToken(token);
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: { select: { id: true, isActive: true } } },
  });

  if (!record || record.usedAt || record.expiresAt < new Date() || !record.user?.isActive) {
    if (record) {
      const reason = record.usedAt
        ? "USED"
        : record.expiresAt < new Date()
          ? "EXPIRED"
          : "INACTIVE";
      await auditLog({
        userId: record.userId,
        action: "PASSWORD_RESET_FAILED",
        entity: "PasswordResetToken",
        entityId: record.id,
        ipAddress: getIp(request),
        newData: { reason },
      });
    }
    return NextResponse.json(
      { error: "invalid_or_expired_token", message: "Посилання недійсне або термін дії закінчився" },
      { status: 400 }
    );
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { password: hashedPassword },
    }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
    prisma.passwordResetToken.deleteMany({
      where: {
        userId: record.userId,
        id: { not: record.id },
        usedAt: null,
      },
    }),
  ]);

  await auditLog({
    userId: record.userId,
    action: "PASSWORD_RESET_COMPLETED",
    entity: "User",
    entityId: record.userId,
    ipAddress: getIp(request),
  });

  return NextResponse.json({ ok: true });
}
