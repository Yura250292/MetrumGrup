import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  forbiddenResponse,
  unauthorizedResponse,
  SUPPLIER_LEDGER_ROLES,
} from "@/lib/auth-utils";
import {
  getActiveRoleFromSession,
  isHomeFirmFor,
} from "@/lib/firm/scope";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const dynamic = "force-dynamic";

const MAX_SIZE = 20 * 1024 * 1024;

const Body = z.object({
  originalName: z.string().min(1).max(256),
  mimeType: z.string().min(1).max(128),
  size: z.number().int().positive().max(MAX_SIZE),
});

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "";
const COMPUTED_ENDPOINT = R2_ACCOUNT_ID
  ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
  : process.env.R2_ENDPOINT;

let cachedClient: S3Client | null = null;
function client(): S3Client {
  if (!cachedClient) {
    cachedClient = new S3Client({
      region: "auto",
      endpoint: COMPUTED_ENDPOINT,
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
      },
    });
  }
  return cachedClient;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const { firmId } = await resolveFirmScopeForRequest(session);
  if (!isHomeFirmFor(session, firmId)) return forbiddenResponse();
  const role = getActiveRoleFromSession(session, firmId);
  if (!role || !SUPPLIER_LEDGER_ROLES.includes(role)) return forbiddenResponse();

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Bad request", message: "Невалідні параметри" },
      { status: 400 },
    );
  }

  try {
    const timestamp = Date.now();
    const sanitized = parsed.data.originalName.replace(/[^a-zA-Z0-9.-]/g, "_");
    const key = `invoice/${session.user.id}/${timestamp}_${sanitized}`;
    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME || "",
      Key: key,
      ContentType: parsed.data.mimeType,
      Metadata: {
        uploadedBy: session.user.id,
        source: "invoice-ledger",
        uploadedAt: new Date().toISOString(),
      },
    });
    const putUrl = await getSignedUrl(client(), command, { expiresIn: 3600 });
    return NextResponse.json({ key, putUrl });
  } catch (e) {
    console.error("[invoice-upload] presign failed:", e);
    return NextResponse.json(
      { error: "Server", message: "Не вдалось отримати посилання на завантаження" },
      { status: 500 },
    );
  }
}
