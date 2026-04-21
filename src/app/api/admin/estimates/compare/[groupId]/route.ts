import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";

export const runtime = "nodejs";

const READ_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "ENGINEER"];

type SerializedItem = {
  id: string;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  sortOrder: number;
};

type Match = {
  clientItem: SerializedItem | null;
  internalItem: SerializedItem | null;
  diff: number;
  diffPercent: number;
  matchConfidence: number;
};

/** Normalize text for fuzzy matching */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(s: string): Set<string> {
  return new Set(
    normalize(s)
      .split(" ")
      .filter((t) => t.length >= 3),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  const intersection = new Set<string>();
  for (const t of a) if (b.has(t)) intersection.add(t);
  const unionSize = a.size + b.size - intersection.size;
  return unionSize === 0 ? 0 : intersection.size / unionSize;
}

const MATCH_THRESHOLD = 0.4;

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ groupId: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!READ_ROLES.includes(session.user.role)) return forbiddenResponse();

  const { groupId } = await ctx.params;

  try {
    const estimates = await prisma.estimate.findMany({
      where: { estimateGroupId: groupId },
      include: {
        items: {
          orderBy: { sortOrder: "asc" },
        },
        project: { select: { id: true, title: true, slug: true } },
      },
      orderBy: { version: "desc" },
    });

    if (estimates.length === 0) {
      return NextResponse.json({ error: "Пару кошторисів не знайдено" }, { status: 404 });
    }

    // Pick the latest version pair (both CLIENT and INTERNAL of that version)
    const latestVersion = estimates[0].version;
    const pair = estimates.filter((e) => e.version === latestVersion);
    const client = pair.find((e) => e.role === "CLIENT");
    const internal = pair.find((e) => e.role === "INTERNAL");

    if (!client && !internal) {
      return NextResponse.json(
        { error: "Пара не містить CLIENT/INTERNAL кошторисів" },
        { status: 400 },
      );
    }

    const project = (client ?? internal)!.project;

    const serializeItem = (it: typeof pair[0]["items"][0]): SerializedItem => ({
      id: it.id,
      description: it.description,
      unit: it.unit,
      quantity: Number(it.quantity),
      unitPrice: Number(it.unitPrice),
      amount: Number(it.amount),
      sortOrder: it.sortOrder,
    });

    const clientItems = (client?.items ?? []).map(serializeItem);
    const internalItems = (internal?.items ?? []).map(serializeItem);

    // Fuzzy match by description tokens (greedy, client-side)
    const clientTokens = clientItems.map((it) => tokenize(it.description));
    const internalTokens = internalItems.map((it) => tokenize(it.description));

    const matchedInternal = new Set<number>();
    const matches: Match[] = [];

    for (let ci = 0; ci < clientItems.length; ci++) {
      let bestIdx = -1;
      let bestScore = 0;
      for (let ii = 0; ii < internalItems.length; ii++) {
        if (matchedInternal.has(ii)) continue;
        const score = jaccard(clientTokens[ci], internalTokens[ii]);
        if (score > bestScore) {
          bestScore = score;
          bestIdx = ii;
        }
      }

      if (bestIdx >= 0 && bestScore >= MATCH_THRESHOLD) {
        matchedInternal.add(bestIdx);
        const c = clientItems[ci];
        const ii = internalItems[bestIdx];
        const diff = c.amount - ii.amount;
        const diffPercent = ii.amount > 0 ? (diff / ii.amount) * 100 : 0;
        matches.push({
          clientItem: c,
          internalItem: ii,
          diff,
          diffPercent,
          matchConfidence: bestScore,
        });
      } else {
        // Unmatched client item
        matches.push({
          clientItem: clientItems[ci],
          internalItem: null,
          diff: clientItems[ci].amount,
          diffPercent: 100,
          matchConfidence: 0,
        });
      }
    }

    // Add unmatched internal items
    for (let ii = 0; ii < internalItems.length; ii++) {
      if (!matchedInternal.has(ii)) {
        matches.push({
          clientItem: null,
          internalItem: internalItems[ii],
          diff: -internalItems[ii].amount,
          diffPercent: -100,
          matchConfidence: 0,
        });
      }
    }

    const clientTotal = clientItems.reduce((s, i) => s + i.amount, 0);
    const internalTotal = internalItems.reduce((s, i) => s + i.amount, 0);
    const profit = clientTotal - internalTotal;
    const profitPercent = internalTotal > 0 ? (profit / internalTotal) * 100 : 0;

    return NextResponse.json({
      groupId,
      version: latestVersion,
      project,
      client: client
        ? {
            id: client.id,
            title: client.title,
            number: client.number,
            totalAmount: Number(client.totalAmount),
            items: clientItems,
            sourceFileR2Key: client.sourceFileR2Key,
            sourceFileName: client.sourceFileName,
          }
        : null,
      internal: internal
        ? {
            id: internal.id,
            title: internal.title,
            number: internal.number,
            totalAmount: Number(internal.totalAmount),
            items: internalItems,
            sourceFileR2Key: internal.sourceFileR2Key,
            sourceFileName: internal.sourceFileName,
          }
        : null,
      matches,
      summary: {
        clientTotal,
        internalTotal,
        profit,
        profitPercent,
        unmatchedClient: matches.filter((m) => m.clientItem && !m.internalItem).length,
        unmatchedInternal: matches.filter((m) => !m.clientItem && m.internalItem).length,
        matchedCount: matches.filter((m) => m.clientItem && m.internalItem).length,
      },
    });
  } catch (error) {
    console.error("[estimates/compare] error:", error);
    const msg = error instanceof Error ? error.message : "Невідома помилка";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
