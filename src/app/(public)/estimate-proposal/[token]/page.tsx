import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { ProposalReviewClient } from "./_components/proposal-review-client";

/**
 * Публічна сторінка proposal по token. Server component — робить fetch до
 * власного public-API, що вже robusto робить isValidTokenShape + stamp view.
 *
 * Layout standalone (без admin chrome) — окремий route group `(public)`.
 * Mobile-first: клієнти найчастіше відкривають на телефоні.
 *
 * Інтерактивний review (Approve / Reject / Counter) — у клієнтському компоненті
 * `proposal-review-client.tsx`, що дзвонить public POST у Phase 3.
 */
export default async function ProposalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const hdrs = await headers();
  const host = hdrs.get("host");
  const proto = hdrs.get("x-forwarded-proto") ?? "http";
  const origin = host ? `${proto}://${host}` : "";

  const res = await fetch(`${origin}/api/public/estimate-proposal/${token}`, {
    cache: "no-store",
    // Pass forwarded headers so server-side stamp marks IP correctly.
    headers: {
      "x-forwarded-for": hdrs.get("x-forwarded-for") ?? "",
      "user-agent": hdrs.get("user-agent") ?? "",
    },
  });

  if (res.status === 404) notFound();
  if (res.status === 410) {
    const body = (await res.json().catch(() => ({}))) as { status?: string };
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center p-6 text-center">
        <h1 className="mb-2 text-2xl font-bold">Кошторис недоступний</h1>
        <p className="text-zinc-600">
          {body.status === "EXPIRED"
            ? "Термін дії посилання сплив. Зверніться до підрядника за новим."
            : "Це посилання було відкликане або більше не активне."}
        </p>
      </main>
    );
  }
  if (!res.ok) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center p-6 text-center">
        <h1 className="mb-2 text-2xl font-bold">Помилка завантаження</h1>
        <p className="text-zinc-600">Спробуйте оновити сторінку.</p>
      </main>
    );
  }

  const json = (await res.json()) as { data: ProposalData };
  return <ProposalReviewClient token={token} proposal={json.data} />;
}

export type ProposalData = {
  id: string;
  status:
    | "DRAFT"
    | "SENT"
    | "IN_NEGOTIATION"
    | "PARTIALLY_APPROVED"
    | "FULLY_APPROVED"
    | "REJECTED"
    | "WITHDRAWN"
    | "EXPIRED";
  firmId: string;
  sentAt: string | null;
  firstViewedAt: string | null;
  expiresAt: string | null;
  itemsTotal: number;
  itemsApproved: number;
  itemsRejected: number;
  itemsPending: number;
  counterparty: { name: string };
  estimate: {
    id: string;
    number: string;
    title: string;
    finalAmount: string;
    finalClientPrice: string;
    project: {
      id: string;
      title: string;
      address: string | null;
      firmId: string | null;
    };
  };
  itemStates: Array<{
    id: string;
    state:
      | "PENDING"
      | "CLIENT_APPROVED"
      | "CLIENT_REJECTED"
      | "CLIENT_COUNTERED"
      | "FIRM_COUNTERED"
      | "FIRM_REJECTED"
      | "FINAL";
    currentQuantity: string;
    currentUnitPrice: string;
    currentAmount: string;
    currentRound: number;
    lastActorSide: "firm" | "client" | null;
    lastActionAt: string | null;
    estimateItem: {
      id: string;
      description: string;
      unit: string;
      sortOrder: number;
      section: { id: string; title: string; sortOrder: number } | null;
    };
  }>;
};
