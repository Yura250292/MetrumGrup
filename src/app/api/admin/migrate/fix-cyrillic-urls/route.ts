import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { r2Client } from "@/lib/r2-client";
import { HeadObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";

const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL ?? "";
const BUCKET_NAME = process.env.R2_BUCKET_NAME || "metrum";

/**
 * Check if a key exists in R2.
 */
async function r2KeyExists(key: string): Promise<boolean> {
  try {
    await r2Client.send(new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: key }));
    return true;
  } catch {
    return false;
  }
}

/**
 * List R2 objects with a given prefix.
 */
async function listR2Objects(prefix: string): Promise<string[]> {
  try {
    const result = await r2Client.send(
      new ListObjectsV2Command({ Bucket: BUCKET_NAME, Prefix: prefix, MaxKeys: 100 })
    );
    return (result.Contents ?? []).map((obj) => obj.Key!).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Try to find the real R2 key for a DB record.
 * The r2Key in DB may have Mojibake or encoding issues.
 * We try multiple strategies:
 * 1. Use r2Key as-is
 * 2. Extract prefix (timestamp-randomId) and list R2 objects to find a match
 */
async function findRealR2Key(dbR2Key: string): Promise<string | null> {
  // Strategy 1: key exists as-is
  if (await r2KeyExists(dbR2Key)) return dbR2Key;

  // Strategy 2: extract the unique prefix and list matching objects
  // Key format: projects/{projectId}/{timestamp}-{randomId}-{filename}
  const parts = dbR2Key.split("/");
  const fileName = parts[parts.length - 1];
  // Extract timestamp-randomId prefix (before the filename part)
  const match = fileName.match(/^(\d+-[a-z0-9]+)-/);
  if (match) {
    const dirPrefix = parts.slice(0, -1).join("/");
    const uniquePrefix = `${dirPrefix}/${match[1]}`;
    const objects = await listR2Objects(uniquePrefix);
    if (objects.length === 1) return objects[0];
    // If multiple, try to match by extension
    const ext = fileName.split(".").pop()?.toLowerCase();
    if (ext) {
      const byExt = objects.filter((k) => k.toLowerCase().endsWith(`.${ext}`));
      if (byExt.length === 1) return byExt[0];
    }
  }

  // Strategy 3: try percent-decoded version
  try {
    const decoded = decodeURIComponent(dbR2Key);
    if (decoded !== dbR2Key && (await r2KeyExists(decoded))) return decoded;
  } catch {
    // ignore decode errors
  }

  return null;
}

/**
 * POST /api/admin/migrate/fix-cyrillic-urls
 * Fix URLs for files with Cyrillic/encoding issues in R2 keys.
 * Verifies each key against R2 before updating.
 */
export async function POST() {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    if (!R2_PUBLIC_URL) {
      return NextResponse.json({ error: "R2_PUBLIC_URL not configured" }, { status: 500 });
    }

    const results: Array<{ id: string; name: string; status: string; oldUrl?: string; newUrl?: string }> = [];

    // 1. Fix ProjectFile URLs
    const projectFiles = await prisma.projectFile.findMany({
      where: { r2Key: { not: null } },
      select: { id: true, r2Key: true, url: true, name: true },
    });

    // eslint-disable-next-line no-control-regex
    const affectedFiles = projectFiles.filter((f) => f.r2Key && /[^\x00-\x7F]/.test(f.r2Key));

    for (const file of affectedFiles) {
      if (!file.r2Key) continue;

      const realKey = await findRealR2Key(file.r2Key);

      if (realKey) {
        const newUrl = `${R2_PUBLIC_URL}/${realKey}`;
        if (newUrl !== file.url || realKey !== file.r2Key) {
          await prisma.projectFile.update({
            where: { id: file.id },
            data: { url: newUrl, r2Key: realKey },
          });
          results.push({
            id: file.id,
            name: file.name,
            status: "fixed",
            oldUrl: file.url,
            newUrl,
          });
        } else {
          results.push({ id: file.id, name: file.name, status: "already_ok" });
        }
      } else {
        results.push({ id: file.id, name: file.name, status: "not_found_in_r2" });
      }
    }

    // 2. Fix PhotoReportImage URLs with percent-encoded Cyrillic
    const photoImages = await prisma.photoReportImage.findMany({
      where: { url: { contains: R2_PUBLIC_URL } },
      select: { id: true, url: true },
    });

    const affectedPhotos = photoImages.filter((p) => /%D[0-1][0-9A-F]/i.test(p.url));

    for (const img of affectedPhotos) {
      try {
        const decoded = decodeURIComponent(img.url);
        if (decoded !== img.url) {
          // Extract what should be the r2Key and verify
          const keyPart = decoded.replace(`${R2_PUBLIC_URL}/`, "");
          const realKey = await findRealR2Key(keyPart);
          if (realKey) {
            const newUrl = `${R2_PUBLIC_URL}/${realKey}`;
            await prisma.photoReportImage.update({
              where: { id: img.id },
              data: { url: newUrl },
            });
            results.push({ id: img.id, name: "photo", status: "fixed", oldUrl: img.url, newUrl });
          } else {
            results.push({ id: img.id, name: "photo", status: "not_found_in_r2" });
          }
        }
      } catch {
        results.push({ id: img.id, name: "photo", status: "decode_error" });
      }
    }

    const fixed = results.filter((r) => r.status === "fixed").length;
    const notFound = results.filter((r) => r.status === "not_found_in_r2").length;

    return NextResponse.json({
      success: true,
      message: `Fixed ${fixed} URLs. ${notFound} files not found in R2.`,
      total: results.length,
      fixed,
      notFound,
      alreadyOk: results.filter((r) => r.status === "already_ok").length,
      details: results,
    });
  } catch (error) {
    console.error("[fix-cyrillic-urls] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * GET — dry run: verify each affected file against R2.
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Find all files with non-ASCII r2Keys
    const files = await prisma.projectFile.findMany({
      where: { r2Key: { not: null } },
      select: { id: true, r2Key: true, url: true, name: true },
    });

    // eslint-disable-next-line no-control-regex
    const affected = files.filter((f) => f.r2Key && /[^\x00-\x7F]/.test(f.r2Key));

    // Check first 5 against R2
    const samples = [];
    for (const f of affected.slice(0, 5)) {
      const realKey = await findRealR2Key(f.r2Key!);
      samples.push({
        id: f.id,
        name: f.name,
        dbR2Key: f.r2Key,
        currentUrl: f.url,
        realR2Key: realKey,
        fixedUrl: realKey ? `${R2_PUBLIC_URL}/${realKey}` : null,
        existsInR2: !!realKey,
      });
    }

    // Photos
    const photos = await prisma.photoReportImage.findMany({
      where: { url: { contains: R2_PUBLIC_URL } },
      select: { id: true, url: true },
    });
    const affectedPhotos = photos.filter((p) => /%D[0-1][0-9A-F]/i.test(p.url));

    return NextResponse.json({
      dryRun: true,
      affectedFiles: affected.length,
      affectedPhotos: affectedPhotos.length,
      samples,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
