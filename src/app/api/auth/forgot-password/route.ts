import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { sendCustomHtmlEmail } from "@/lib/notifications/email";
import { buildPasswordResetEmailHtml } from "@/lib/notifications/email-template";
import { auditLog } from "@/lib/audit";

function getIp(req: NextRequest): string | undefined {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    undefined
  );
}

const TOKEN_TTL_MINUTES = 30;

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function getBaseUrl(req: NextRequest): string {
  const envUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  return `${proto}://${host}`;
}

export async function POST(request: NextRequest) {
  const limit = rateLimit(request, {
    windowMs: 15 * 60 * 1000,
    max: 5,
    key: "auth:forgot-password",
  });
  if (!limit.ok) return rateLimitResponse(limit);

  let email: string;
  try {
    const body = await request.json();
    email = String(body?.email || "").trim().toLowerCase();
  } catch {
    return NextResponse.json({ ok: true });
  }

  if (!email || !email.includes("@")) {
    return NextResponse.json({ ok: true });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, isActive: true },
  });

  if (user && user.isActive) {
    try {
      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000);

      await prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash, expiresAt },
      });

      const resetUrl = `${getBaseUrl(request)}/reset-password/${rawToken}`;
      const html = buildPasswordResetEmailHtml({
        userName: user.name,
        resetUrl,
        expiresInMinutes: TOKEN_TTL_MINUTES,
      });

      await sendCustomHtmlEmail({
        to: user.email,
        subject: "Відновлення паролю — Metrum Group",
        html,
      });

      await auditLog({
        userId: user.id,
        action: "PASSWORD_RESET_REQUESTED",
        entity: "User",
        entityId: user.id,
        ipAddress: getIp(request),
      });
    } catch (error) {
      console.error("forgot-password: failed to issue reset token", error);
    }
  }

  return NextResponse.json({ ok: true });
}
