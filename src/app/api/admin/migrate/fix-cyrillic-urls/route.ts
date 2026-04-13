import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL ?? "";

/**
 * Fix URLs for files with Cyrillic characters in R2 keys.
 *
 * Problem: Files were uploaded with raw UTF-8 keys (e.g., "Гірник.png"),
 * but public URLs were percent-encoded (%D0%93...). R2 public URLs
 * don't reliably decode percent-encoding → 404.
 *
 * Fix: Rebuild URLs directly from the raw r2Key without encoding.
 *
 * POST /api/admin/migrate/fix-cyrillic-urls
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

    const results: string[] = [];

    // 1. Fix ProjectFile URLs
    const projectFiles = await prisma.projectFile.findMany({
      where: {
        r2Key: { not: null },
      },
      select: { id: true, r2Key: true, url: true, name: true },
    });

    let fixedFiles = 0;
    for (const file of projectFiles) {
      if (!file.r2Key) continue;

      // Check if the r2Key contains non-ASCII (Cyrillic)
      // eslint-disable-next-line no-control-regex
      const hasNonAscii = /[^\x00-\x7F]/.test(file.r2Key);
      // Check if URL contains percent-encoded sequences that don't match the key
      const expectedUrl = `${R2_PUBLIC_URL}/${file.r2Key}`;

      if (hasNonAscii && file.url !== expectedUrl) {
        await prisma.projectFile.update({
          where: { id: file.id },
          data: { url: expectedUrl },
        });
        fixedFiles++;
        results.push(`ProjectFile ${file.id}: ${file.name} — URL fixed`);
      }
    }

    // 2. Fix PhotoReportImage URLs (no r2Key field — check URL for percent-encoded Cyrillic)
    const photoImages = await prisma.photoReportImage.findMany({
      where: {
        url: { contains: R2_PUBLIC_URL },
      },
      select: { id: true, url: true },
    });

    let fixedPhotos = 0;
    for (const img of photoImages) {
      // Check if URL has percent-encoded Cyrillic (%D0, %D1 are common Cyrillic prefixes)
      if (/%D[0-1][0-9A-F]/i.test(img.url)) {
        try {
          const decoded = decodeURIComponent(img.url);
          if (decoded !== img.url) {
            await prisma.photoReportImage.update({
              where: { id: img.id },
              data: { url: decoded },
            });
            fixedPhotos++;
            results.push(`PhotoReportImage ${img.id} — URL decoded`);
          }
        } catch {
          // Skip if URL can't be decoded
        }
      }
    }

    // 3. Fix AiRenderJob input/output URLs
    const renderJobs = await prisma.aiRenderJob.findMany({
      where: {
        OR: [
          { inputR2Key: { not: "" } },
          { outputR2Key: { not: null } },
        ],
      },
      select: { id: true, inputR2Key: true, inputUrl: true, outputR2Key: true, outputUrl: true },
    });

    let fixedRenders = 0;
    for (const job of renderJobs) {
      const updates: Record<string, string> = {};

      // eslint-disable-next-line no-control-regex
      if (job.inputR2Key && /[^\x00-\x7F]/.test(job.inputR2Key)) {
        const expected = `${R2_PUBLIC_URL}/${job.inputR2Key}`;
        if (job.inputUrl !== expected) updates.inputUrl = expected;
      }
      // eslint-disable-next-line no-control-regex
      if (job.outputR2Key && /[^\x00-\x7F]/.test(job.outputR2Key)) {
        const expected = `${R2_PUBLIC_URL}/${job.outputR2Key}`;
        if (job.outputUrl !== expected) updates.outputUrl = expected;
      }

      if (Object.keys(updates).length > 0) {
        await prisma.aiRenderJob.update({ where: { id: job.id }, data: updates });
        fixedRenders++;
        results.push(`AiRenderJob ${job.id} — URL fixed`);
      }
    }

    const total = fixedFiles + fixedPhotos + fixedRenders;

    return NextResponse.json({
      success: true,
      message: `Fixed ${total} URLs (${fixedFiles} files, ${fixedPhotos} photos, ${fixedRenders} renders)`,
      details: results,
      scanned: {
        projectFiles: projectFiles.length,
        photoImages: photoImages.length,
        renderJobs: renderJobs.length,
      },
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
 * GET — dry run: show which files would be fixed.
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

    const photos = await prisma.photoReportImage.findMany({
      where: { url: { contains: R2_PUBLIC_URL } },
      select: { id: true, url: true },
    });

    const affectedPhotos = photos.filter((p) => /%D[0-1][0-9A-F]/i.test(p.url));

    return NextResponse.json({
      dryRun: true,
      affectedFiles: affected.length,
      affectedPhotos: affectedPhotos.length,
      samples: affected.slice(0, 5).map((f) => ({
        id: f.id,
        name: f.name,
        r2Key: f.r2Key,
        currentUrl: f.url,
        fixedUrl: `${R2_PUBLIC_URL}/${f.r2Key}`,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
