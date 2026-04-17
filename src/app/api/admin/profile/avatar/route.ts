import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { r2Client, deleteFileFromR2 } from "@/lib/r2-client";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";

const BUCKET_NAME = process.env.R2_BUCKET_NAME || "metrum";
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL!;

const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return unauthorizedResponse();

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Файл не надано" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Дозволені формати: JPG, PNG, WebP" },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "Максимальний розмір файлу: 5MB" },
        { status: 400 }
      );
    }

    // Get current avatar to delete later
    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { avatar: true },
    });

    // Process with Sharp: resize to 400x400 square, convert to webp
    const arrayBuffer = await file.arrayBuffer();
    const processed = await sharp(Buffer.from(arrayBuffer))
      .resize(400, 400, { fit: "cover", position: "center" })
      .webp({ quality: 85 })
      .toBuffer();

    // Upload to R2
    const timestamp = Date.now();
    const key = "avatars/" + session.user.id + "/" + timestamp + "-avatar.webp";

    await r2Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: processed,
        ContentType: "image/webp",
      })
    );

    const avatarUrl = R2_PUBLIC_URL + "/" + key;

    // Update user record
    await prisma.user.update({
      where: { id: session.user.id },
      data: { avatar: avatarUrl },
    });

    // Delete old avatar from R2 if exists
    if (currentUser?.avatar && currentUser.avatar.includes(R2_PUBLIC_URL)) {
      const oldKey = currentUser.avatar.replace(R2_PUBLIC_URL + "/", "");
      try {
        await deleteFileFromR2(oldKey);
      } catch {
        // Non-critical: old file may not exist
      }
    }

    return NextResponse.json({ avatarUrl });
  } catch (error) {
    console.error("Avatar upload error:", error);
    return NextResponse.json(
      { error: "Помилка завантаження аватара" },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) return unauthorizedResponse();

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { avatar: true },
    });

    if (user?.avatar && user.avatar.includes(R2_PUBLIC_URL)) {
      const key = user.avatar.replace(R2_PUBLIC_URL + "/", "");
      try {
        await deleteFileFromR2(key);
      } catch {
        // Non-critical
      }
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: { avatar: null },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Avatar delete error:", error);
    return NextResponse.json(
      { error: "Помилка видалення аватара" },
      { status: 500 }
    );
  }
}
