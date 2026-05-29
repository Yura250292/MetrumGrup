import { prisma } from "@/lib/prisma";

import { notifyUsers } from "./create";

/**
 * Notification orchestrator для EstimateProposal.
 *
 * Дзеркало `change-order-events.ts` — fire-and-forget, ніколи не throws
 * (catch усередині), щоб не валити transactional core.
 *
 * Внутрішні нотифікації (PM + estimate creator + finance reviewer) — через
 * notifyUsers. Outbound клієнту (email + Telegram) — у Phase 4 окремий модуль.
 */

async function resolveProposalRecipients(
  proposalId: string,
): Promise<{ projectId: string; recipients: Set<string>; actorId: string }> {
  const proposal = await prisma.estimateProposal.findUnique({
    where: { id: proposalId },
    select: {
      id: true,
      createdById: true,
      estimate: {
        select: {
          createdById: true,
          financeReviewedById: true,
          engineerReviewedById: true,
          project: {
            select: {
              id: true,
              managerId: true,
            },
          },
        },
      },
    },
  });
  if (!proposal) {
    return { projectId: "", recipients: new Set(), actorId: "" };
  }

  const recipients = new Set<string>();
  if (proposal.estimate.createdById) recipients.add(proposal.estimate.createdById);
  if (proposal.estimate.project.managerId)
    recipients.add(proposal.estimate.project.managerId);
  if (proposal.estimate.financeReviewedById)
    recipients.add(proposal.estimate.financeReviewedById);
  if (proposal.estimate.engineerReviewedById)
    recipients.add(proposal.estimate.engineerReviewedById);

  return {
    projectId: proposal.estimate.project.id,
    recipients,
    actorId: proposal.createdById,
  };
}

/**
 * Клієнт уперше відкрив посилання. Спрацьовує один раз (orchestrator не дублює —
 * markProposalViewed викликається лише при isFirstView).
 */
export async function notifyProposalViewed(opts: {
  proposalId: string;
}): Promise<void> {
  try {
    const { recipients, actorId } = await resolveProposalRecipients(opts.proposalId);
    if (recipients.size === 0) return;
    await notifyUsers({
      userIds: Array.from(recipients),
      actorId, // client-side action — actor неактуальний, але notifyUsers вимагає
      type: "ESTIMATE_PROPOSAL_VIEWED",
      title: "Клієнт переглянув кошторис",
      relatedEntity: "EstimateProposal",
      relatedId: opts.proposalId,
      skipActor: false,
    });
  } catch {
    // ignore — нотифікації не повинні валити основну дію
  }
}

/**
 * Клієнт виконав дію по рядку (APPROVE/REJECT/COUNTER).
 *
 * Debounce у 60 секунд для avoid-spam: якщо у proposal вже є подія
 * CLIENT_ACTION у останні 60s — пропускаємо нотифікацію (sumарне CLIENT_ACTION
 * залогується у событиях, нотифікація одна на batch).
 */
export async function notifyClientAction(opts: {
  proposalId: string;
  itemDescription: string;
  action: string;
}): Promise<void> {
  try {
    const sinceMs = Date.now() - 60_000;
    const recentNotification = await prisma.notification.findFirst({
      where: {
        type: "ESTIMATE_PROPOSAL_CLIENT_ACTION",
        relatedEntity: "EstimateProposal",
        relatedId: opts.proposalId,
        createdAt: { gte: new Date(sinceMs) },
      },
      select: { id: true },
    });
    if (recentNotification) return;

    const { recipients, actorId } = await resolveProposalRecipients(opts.proposalId);
    if (recipients.size === 0) return;
    await notifyUsers({
      userIds: Array.from(recipients),
      actorId,
      type: "ESTIMATE_PROPOSAL_CLIENT_ACTION",
      title: "Клієнт відповів по кошторису",
      body: `${opts.action} — ${opts.itemDescription}`,
      relatedEntity: "EstimateProposal",
      relatedId: opts.proposalId,
      skipActor: false,
    });
  } catch {
    // ignore
  }
}

export async function notifyFullyApproved(opts: {
  proposalId: string;
}): Promise<void> {
  try {
    const { recipients, actorId } = await resolveProposalRecipients(opts.proposalId);
    if (recipients.size === 0) return;
    await notifyUsers({
      userIds: Array.from(recipients),
      actorId,
      type: "ESTIMATE_PROPOSAL_FULLY_APPROVED",
      title: "Клієнт повністю погодив кошторис",
      relatedEntity: "EstimateProposal",
      relatedId: opts.proposalId,
      skipActor: false,
    });
  } catch {
    // ignore
  }
}

export async function notifyRejected(opts: {
  proposalId: string;
}): Promise<void> {
  try {
    const { recipients, actorId } = await resolveProposalRecipients(opts.proposalId);
    if (recipients.size === 0) return;
    await notifyUsers({
      userIds: Array.from(recipients),
      actorId,
      type: "ESTIMATE_PROPOSAL_REJECTED",
      title: "Кошторис повністю відхилено",
      relatedEntity: "EstimateProposal",
      relatedId: opts.proposalId,
      skipActor: false,
    });
  } catch {
    // ignore
  }
}
