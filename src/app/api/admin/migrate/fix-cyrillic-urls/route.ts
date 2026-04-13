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
      new ListObjectsV2Command({ Bucket: BUCKET_NAME, Prefix: prefix, MaxKeys: 50 })
    );
    return (result.Contents ?? []).map((obj) => obj.Key!).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Extract the R2 key from a full R2 public URL.
 */
function extractR2Key(url: string): string | null {
  if (!R2_PUBLIC_URL || !url.startsWith(R2_PUBLIC_URL)) return null;
  return url.slice(R2_PUBLIC_URL.length + 1); // +1 for the /
}

/**
 * Try to find the real R2 key for a given key or URL.
 * Handles Mojibake, percent-encoding, and other encoding issues.
 */
async function findRealR2Key(dbKey: string): Promise<string | null> {
  // Strategy 1: key exists as-is
  if (await r2KeyExists(dbKey)) return dbKey;

  // Strategy 2: try percent-decoded version
  try {
    const decoded = decodeURIComponent(dbKey);
    if (decoded !== dbKey && (await r2KeyExists(decoded))) return decoded;
  } catch {
    // ignore decode errors
  }

  // Strategy 3: extract timestamp-randomId prefix and list R2 objects to find match
  const parts = dbKey.split("/");
  const fileName = parts[parts.length - 1];
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
    // Return first match as fallback
    if (objects.length > 0) return objects[0];
  }

  return null;
}

type FixResult = {
  id: string;
  table: string;
  name: string;
  status: "fixed" | "already_ok" | "not_found_in_r2" | "error";
  oldUrl?: string;
  newUrl?: string;
  error?: string;
};

/**
 * POST /api/admin/migrate/fix-cyrillic-urls
 * Fix URLs for files with Cyrillic/encoding issues.
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

    const results: FixResult[] = [];

    // 1. Fix ProjectFile URLs — files with non-ASCII r2Key
    const projectFiles = await prisma.projectFile.findMany({
      where: { r2Key: { not: null } },
      select: { id: true, r2Key: true, url: true, name: true },
    });

    // eslint-disable-next-line no-control-regex
    const affectedFiles = projectFiles.filter((f) => f.r2Key && /[^\x00-\x7F]/.test(f.r2Key));

    for (const file of affectedFiles) {
      if (!file.r2Key) continue;
      try {
        const realKey = await findRealR2Key(file.r2Key);
        if (realKey) {
          const newUrl = `${R2_PUBLIC_URL}/${realKey}`;
          if (newUrl !== file.url || realKey !== file.r2Key) {
            await prisma.projectFile.update({
              where: { id: file.id },
              data: { url: newUrl, r2Key: realKey },
            });
            results.push({ id: file.id, table: "ProjectFile", name: file.name, status: "fixed", oldUrl: file.url, newUrl });
          } else {
            results.push({ id: file.id, table: "ProjectFile", name: file.name, status: "already_ok" });
          }
        } else {
          results.push({ id: file.id, table: "ProjectFile", name: file.name, status: "not_found_in_r2" });
        }
      } catch (err) {
        results.push({ id: file.id, table: "ProjectFile", name: file.name, status: "error", error: String(err) });
      }
    }

    // 2. Fix PhotoReportImage URLs — ALL images with R2 URLs that return 404
    const photoImages = await prisma.photoReportImage.findMany({
      where: { url: { startsWith: R2_PUBLIC_URL } },
      select: { id: true, url: true, caption: true },
    });

    for (const img of photoImages) {
      try {
        const currentKey = extractR2Key(img.url);
        if (!currentKey) continue;

        // Check if current URL works
        const currentExists = await r2KeyExists(currentKey);
        if (currentExists) {
          // URL works fine, skip
          continue;
        }

        // Try to find the real key
        const realKey = await findRealR2Key(currentKey);
        if (realKey) {
          const newUrl = `${R2_PUBLIC_URL}/${realKey}`;
          await prisma.photoReportImage.update({
            where: { id: img.id },
            data: { url: newUrl },
          });
          results.push({
            id: img.id,
            table: "PhotoReportImage",
            name: img.caption || "photo",
            status: "fixed",
            oldUrl: img.url,
            newUrl,
          });
        } else {
          results.push({
            id: img.id,
            table: "PhotoReportImage",
            name: img.caption || "photo",
            status: "not_found_in_r2",
            oldUrl: img.url,
          });
        }
      } catch (err) {
        results.push({ id: img.id, table: "PhotoReportImage", name: "photo", status: "error", error: String(err) });
      }
    }

    const fixed = results.filter((r) => r.status === "fixed").length;
    const notFound = results.filter((r) => r.status === "not_found_in_r2").length;
    const errors = results.filter((r) => r.status === "error").length;

    return NextResponse.json({
      success: true,
      message: `Fixed ${fixed} URLs. ${notFound} not found in R2. ${errors} errors.`,
      total: results.length,
      fixed,
      notFound,
      errors,
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
 * GET — dry run: check which files are broken and what R2 has.
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // 1. ProjectFiles with non-ASCII r2Keys
    const files = await prisma.projectFile.findMany({
      where: { r2Key: { not: null } },
      select: { id: true, r2Key: true, url: true, name: true },
    });
    // eslint-disable-next-line no-control-regex
    const affectedFiles = files.filter((f) => f.r2Key && /[^\x00-\x7F]/.test(f.r2Key));

    // Check first 3 against R2
    const fileSamples = [];
    for (const f of affectedFiles.slice(0, 3)) {
      const realKey = await findRealR2Key(f.r2Key!);
      fileSamples.push({
        id: f.id,
        name: f.name,
        dbR2Key: f.r2Key,
        currentUrl: f.url,
        realR2Key: realKey,
        fixedUrl: realKey ? `${R2_PUBLIC_URL}/${realKey}` : null,
        existsInR2: !!realKey,
      });
    }

    // 2. PhotoReportImages with R2 URLs — check if they work
    const photos = await prisma.photoReportImage.findMany({
      where: { url: { startsWith: R2_PUBLIC_URL } },
      select: { id: true, url: true, caption: true },
    });

    const photoSamples = [];
    let brokenPhotos = 0;
    for (const p of photos) {
      const key = extractR2Key(p.url);
      if (!key) continue;

      const exists = await r2KeyExists(key);
      if (!exists) {
        brokenPhotos++;
        if (photoSamples.length < 5) {
          const realKey = await findRealR2Key(key);
          photoSamples.push({
            id: p.id,
            caption: p.caption,
            currentUrl: p.url,
            currentKey: key,
            realR2Key: realKey,
            fixedUrl: realKey ? `${R2_PUBLIC_URL}/${realKey}` : null,
            canFix: !!realKey,
          });
        }
      }
    }

    return NextResponse.json({
      dryRun: true,
      affectedProjectFiles: affectedFiles.length,
      brokenPhotoImages: brokenPhotos,
      totalPhotoImages: photos.length,
      fileSamples,
      photoSamples,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
