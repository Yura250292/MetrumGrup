/**
 * Integration test: повний flow estimate proposal від створення до finalize.
 *
 * Запуск:
 *   DATABASE_URL=postgresql://admin@localhost:5432/metrum_local \
 *     npx tsx scripts/test-estimate-proposal-flow.ts
 *
 * НЕ запускати на prod — створює і видаляє реальні рядки. Локальна БД only.
 *
 * Покриває:
 *   1. createProposal → 3 EstimateItemProposal + PROPOSE rounds
 *   2. markProposalSent → SENT
 *   3. markProposalViewed → firstViewedAt stamped
 *   4. client APPROVE item 1 → CLIENT_APPROVED + counters update
 *   5. client COUNTER item 2 → CLIENT_COUNTERED, нові цифри
 *   6. firm ACCEPT_COUNTER item 2 → CLIENT_APPROVED
 *   7. client REJECT item 3 → CLIENT_REJECTED → status PARTIALLY_APPROVED
 *   8. Optimistic concurrency: stale expectedRound → StaleRoundError
 *   9. Invalid transition: client APPROVE на CLIENT_APPROVED → InvalidTransitionError
 *  10. finalizeProposal → EstimateApprovalStep created, estimate.status=REVISION
 *      (бо partial)
 *  11. expireProposals (на новому prop із expiresAt минулого) → status=EXPIRED
 *  12. findActiveProposal lock guard поведінка
 */

import { PrismaClient } from "@prisma/client";

import {
  applyItemAction,
  createProposal,
  expireProposals,
  finalizeProposal,
  findActiveProposal,
  markProposalSent,
  markProposalViewed,
  ProposalClosedError,
  StaleRoundError,
} from "../src/lib/estimates/proposals";
import { InvalidTransitionError } from "../src/lib/estimates/proposal-state-machine";

const prisma = new PrismaClient();

const TEST_PREFIX = "proposal-flow-test-";

function unique(suffix: string) {
  return `${TEST_PREFIX}${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error("✗ ASSERTION FAILED:", msg);
    throw new Error(`Assertion failed: ${msg}`);
  }
  console.log("✓", msg);
}

async function setup() {
  const url = process.env.DATABASE_URL || "";
  if (!url.includes("localhost") && !url.includes("127.0.0.1")) {
    throw new Error(
      `Refusing to run integration test against non-localhost DB: ${url}`,
    );
  }

  // Reuse default firm (припускаємо що metrum-group уже є у localhost від
  // db:push baseline). Якщо ні — створюємо.
  let firm = await prisma.firm.findUnique({ where: { id: "metrum-group" } });
  if (!firm) {
    firm = await prisma.firm.create({
      data: {
        id: "metrum-group",
        slug: "metrum-group",
        name: "Metrum Group (test)",
        isDefault: true,
      },
    });
  }

  const user = await prisma.user.create({
    data: {
      email: unique("admin") + "@test.local",
      password: "x",
      name: "Test Admin",
      role: "MANAGER",
      firmId: firm.id,
    },
  });

  const counterparty = await prisma.counterparty.create({
    data: {
      name: unique("client"),
      type: "LEGAL",
      roles: ["CLIENT"],
      firmId: firm.id,
      email: "client@example.com",
    },
  });

  const project = await prisma.project.create({
    data: {
      title: unique("project"),
      slug: unique("slug"),
      firmId: firm.id,
      clientCounterpartyId: counterparty.id,
    },
  });

  const estimate = await prisma.estimate.create({
    data: {
      number: unique("EST"),
      title: "Тестовий кошторис",
      projectId: project.id,
      createdById: user.id,
      status: "DRAFT",
      totalAmount: 0,
      finalAmount: 0,
    },
  });

  const items = await Promise.all(
    [
      { description: "Бетон М300", unit: "м³", quantity: 10, unitPrice: 3000 },
      { description: "Арматура А500", unit: "кг", quantity: 500, unitPrice: 35 },
      { description: "Опалубка", unit: "м²", quantity: 80, unitPrice: 250 },
    ].map((d, i) =>
      prisma.estimateItem.create({
        data: {
          description: d.description,
          unit: d.unit,
          quantity: d.quantity,
          unitPrice: d.unitPrice,
          amount: d.quantity * d.unitPrice,
          sortOrder: i,
          estimateId: estimate.id,
        },
      }),
    ),
  );

  return { firm, user, counterparty, project, estimate, items };
}

async function cleanup(ids: { userId: string; counterpartyId: string; projectId: string }) {
  // Каскади на Estimate/Project/Counterparty приберуть proposal/items/rounds.
  await prisma.project.delete({ where: { id: ids.projectId } });
  await prisma.counterparty.delete({ where: { id: ids.counterpartyId } });
  await prisma.user.delete({ where: { id: ids.userId } });
}

async function main() {
  const ctx = await setup();
  const { user, counterparty, estimate, items } = ctx;
  console.log("Setup OK:", { estimateId: estimate.id, items: items.length });

  try {
    // 1. createProposal
    const proposal = await createProposal({
      estimateId: estimate.id,
      firmId: ctx.firm.id,
      counterpartyId: counterparty.id,
      emailSnapshot: "client@example.com",
      createdById: user.id,
    });
    await assert(proposal.status === "DRAFT", "proposal created у DRAFT");

    const ips = await prisma.estimateItemProposal.findMany({
      where: { proposalId: proposal.id },
      orderBy: { estimateItem: { sortOrder: "asc" } },
    });
    await assert(ips.length === 3, "3 EstimateItemProposal створено");
    await assert(
      ips.every((p) => p.state === "PENDING" && p.currentRound === 0),
      "Усі items у PENDING з round 0",
    );

    const proposeRounds = await prisma.estimateItemNegotiationRound.count({
      where: { itemProposalId: { in: ips.map((p) => p.id) } },
    });
    await assert(proposeRounds === 3, "3 PROPOSE rounds (round 0)");

    // 2. markProposalSent
    const sent = await markProposalSent({ proposalId: proposal.id });
    await assert(sent.status === "SENT", "після send → SENT");
    await assert(sent.expiresAt !== null, "default expiresAt виставлений");

    // 3. markProposalViewed
    await markProposalViewed({ proposalId: proposal.id, ipAddress: "1.2.3.4" });
    const afterView = await prisma.estimateProposal.findUniqueOrThrow({
      where: { id: proposal.id },
    });
    await assert(afterView.firstViewedAt !== null, "firstViewedAt stamped");

    // 4. client APPROVE item 0
    const a1 = await applyItemAction({
      itemProposalId: ips[0].id,
      side: "client",
      action: "APPROVE",
      expectedRound: 0,
    });
    await assert(a1.nextState === "CLIENT_APPROVED", "item 0 → CLIENT_APPROVED");
    await assert(
      a1.proposalStatus === "IN_NEGOTIATION",
      "proposal → IN_NEGOTIATION після першої client дії",
    );

    // 5. client COUNTER item 1
    const a2 = await applyItemAction({
      itemProposalId: ips[1].id,
      side: "client",
      action: "COUNTER",
      expectedRound: 0,
      proposedQuantity: 500,
      proposedUnitPrice: 30,
      comment: "Дешевше у Епіцентрі",
    });
    await assert(a2.nextState === "CLIENT_COUNTERED", "item 1 → CLIENT_COUNTERED");
    const item1After = await prisma.estimateItemProposal.findUniqueOrThrow({
      where: { id: ips[1].id },
    });
    await assert(
      Number(item1After.currentUnitPrice) === 30 &&
        Number(item1After.currentAmount) === 15_000,
      "item 1 нові цифри: 500 × 30 = 15000",
    );

    // 6. firm ACCEPT_COUNTER item 1
    const a3 = await applyItemAction({
      itemProposalId: ips[1].id,
      side: "firm",
      action: "ACCEPT_COUNTER",
      expectedRound: 1,
      actorUserId: user.id,
    });
    await assert(a3.nextState === "CLIENT_APPROVED", "item 1 → CLIENT_APPROVED після firm accept");

    // 7. client REJECT item 2
    const a4 = await applyItemAction({
      itemProposalId: ips[2].id,
      side: "client",
      action: "REJECT",
      expectedRound: 0,
    });
    await assert(a4.nextState === "CLIENT_REJECTED", "item 2 → CLIENT_REJECTED");
    await assert(
      a4.proposalStatus === "PARTIALLY_APPROVED",
      "proposal → PARTIALLY_APPROVED (2 approved, 1 rejected)",
    );

    // 8. Optimistic concurrency: stale round
    let staleError: unknown = null;
    try {
      await applyItemAction({
        itemProposalId: ips[0].id,
        side: "client",
        action: "REJECT",
        expectedRound: 99,
      });
    } catch (e) {
      staleError = e;
    }
    await assert(
      staleError instanceof StaleRoundError,
      "StaleRoundError при невірному expectedRound",
    );

    // 9. Invalid transition
    let invalidError: unknown = null;
    try {
      await applyItemAction({
        itemProposalId: ips[0].id,
        side: "client",
        action: "APPROVE",
        expectedRound: 1,
      });
    } catch (e) {
      invalidError = e;
    }
    await assert(
      invalidError instanceof InvalidTransitionError,
      "InvalidTransitionError на дії з terminal стану",
    );

    // 10. finalizeProposal
    const finalized = await finalizeProposal({
      proposalId: proposal.id,
      actorUserId: user.id,
      ipAddress: "1.2.3.4",
    });
    await assert(
      finalized.status === "FULLY_APPROVED" && finalized.completedAt !== null,
      "proposal → FULLY_APPROVED + completedAt",
    );

    const approvalStep = await prisma.estimateApprovalStep.findFirst({
      where: { estimateId: estimate.id, stepType: "CLIENT_APPROVAL" },
    });
    await assert(
      approvalStep !== null && approvalStep.reviewerRole === "CLIENT",
      "EstimateApprovalStep створений з stepType=CLIENT_APPROVAL, reviewerRole=CLIENT",
    );

    const updatedEstimate = await prisma.estimate.findUniqueOrThrow({
      where: { id: estimate.id },
    });
    await assert(
      updatedEstimate.status === "REVISION",
      "estimate.status → REVISION (бо PARTIALLY_APPROVED)",
    );

    // 11. Acting on closed proposal
    let closedError: unknown = null;
    try {
      await applyItemAction({
        itemProposalId: ips[0].id,
        side: "client",
        action: "REJECT",
        expectedRound: 1,
      });
    } catch (e) {
      closedError = e;
    }
    await assert(
      closedError instanceof ProposalClosedError,
      "ProposalClosedError на closed proposal",
    );

    // 12. Lock guard — після FULLY_APPROVED active proposal зник.
    const stillActive = await findActiveProposal(estimate.id);
    await assert(
      stillActive === null,
      "findActiveProposal === null після фіналізації",
    );

    // 13. expireProposals (створюємо окремий proposal з expiresAt у минулому)
    //     Spec: тільки non-terminal зі статусом IN_NEGOTIATION/SENT/PARTIALLY_APPROVED
    //     можуть expirити. Створюємо новий proposal через схожий шлях.
    const newEstimate = await prisma.estimate.create({
      data: {
        number: unique("EST2"),
        title: "Test estimate 2 (for expiry)",
        projectId: ctx.project.id,
        createdById: user.id,
        status: "DRAFT",
        totalAmount: 0,
        finalAmount: 0,
      },
    });
    await prisma.estimateItem.create({
      data: {
        description: "Dummy",
        unit: "шт",
        quantity: 1,
        unitPrice: 1,
        amount: 1,
        estimateId: newEstimate.id,
      },
    });
    const p2 = await createProposal({
      estimateId: newEstimate.id,
      firmId: ctx.firm.id,
      counterpartyId: counterparty.id,
      emailSnapshot: "client@example.com",
      createdById: user.id,
      expiresAt: new Date(Date.now() - 1000), // expired in past
    });
    await markProposalSent({
      proposalId: p2.id,
      expiresAt: new Date(Date.now() - 1000),
    });
    const expRes = await expireProposals();
    await assert(expRes.expired >= 1, "expireProposals минуле expiresAt → expired");
    const p2After = await prisma.estimateProposal.findUniqueOrThrow({
      where: { id: p2.id },
    });
    await assert(p2After.status === "EXPIRED", "p2 → EXPIRED");

    console.log("\n✅ ALL TESTS PASSED");
  } finally {
    await cleanup({
      userId: user.id,
      counterpartyId: counterparty.id,
      projectId: ctx.project.id,
    });
    await prisma.$disconnect();
  }
}

main().catch(async (err) => {
  console.error("FAILED:", err);
  await prisma.$disconnect();
  process.exit(1);
});
