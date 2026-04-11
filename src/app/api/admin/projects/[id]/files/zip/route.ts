import { NextRequest, NextResponse } from "next/server";
import { Readable } from "node:stream";
import archiver from "archiver";
import {
  forbiddenResponse,
  requireStaffAccess,
  unauthorizedResponse,
} from "@/lib/auth-utils";
import { canViewProject, getProjectAccessContext } from "@/lib/projects/access";
import { prisma } from "@/lib/prisma";
import { r2Client } from "@/lib/r2-client";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import type { FileVisibility } from "@prisma/client";

export const runtime = "nodejs";
export const maxDuration = 300;

const BUCKET = process.env.R2_BUCKET_NAME || "metrum";

/**
 * POST /api/admin/projects/[id]/files/zip
 * Body: { fileIds: string[] }
 *
 * Стрімить ZIP-архів з вибраних файлів проекту. Текстові нотатки
 * (без r2Key) додаються як .txt всередині архіву. R2-обʼєкти стрімляться
 * напряму в архів — не буферизуються в памʼяті.
 */
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireStaffAccess();
    const { id } = await ctx.params;

    const ok = await canViewProject(id, session.user.id);
    if (!ok) return forbiddenResponse();

    const body = await request.json().catch(() => ({}));
    const fileIds: unknown = body?.fileIds;
    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      return NextResponse.json({ error: "fileIds обовʼязковий" }, { status: 400 });
    }
    const ids = fileIds.filter((x): x is string => typeof x === "string");
    if (ids.length === 0) {
      return NextResponse.json({ error: "fileIds порожній" }, { status: 400 });
    }

    // Дозволені visibility — за тим самим принципом, що й listProjectFiles.
    const ctxAccess = await getProjectAccessContext(id, session.user.id);
    if (!ctxAccess || !ctxAccess.canView) return forbiddenResponse();
    let allowedVisibilities: FileVisibility[] = ["TEAM", "CLIENT", "INTERNAL"];
    if (ctxAccess.isClientOfProject) {
      allowedVisibilities = ["CLIENT"];
    } else if (ctxAccess.canViewInternalFiles || ctxAccess.isSuperAdmin) {
      allowedVisibilities = ["TEAM", "CLIENT", "INTERNAL"];
    } else {
      allowedVisibilities = ["TEAM", "CLIENT"];
    }

    // Тягнемо лише ті файли, які належать проекту і користувач має право бачити.
    const files = await prisma.projectFile.findMany({
      where: {
        id: { in: ids },
        projectId: id,
        visibility: { in: allowedVisibilities },
      },
      select: {
        id: true,
        name: true,
        r2Key: true,
        textContent: true,
        mimeType: true,
      },
    });

    if (files.length === 0) {
      return NextResponse.json(
        { error: "Жоден з файлів недоступний" },
        { status: 404 },
      );
    }

    // Створюємо архіватор. zlib level 6 — баланс швидкості/розміру.
    const archive = archiver("zip", { zlib: { level: 6 } });

    // Дедуплікація назв всередині архіву (два "plan.pdf" → "plan.pdf" + "plan (2).pdf").
    const usedNames = new Set<string>();
    const dedupe = (name: string) => {
      if (!usedNames.has(name)) {
        usedNames.add(name);
        return name;
      }
      const dot = name.lastIndexOf(".");
      const base = dot > 0 ? name.slice(0, dot) : name;
      const ext = dot > 0 ? name.slice(dot) : "";
      let i = 2;
      while (usedNames.has(`${base} (${i})${ext}`)) i++;
      const next = `${base} (${i})${ext}`;
      usedNames.add(next);
      return next;
    };

    // Заповнюємо архів асинхронно. Помилки кладемо в archive.destroy().
    (async () => {
      try {
        for (const f of files) {
          if (f.textContent !== null) {
            const name = dedupe(f.name.endsWith(".txt") ? f.name : `${f.name}.txt`);
            archive.append(f.textContent, { name });
            continue;
          }
          if (!f.r2Key) continue;
          const r2res = await r2Client.send(
            new GetObjectCommand({ Bucket: BUCKET, Key: f.r2Key }),
          );
          if (!r2res.Body) continue;
          // r2res.Body — Node Readable у Node-середовищі.
          archive.append(r2res.Body as Readable, { name: dedupe(f.name) });
        }
        await archive.finalize();
      } catch (err) {
        console.error("[projects/files/zip] archive build failed:", err);
        archive.destroy(err as Error);
      }
    })();

    // Перетворюємо Node-стрім archiver-а у Web ReadableStream для Response.
    const webStream = Readable.toWeb(archive) as unknown as ReadableStream;

    const filename = `project-${id}-files.zip`;
    return new Response(webStream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "Unauthorized") return unauthorizedResponse();
    if (message === "Forbidden") return forbiddenResponse();
    console.error("[projects/files/zip] error:", err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
