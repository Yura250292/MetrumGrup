import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { slugify } from "@/lib/utils";
import { auditLog } from "@/lib/audit";
import { addProjectMember } from "@/lib/projects/members-service";
import { peekNextProjectCode } from "@/lib/projects/generate-code";
import { withRetryOnUniqueViolation } from "@/lib/change-orders/numbering";
import { seedProjectTaskDefaults } from "@/lib/tasks/defaults";
import {
  ensureProjectMirror,
  syncProjectBudgetEntry,
} from "@/lib/folders/mirror-service";
import {
  firmIdForNewEntity,
  firmWhereForProject,
  DEFAULT_FIRM_ID,
  isHomeFirmFor,
  getActiveRoleFromSession,
} from "@/lib/firm/scope";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";

// GET /api/admin/projects - List all projects
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  try {
    const { firmId } = await resolveFirmScopeForRequest(session);
    if (!isHomeFirmFor(session, firmId)) return forbiddenResponse();
    const activeRole = getActiveRoleFromSession(session, firmId);
    if (activeRole !== "SUPER_ADMIN" && activeRole !== "MANAGER") {
      return forbiddenResponse();
    }
    const projects = await prisma.project.findMany({
      // Hide:
      //  - AI-estimate scratch projects (slug temp-*)
      //  - Personal Inbox bakets (приватні бакети без проєкту)
      // Scoped by firm: studio managers see only their firm's projects.
      where: {
        slug: { not: { startsWith: "temp-" } },
        personalInboxUserId: null,
        ...firmWhereForProject(firmId),
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        client: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json({ data: projects });
  } catch (error) {
    console.error("Error fetching projects:", error);
    return NextResponse.json(
      { error: "Помилка завантаження проєктів" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  // Home-firm guard + per-firm role.
  const { firmId: activeFirmId } = await resolveFirmScopeForRequest(session);
  if (!isHomeFirmFor(session, activeFirmId)) return forbiddenResponse();
  const activeRole = getActiveRoleFromSession(session, activeFirmId);
  if (activeRole !== "SUPER_ADMIN" && activeRole !== "MANAGER") {
    return forbiddenResponse();
  }

  const body = await request.json();
  const {
    title,
    description,
    address,
    type,
    clientId,
    clientCounterpartyId,
    clientName: clientNameRaw,
    managerId,
    managerName: managerNameRaw,
    authorName: authorNameRaw,
    totalBudget,
    startDate,
    expectedEndDate,
    mergeFinanceFolderId,
  } = body;

  // Клієнт може бути заданий одним із трьох способів: legacy User-CLIENT,
  // Counterparty FK або просто текстове імʼя. Хоча б один із них обовʼязковий.
  const clientNameTrim =
    typeof clientNameRaw === "string" ? clientNameRaw.trim() : "";
  let resolvedCounterpartyName: string | null = null;
  if (clientCounterpartyId) {
    const cp = await prisma.counterparty.findUnique({
      where: { id: String(clientCounterpartyId) },
      select: { id: true, name: true, firmId: true },
    });
    if (!cp) {
      return NextResponse.json({ error: "Контрагент не існує" }, { status: 400 });
    }
    if (cp.firmId && activeFirmId && cp.firmId !== activeFirmId) {
      return NextResponse.json(
        { error: "Контрагент належить іншій фірмі" },
        { status: 400 },
      );
    }
    resolvedCounterpartyName = cp.name;
  }

  if (!title || (!clientId && !clientCounterpartyId && !clientNameTrim)) {
    return NextResponse.json(
      { error: "Назва та клієнт (імʼя, контрагент або користувач) обовʼязкові" },
      { status: 400 },
    );
  }

  // Generate unique slug
  let slug = slugify(title);
  const existing = await prisma.project.findUnique({ where: { slug } });
  if (existing) {
    slug = `${slug}-${Date.now().toString(36)}`;
  }

  // Stamp firmId на основі АКТИВНОЇ фірми (cookie/session), а не home firm.
  // Юрій (SUPER_ADMIN, home=Group) створює проект на Studio → проект у Studio.
  // shymilo93 (home=Group) на Studio → теж Studio (per-firm role дозволяє).
  const projectFirmId =
    activeFirmId ?? firmIdForNewEntity(session, DEFAULT_FIRM_ID);

  // clientName зберігаємо завжди (snapshot для швидкого рендеру).
  // Пріоритет: явне ім'я з форми → snapshot контрагента → null (якщо лише
  // legacy User-CLIENT — UI підхопить через project.client.name).
  const clientNameToStore =
    clientNameTrim || resolvedCounterpartyName || null;

  // Менеджер: якщо managerId є — snapshot його імені; інакше беремо
  // managerName (free-text для штатного працівника без User-акаунту).
  let managerNameToStore: string | null = null;
  const managerNameTrim =
    typeof managerNameRaw === "string" ? managerNameRaw.trim() : "";
  if (managerId) {
    const u = await prisma.user.findUnique({
      where: { id: String(managerId) },
      select: { name: true },
    });
    managerNameToStore = u?.name ?? (managerNameTrim || null);
  } else if (managerNameTrim) {
    managerNameToStore = managerNameTrim;
  }

  const authorNameToStore =
    typeof authorNameRaw === "string" && authorNameRaw.trim()
      ? authorNameRaw.trim()
      : null;

  // Auto-генерація PRJ-YYYY-NNN атомарно у транзакції з create.
  // P2002 на code → retry (race-safe).
  const typeTrim = typeof type === "string" && type.trim() ? type.trim() : null;
  const project = await withRetryOnUniqueViolation(() =>
    prisma.$transaction(async (tx) => {
      const code = await peekNextProjectCode(tx, projectFirmId);
      return tx.project.create({
        data: {
          title,
          slug,
          code,
          // Новий проект завжди стартує як DRAFT — без кошторису/етапів.
          // Перехід у ACTIVE — лише через POST .../activate (із замороженим планом).
          status: "DRAFT",
          type: typeTrim,
          description: description || null,
          address: address || null,
          clientId: clientId || null,
          clientCounterpartyId: clientCounterpartyId || null,
          clientName: clientNameToStore,
          managerId: managerId || null,
          managerName: managerNameToStore,
          authorName: authorNameToStore,
          firmId: projectFirmId,
          totalBudget: totalBudget || 0,
          startDate: startDate ? new Date(startDate) : null,
          expectedEndDate: expectedEndDate ? new Date(expectedEndDate) : null,
          // Дефолтні етапи більше не створюються — користувач сам додає те, що
          // йому потрібно (раніше юзери змушені були вручну видаляти всі 7 етапів).
        },
        include: { stages: true },
      });
    }),
  );

  // Auto-add manager as PROJECT_MANAGER member
  if (project.managerId) {
    try {
      await addProjectMember({
        projectId: project.id,
        userId: project.managerId,
        roleInProject: "PROJECT_MANAGER",
        invitedById: session.user.id,
      });
    } catch (err) {
      console.error("Failed to auto-add manager as project member:", err);
    }
  }

  // Seed default task statuses & labels for the new project. Idempotent.
  // Failure is non-fatal — feature-flag gate means tasks may be disabled anyway.
  try {
    await seedProjectTaskDefaults(project.id);
  } catch (err) {
    console.error("Failed to seed project task defaults:", err);
  }

  // Mirror project into FINANCE folder tree + seed plan-budget entry.
  // Якщо вибрано існуючу папку для merge — приєднуємо її замість створення нової
  // (її FinanceEntry автоматично потрапляють під цей проект через folderId).
  try {
    await ensureProjectMirror(project.id, undefined, {
      linkExistingFolderId:
        typeof mergeFinanceFolderId === "string" && mergeFinanceFolderId
          ? mergeFinanceFolderId
          : null,
    });
    await syncProjectBudgetEntry(project.id, session.user.id);
  } catch (err) {
    console.error("Failed to sync project mirror/budget:", err);
  }

  await auditLog({
    userId: session.user.id,
    action: "CREATE",
    entity: "Project",
    entityId: project.id,
    projectId: project.id,
    newData: { title, clientId },
  });

  return NextResponse.json({ data: project }, { status: 201 });
}
