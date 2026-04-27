import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ProbeStatus = "ok" | "fail" | "skip";

type Probe = {
  name: string;
  status: ProbeStatus;
  latencyMs?: number;
  detail?: string;
};

async function probeDb(): Promise<Probe> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { name: "db", status: "ok", latencyMs: Date.now() - start };
  } catch (e) {
    return {
      name: "db",
      status: "fail",
      latencyMs: Date.now() - start,
      detail: e instanceof Error ? e.message : "unknown",
    };
  }
}

function probeEnv(): Probe[] {
  const required: Array<[string, boolean]> = [
    ["DATABASE_URL", !!process.env.DATABASE_URL],
    ["NEXTAUTH_SECRET", !!process.env.NEXTAUTH_SECRET || !!process.env.AUTH_SECRET],
  ];
  return required.map(([name, present]) => ({
    name: `env:${name}`,
    status: present ? "ok" : "fail",
  }));
}

function probeAiProviders(): Probe[] {
  return [
    { name: "ai:openai", status: process.env.OPENAI_API_KEY ? "ok" : "skip" },
    { name: "ai:anthropic", status: process.env.ANTHROPIC_API_KEY ? "ok" : "skip" },
    { name: "ai:gemini", status: process.env.GEMINI_API_KEY ? "ok" : "skip" },
  ];
}

export async function GET() {
  const probes: Probe[] = [];
  probes.push(...probeEnv());
  probes.push(await probeDb());
  probes.push(...probeAiProviders());

  const failed = probes.filter((p) => p.status === "fail");
  const ok = failed.length === 0;

  return NextResponse.json(
    {
      status: ok ? "ok" : "degraded",
      ts: new Date().toISOString(),
      version: process.env.npm_package_version ?? null,
      probes,
    },
    { status: ok ? 200 : 503 }
  );
}
