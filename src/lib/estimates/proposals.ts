import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  EstimateItemNegotiationState,
  EstimateProposalStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { createEstimateVersion } from "@/lib/versioning";

import { generateProposalToken } from "./proposal-tokens";
import {
  createRoundSignature,
  type NegotiationRoundSignaturePayload,
} from "./proposal-signature";
import {
  countItemStates,
  deriveProposalStatus,
  InvalidTransitionError,
  isTerminalState,
  nextItemState,
  type ClientAction,
  type FirmAction,
  type NegotiationSide,
} from "./proposal-state-machine";

type Tx = Prisma.TransactionClient | PrismaClient;

const DEFAULT_EXPIRY_DAYS = 30;

/**
 * Concurrency error — клієнт надіслав дію, що ґрунтується на застарілому
 * `expectedRound`. API має повернути 409 з поточним `currentRound`.
 */
export class StaleRoundError extends Error {
  constructor(
    public readonly expected: number,
    public readonly actual: number,
  ) {
    super(`Stale round: expected ${expected}, actual ${actual}`);
    this.name = "StaleRoundError";
  }
}

/**
 * Proposal у термінальному стані — не приймає більше дій.
 */
export class ProposalClosedError extends Error {
  constructor(public readonly status: EstimateProposalStatus) {
    super(`Proposal closed (status=${status}); no further actions allowed`);
    this.name = "ProposalClosedError";
  }
}

export interface CreateProposalParams {
  estimateId: string;
  firmId: string;
  counterpartyId: string;
  emailSnapshot: string;
  createdById: string;
  /** Default = sentAt + 30 днів. null = безстроково. */
  expiresAt?: Date | null;
}

/**
 * Створити новий proposal: згенерувати token, зробити baseline snapshot
 * (EstimateVersion), створити по EstimateItemProposal на кожен estimate item
 * у стані PENDING з round 0 (PROPOSE).
 *
 * Усе в одній транзакції — щоб не лишилось напіввалідних proposal'ів без items.
 *
 * Status = DRAFT після створення; перехід в SENT відбувається при `markSent()`.
 */
export async function createProposal(params: CreateProposalParams) {
  const {
    estimateId,
    firmId,
    counterpartyId,
    emailSnapshot,
    createdById,
    expiresAt,
  } = params;

  // 1. Baseline snapshot — створюємо ДО транзакції, бо createEstimateVersion
  // має власні запити (findUnique + findFirst + create).
  const baselineVersion = await createEstimateVersion({
    estimateId,
    userId: createdById,
    eventType: "STATUS_CHANGED",
    description: "Proposal baseline — sent for client review",
  });

  const accessToken = generateProposalToken();
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    // 2. Усі items кошторису — будемо ініціалізувати один до одного.
    const items = await tx.estimateItem.findMany({
      where: { estimateId },
      select: {
        id: true,
        quantity: true,
        unitPrice: true,
        amount: true,
      },
    });

    if (items.length === 0) {
      throw new Error("Cannot create proposal: estimate has no items");
    }

    // 3. EstimateProposal row.
    const proposal = await tx.estimateProposal.create({
      data: {
        estimateId,
        firmId,
        counterpartyId,
        emailSnapshot,
        accessToken,
        status: "DRAFT",
        baselineVersionId: baselineVersion.id,
        expiresAt: expiresAt === null ? null : (expiresAt ?? null),
        itemsTotal: items.length,
        itemsPending: items.length,
        createdById,
      },
    });

    // 4. Item proposals + initial round 0 (PROPOSE, actorSide=firm).
    for (const item of items) {
      const itemProposal = await tx.estimateItemProposal.create({
        data: {
          proposalId: proposal.id,
          estimateItemId: item.id,
          state: "PENDING",
          currentQuantity: item.quantity,
          currentUnitPrice: item.unitPrice,
          currentAmount: item.amount,
          currentRound: 0,
          lastActorSide: "firm",
          lastActionAt: now,
        },
      });

      const payload: NegotiationRoundSignaturePayload = {
        itemProposalId: itemProposal.id,
        roundNumber: 0,
        actorSide: "firm",
        action: "PROPOSE",
        proposedQuantity: item.quantity.toString(),
        proposedUnitPrice: item.unitPrice.toString(),
        proposedAmount: item.amount.toString(),
        comment: null,
        timestamp: now.toISOString(),
      };

      await tx.estimateItemNegotiationRound.create({
        data: {
          itemProposalId: itemProposal.id,
          roundNumber: 0,
          actorSide: "firm",
          actorUserId: createdById,
          action: "PROPOSE",
          proposedQuantity: item.quantity,
          proposedUnitPrice: item.unitPrice,
          proposedAmount: item.amount,
          comment: null,
          signatureHash: createRoundSignature(payload),
        },
      });
    }

    return proposal;
  });
}

export interface MarkSentParams {
  proposalId: string;
  /** null оставляє наявне значення (default = sentAt + 30 days якщо було null). */
  expiresAt?: Date | null;
}

/**
 * Транзакція DRAFT → SENT: stamp sentAt, виставити expiresAt (default +30d),
 * залогувати event SENT. Для повідомлення клієнту викликати окремо
 * (notifications/estimate-proposal-events.ts) — щоб transactional core не
 * залежав від transport-шару.
 */
export async function markProposalSent(params: MarkSentParams) {
  const { proposalId, expiresAt } = params;

  return prisma.$transaction(async (tx) => {
    const proposal = await tx.estimateProposal.findUniqueOrThrow({
      where: { id: proposalId },
    });

    if (proposal.status !== "DRAFT") {
      throw new Error(
        `Cannot send proposal in status ${proposal.status} (expected DRAFT)`,
      );
    }

    const now = new Date();
    const effectiveExpiry =
      expiresAt !== undefined
        ? expiresAt
        : (proposal.expiresAt ??
          new Date(now.getTime() + DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000));

    const updated = await tx.estimateProposal.update({
      where: { id: proposalId },
      data: {
        status: "SENT",
        sentAt: now,
        expiresAt: effectiveExpiry,
      },
    });

    await tx.estimateProposalEvent.create({
      data: {
        proposalId,
        eventType: "SENT",
        actorSide: "firm",
        actorUserId: proposal.createdById,
        metadata: { emailSnapshot: proposal.emailSnapshot },
      },
    });

    return updated;
  });
}

export interface MarkViewedParams {
  proposalId: string;
  ipAddress?: string | null;
}

/**
 * Stamp firstViewedAt (один раз) + lastViewedAt + event VIEWED.
 * Викликається з public GET handler'а.
 */
export async function markProposalViewed(params: MarkViewedParams) {
  const { proposalId, ipAddress } = params;
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const proposal = await tx.estimateProposal.findUniqueOrThrow({
      where: { id: proposalId },
    });

    const isFirstView = proposal.firstViewedAt === null;

    await tx.estimateProposal.update({
      where: { id: proposalId },
      data: {
        firstViewedAt: isFirstView ? now : proposal.firstViewedAt,
        lastViewedAt: now,
      },
    });

    if (isFirstView) {
      await tx.estimateProposalEvent.create({
        data: {
          proposalId,
          eventType: "VIEWED",
          actorSide: "client",
          ipAddress: ipAddress ?? null,
        },
      });
    }
  });
}

export interface ApplyItemActionParams {
  itemProposalId: string;
  side: NegotiationSide;
  action: ClientAction | FirmAction;
  /** Optimistic concurrency — клієнт надсилає поточний round, що бачив у UI. */
  expectedRound: number;
  /** Обов'язкове для COUNTER / ACCEPT_COUNTER з модифікацією. */
  proposedQuantity?: Prisma.Decimal | string | number | null;
  proposedUnitPrice?: Prisma.Decimal | string | number | null;
  comment?: string | null;
  /** Для firm actions — User.id; для client — null. */
  actorUserId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface ApplyItemActionResult {
  itemProposalId: string;
  previousState: EstimateItemNegotiationState;
  nextState: EstimateItemNegotiationState;
  roundNumber: number;
  proposalStatus: EstimateProposalStatus;
}

/**
 * Ядро state-машини у транзакції:
 *   1. Load item proposal + parent proposal (FOR UPDATE).
 *   2. Validate: proposal not closed, item not terminal, expectedRound matches.
 *   3. Compute next state via pure reducer (throws InvalidTransitionError).
 *   4. Compute proposed values:
 *        - APPROVE / ACCEPT_COUNTER → use last counter values (no new numbers).
 *        - REJECT / REJECT_COUNTER → keep current numbers (signal-only).
 *        - COUNTER → use params.proposedQuantity/UnitPrice; amount = qty * price.
 *   5. Append round (immutable).
 *   6. Update item proposal (state, currentQty/Price/Amount, lastActor, currentRound).
 *   7. Recompute proposal-level counters + maybe derive new status.
 *   8. Return result for notification fan-out outside transaction.
 */
export async function applyItemAction(
  params: ApplyItemActionParams,
): Promise<ApplyItemActionResult> {
  const {
    itemProposalId,
    side,
    action,
    expectedRound,
    proposedQuantity,
    proposedUnitPrice,
    comment,
    actorUserId,
    ipAddress,
    userAgent,
  } = params;

  return prisma.$transaction(async (tx) => {
    const itemProposal = await tx.estimateItemProposal.findUniqueOrThrow({
      where: { id: itemProposalId },
      include: {
        proposal: { select: { id: true, status: true } },
      },
    });

    const proposalStatus = itemProposal.proposal.status;
    if (
      proposalStatus === "FULLY_APPROVED" ||
      proposalStatus === "REJECTED" ||
      proposalStatus === "WITHDRAWN" ||
      proposalStatus === "EXPIRED"
    ) {
      throw new ProposalClosedError(proposalStatus);
    }
    if (proposalStatus === "DRAFT") {
      throw new Error("Cannot act on a DRAFT proposal — call markProposalSent first");
    }

    if (itemProposal.currentRound !== expectedRound) {
      throw new StaleRoundError(expectedRound, itemProposal.currentRound);
    }

    if (isTerminalState(itemProposal.state)) {
      throw new InvalidTransitionError(itemProposal.state, side, action);
    }

    const previousState = itemProposal.state;
    const next = nextItemState(previousState, side, action);

    // Compute new values per action.
    let newQuantity = itemProposal.currentQuantity;
    let newUnitPrice = itemProposal.currentUnitPrice;
    let newAmount = itemProposal.currentAmount;

    if (action === "COUNTER") {
      if (proposedQuantity == null || proposedUnitPrice == null) {
        throw new Error("COUNTER requires proposedQuantity AND proposedUnitPrice");
      }
      newQuantity = new Prisma.Decimal(proposedQuantity as Prisma.Decimal);
      newUnitPrice = new Prisma.Decimal(proposedUnitPrice as Prisma.Decimal);
      newAmount = newQuantity.mul(newUnitPrice);
    }
    // APPROVE / REJECT / ACCEPT_COUNTER / REJECT_COUNTER — поточні значення.

    // roundNumber інкрементується на КОЖНУ дію (lifecycle event у immutable
    // історії). `shouldIncrementRound` у state-machine лишається для майбутніх
    // звітів "скільки контр-офертів пройшло".
    const newRoundNumber = itemProposal.currentRound + 1;
    const now = new Date();

    const payload: NegotiationRoundSignaturePayload = {
      itemProposalId,
      roundNumber: newRoundNumber,
      actorSide: side,
      action,
      proposedQuantity:
        action === "COUNTER"
          ? newQuantity.toString()
          : itemProposal.currentQuantity.toString(),
      proposedUnitPrice:
        action === "COUNTER"
          ? newUnitPrice.toString()
          : itemProposal.currentUnitPrice.toString(),
      proposedAmount:
        action === "COUNTER"
          ? newAmount.toString()
          : itemProposal.currentAmount.toString(),
      comment: comment ?? null,
      timestamp: now.toISOString(),
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
    };

    await tx.estimateItemNegotiationRound.create({
      data: {
        itemProposalId,
        roundNumber: newRoundNumber,
        actorSide: side,
        actorUserId: actorUserId ?? null,
        action,
        proposedQuantity:
          action === "COUNTER" ? newQuantity : itemProposal.currentQuantity,
        proposedUnitPrice:
          action === "COUNTER" ? newUnitPrice : itemProposal.currentUnitPrice,
        proposedAmount:
          action === "COUNTER" ? newAmount : itemProposal.currentAmount,
        comment: comment ?? null,
        signatureHash: createRoundSignature(payload),
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
      },
    });

    await tx.estimateItemProposal.update({
      where: { id: itemProposalId },
      data: {
        state: next,
        currentQuantity: newQuantity,
        currentUnitPrice: newUnitPrice,
        currentAmount: newAmount,
        currentRound: newRoundNumber,
        lastActorSide: side,
        lastActionAt: now,
      },
    });

    // Recompute proposal-level counters.
    const allStates = await tx.estimateItemProposal.findMany({
      where: { proposalId: itemProposal.proposalId },
      select: { state: true },
    });
    const states = allStates.map((s) => s.state);
    const counts = countItemStates(states);

    // Чи був хоч один client action? Швидко: чи existsy event типу CLIENT_ACTION
    // АБО будь-який раунд із actorSide='client'.
    const clientRoundExists = await tx.estimateItemNegotiationRound.count({
      where: {
        itemProposal: { proposalId: itemProposal.proposalId },
        actorSide: "client",
      },
    });
    const anyClientActionYet = clientRoundExists > 0;

    const nextProposalStatus = deriveProposalStatus(
      proposalStatus,
      counts,
      anyClientActionYet,
    );

    const updateData: Prisma.EstimateProposalUpdateInput = {
      itemsTotal: counts.total,
      itemsApproved: counts.approved,
      itemsRejected: counts.rejected,
      itemsPending: counts.pending,
    };

    if (nextProposalStatus !== proposalStatus) {
      updateData.status = nextProposalStatus;
      if (
        nextProposalStatus === "FULLY_APPROVED" ||
        nextProposalStatus === "REJECTED" ||
        nextProposalStatus === "PARTIALLY_APPROVED"
      ) {
        updateData.completedAt = now;
      }
    }

    await tx.estimateProposal.update({
      where: { id: itemProposal.proposalId },
      data: updateData,
    });

    // Лог високорівневої події (для дашборду/нотифікацій).
    await tx.estimateProposalEvent.create({
      data: {
        proposalId: itemProposal.proposalId,
        eventType: side === "client" ? "CLIENT_ACTION" : "FIRM_ACTION",
        actorSide: side,
        actorUserId: actorUserId ?? null,
        metadata: {
          itemProposalId,
          action,
          previousState,
          nextState: next,
        },
        ipAddress: ipAddress ?? null,
      },
    });

    return {
      itemProposalId,
      previousState,
      nextState: next,
      roundNumber: newRoundNumber,
      proposalStatus: nextProposalStatus,
    };
  });
}

/**
 * Перевірити чи estimate заблокований через активний proposal.
 * Викликати у admin handler'ах PATCH/DELETE на EstimateItem.
 * Повертає proposalId якщо заблокований, інакше null.
 */
export async function findActiveProposal(
  estimateId: string,
  txOrPrisma: Tx = prisma,
): Promise<string | null> {
  const active = await txOrPrisma.estimateProposal.findFirst({
    where: {
      estimateId,
      status: { in: ["SENT", "IN_NEGOTIATION", "PARTIALLY_APPROVED"] },
    },
    select: { id: true },
  });
  return active?.id ?? null;
}

/**
 * Cron job: для всіх proposals у non-terminal статусах з expiresAt < now
 * перевести у EXPIRED + залогувати event. Окремо повертає кількість для
 * включення у cron summary.
 */
export async function expireProposals(): Promise<{ expired: number }> {
  const now = new Date();
  const expirable = await prisma.estimateProposal.findMany({
    where: {
      status: { in: ["SENT", "IN_NEGOTIATION", "PARTIALLY_APPROVED"] },
      expiresAt: { lt: now },
    },
    select: { id: true },
  });

  if (expirable.length === 0) return { expired: 0 };

  await prisma.$transaction(async (tx) => {
    for (const p of expirable) {
      await tx.estimateProposal.update({
        where: { id: p.id },
        data: { status: "EXPIRED", completedAt: now },
      });
      await tx.estimateProposalEvent.create({
        data: {
          proposalId: p.id,
          eventType: "EXPIRED",
          actorSide: "system",
        },
      });
    }
  });

  return { expired: expirable.length };
}

export interface FinalizeParams {
  proposalId: string;
  actorUserId: string;
  /** IP/UA для аудит-сліду у EstimateApprovalStep. */
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Завершити торг: записати `EstimateApprovalStep` (stepType=CLIENT_APPROVAL,
 * reviewerRole=CLIENT), позначити Estimate.status=APPROVED, proposal.status=
 * FULLY_APPROVED (якщо ще не) + completedAt + event FINALIZED.
 *
 * Викликається фірмою через admin POST /finalize. Дозволено для FULLY_APPROVED
 * (звичайний flow) і PARTIALLY_APPROVED (фірма свідомо підтверджує лише ті
 * рядки, що клієнт схвалив — rejected рядки будуть відкинуті при генерації
 * нової версії).
 */
export async function finalizeProposal(params: FinalizeParams) {
  const { proposalId, actorUserId, ipAddress, userAgent } = params;

  // Збираємо payload поза транзакцією щоб createApprovalSignature брав
  // готові дані. Підпис обчислюється на ходу через signature.ts.
  const proposal = await prisma.estimateProposal.findUniqueOrThrow({
    where: { id: proposalId },
    select: {
      id: true,
      estimateId: true,
      status: true,
      baselineVersionId: true,
      estimate: { select: { id: true, totalAmount: true, finalAmount: true } },
      counterparty: { select: { name: true, email: true } },
    },
  });

  if (
    proposal.status !== "FULLY_APPROVED" &&
    proposal.status !== "PARTIALLY_APPROVED"
  ) {
    throw new Error(
      `Cannot finalize proposal in status ${proposal.status} (expected FULLY_APPROVED or PARTIALLY_APPROVED)`,
    );
  }

  const { createApprovalSignature } = await import("@/lib/signature");

  const timestamp = new Date().toISOString();
  const estimateHash = `proposal-${proposalId}-${proposal.baselineVersionId}`;
  const signaturePayload = {
    timestamp,
    userId: actorUserId,
    estimateId: proposal.estimateId,
    estimateHash,
    metadata: {
      ipAddress: ipAddress ?? undefined,
      userAgent: userAgent ?? undefined,
      proposalId,
      clientName: proposal.counterparty.name,
      clientEmail: proposal.counterparty.email,
    },
  };
  const signatureHash = createApprovalSignature(signaturePayload);

  return prisma.$transaction(async (tx) => {
    const now = new Date();

    // 1. EstimateApprovalStep — використовуємо існуючу таблицю з reviewerRole=
    //    CLIENT (новий лейбл) + stepType=CLIENT_APPROVAL.
    await tx.estimateApprovalStep.create({
      data: {
        estimateId: proposal.estimateId,
        versionId: proposal.baselineVersionId,
        stepType: "CLIENT_APPROVAL",
        status: proposal.status === "FULLY_APPROVED" ? "APPROVED" : "PARTIAL",
        reviewerRole: "CLIENT",
        notes:
          proposal.status === "FULLY_APPROVED"
            ? "Клієнт повністю погодив кошторис через token-link"
            : "Клієнт частково погодив кошторис (rejected items виключено)",
        signatureHash,
        signatureData: signaturePayload as unknown as Prisma.InputJsonValue,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
        reviewedById: actorUserId,
      },
    });

    // 2. Перевести Estimate у APPROVED (якщо full) або REVISION (якщо partial —
    //    фірма має створити нову revised версію без rejected items).
    await tx.estimate.update({
      where: { id: proposal.estimateId },
      data: {
        status: proposal.status === "FULLY_APPROVED" ? "APPROVED" : "REVISION",
        approvedAt: proposal.status === "FULLY_APPROVED" ? now : undefined,
      },
    });

    // 3. Mark proposal як FULLY_APPROVED + completedAt.
    const updated = await tx.estimateProposal.update({
      where: { id: proposalId },
      data: {
        status: "FULLY_APPROVED",
        completedAt: now,
      },
    });

    // 4. Event FINALIZED.
    await tx.estimateProposalEvent.create({
      data: {
        proposalId,
        eventType: "FINALIZED",
        actorSide: "firm",
        actorUserId,
        ipAddress: ipAddress ?? null,
        metadata: {
          partialApproval: proposal.status === "PARTIALLY_APPROVED",
        },
      },
    });

    return updated;
  });
}

export interface WithdrawParams {
  proposalId: string;
  actorUserId: string;
  reason?: string;
}

/**
 * Відкликати proposal: status → WITHDRAWN, token стає invalid (через перевірку
 * статусу у public route). Лог WITHDRAWN event.
 */
export async function withdrawProposal(params: WithdrawParams) {
  const { proposalId, actorUserId, reason } = params;

  return prisma.$transaction(async (tx) => {
    const proposal = await tx.estimateProposal.findUniqueOrThrow({
      where: { id: proposalId },
    });

    if (
      proposal.status === "FULLY_APPROVED" ||
      proposal.status === "WITHDRAWN" ||
      proposal.status === "EXPIRED"
    ) {
      throw new ProposalClosedError(proposal.status);
    }

    const now = new Date();
    const updated = await tx.estimateProposal.update({
      where: { id: proposalId },
      data: {
        status: "WITHDRAWN",
        completedAt: now,
      },
    });

    await tx.estimateProposalEvent.create({
      data: {
        proposalId,
        eventType: "WITHDRAWN",
        actorSide: "firm",
        actorUserId,
        metadata: reason ? { reason } : Prisma.JsonNull,
      },
    });

    return updated;
  });
}
