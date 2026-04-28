import { PrismaClient, ProjectStage } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const STAGE_ORDER: ProjectStage[] = [
  "DESIGN",
  "FOUNDATION",
  "WALLS",
  "ROOF",
  "ENGINEERING",
  "FINISHING",
  "HANDOVER",
];

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PRODUCTION_SEED !== "true") {
    throw new Error(
      "Seed blocked in production. Set ALLOW_PRODUCTION_SEED=true to override (will WIPE all data)."
    );
  }

  console.log("🌱 Seeding database...");

  // Clean existing data
  await prisma.auditLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.photoReportImage.deleteMany();
  await prisma.photoReport.deleteMany();
  await prisma.completionAct.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.estimateItem.deleteMany();
  await prisma.estimateSection.deleteMany();
  await prisma.estimate.deleteMany();
  await prisma.projectFile.deleteMany();
  await prisma.crewAssignment.deleteMany();
  await prisma.inventoryTransaction.deleteMany();
  await prisma.inventoryItem.deleteMany();
  await prisma.equipment.deleteMany();
  await prisma.projectStageRecord.deleteMany();
  await prisma.project.deleteMany();
  await prisma.worker.deleteMany();
  await prisma.warehouse.deleteMany();
  await prisma.material.deleteMany();
  await prisma.laborRate.deleteMany();
  await prisma.newsArticle.deleteMany();
  await prisma.portfolioProject.deleteMany();
  await prisma.page.deleteMany();
  await prisma.setting.deleteMany();
  await prisma.user.deleteMany();

  // ============================================
  // FIRMS — окремі юр.особи (Metrum Group, Metrum Studio)
  // ============================================
  await prisma.firm.upsert({
    where: { id: "metrum-group" },
    create: {
      id: "metrum-group",
      slug: "metrum-group",
      name: "Metrum Group",
      isDefault: true,
    },
    update: {},
  });
  await prisma.firm.upsert({
    where: { id: "metrum-studio" },
    create: {
      id: "metrum-studio",
      slug: "metrum-studio",
      name: "Metrum Studio",
      isDefault: false,
    },
    update: {},
  });
  console.log("✅ Firms upserted: metrum-group, metrum-studio");

  const passwordHash = await bcrypt.hash("password123", 10);

  // ============================================
  // USERS
  // ============================================
  const admin = await prisma.user.create({
    data: {
      email: "admin@metrum.group",
      password: passwordHash,
      name: "Олександр Петренко",
      phone: "+380501234567",
      role: "SUPER_ADMIN",
      firmId: "metrum-group",
    },
  });

  const manager = await prisma.user.create({
    data: {
      email: "manager@metrum.group",
      password: passwordHash,
      name: "Ірина Коваленко",
      phone: "+380671234567",
      role: "MANAGER",
      firmId: "metrum-group",
    },
  });

  const client1 = await prisma.user.create({
    data: {
      email: "client@example.com",
      password: passwordHash,
      name: "Андрій Шевченко",
      phone: "+380931234567",
      role: "CLIENT",
      firmId: "metrum-group",
    },
  });

  const client2 = await prisma.user.create({
    data: {
      email: "client2@example.com",
      password: passwordHash,
      name: "Марина Бондаренко",
      phone: "+380961234567",
      role: "CLIENT",
      firmId: "metrum-group",
    },
  });

  // Опційний dev-користувач: керівник Metrum Studio (для локального тестування scope-у)
  if (process.env.SEED_DEV_USERS === "true") {
    await prisma.user.create({
      data: {
        email: "studio@metrum.dev",
        password: passwordHash,
        name: "Керівник студії дизайну",
        phone: "+380501110011",
        role: "MANAGER",
        firmId: "metrum-studio",
        jobTitle: "Керівник студії дизайну та ремонту інтерʼєрів",
      },
    });
    console.log("✅ Dev studio director created (SEED_DEV_USERS=true)");
  }

  console.log("✅ Users created");

  // ============================================
  // FINANCE STRUCTURAL FOLDERS (idempotent)
  // ============================================
  const SEED_FINANCE_FOLDERS: Array<{
    id: string;
    name: string;
    slug: string;
    parentSlug: string | null;
    sortOrder: number;
  }> = [
    { id: "fld_sys_general_expenses", name: "Загальні витрати", slug: "general-expenses",  parentSlug: null,              sortOrder: 0 },
    { id: "fld_sys_company_expenses", name: "Постійні витрати", slug: "company-expenses",  parentSlug: "general-expenses", sortOrder: 0 },
    { id: "fld_sys_variable_expenses", name: "Змінні витрати",  slug: "variable-expenses", parentSlug: "general-expenses", sortOrder: 1 },
    { id: "fld_sys_office_expenses",  name: "Витрати офісу",    slug: "office-expenses",   parentSlug: "general-expenses", sortOrder: 2 },
    { id: "fld_sys_office_fixed",     name: "Постійні",         slug: "office-fixed",      parentSlug: "office-expenses", sortOrder: 0 },
    { id: "fld_sys_office_variable",  name: "Змінні",           slug: "office-variable",   parentSlug: "office-expenses", sortOrder: 1 },
  ];

  const seedFolderBySlug = new Map<string, string>();
  for (const f of SEED_FINANCE_FOLDERS) {
    const parentId = f.parentSlug ? seedFolderBySlug.get(f.parentSlug) ?? null : null;
    const row = await prisma.folder.upsert({
      where: { domain_slug: { domain: "FINANCE", slug: f.slug } },
      update: { name: f.name, parentId, sortOrder: f.sortOrder, isSystem: true },
      create: {
        id: f.id,
        domain: "FINANCE",
        name: f.name,
        slug: f.slug,
        parentId,
        sortOrder: f.sortOrder,
        isSystem: true,
      },
    });
    seedFolderBySlug.set(f.slug, row.id);
  }

  console.log("✅ Finance structural folders seeded");

  // ============================================
  // PROJECTS
  // ============================================
  const project1 = await prisma.project.create({
    data: {
      title: "Будинок на Липовій, 15",
      slug: "budynok-lypova-15",
      description: "Будівництво приватного будинку 180 м² з гаражем та терасою",
      address: "м. Київ, вул. Липова, 15",
      status: "ACTIVE",
      currentStage: "WALLS",
      stageProgress: 45,
      totalBudget: 2500000,
      totalPaid: 1100000,
      startDate: new Date("2025-09-01"),
      expectedEndDate: new Date("2026-08-01"),
      clientId: client1.id,
      managerId: manager.id,
    },
  });

  // Stages for project1
  for (let i = 0; i < STAGE_ORDER.length; i++) {
    const stage = STAGE_ORDER[i];
    let status: "COMPLETED" | "IN_PROGRESS" | "PENDING";
    let progress = 0;
    let startDate: Date | null = null;
    let endDate: Date | null = null;

    if (i < 2) {
      status = "COMPLETED";
      progress = 100;
      startDate = new Date(2025, 8 + i, 1);
      endDate = new Date(2025, 9 + i, 15);
    } else if (i === 2) {
      status = "IN_PROGRESS";
      progress = 60;
      startDate = new Date(2025, 11, 1);
    } else {
      status = "PENDING";
    }

    await prisma.projectStageRecord.create({
      data: {
        projectId: project1.id,
        stage,
        status,
        progress,
        startDate,
        endDate,
        sortOrder: i,
        notes: status === "IN_PROGRESS" ? "Зведення несучих стін, монтаж перемичок" : null,
      },
    });
  }

  const project2 = await prisma.project.create({
    data: {
      title: "Ремонт квартири на Хрещатику",
      slug: "remont-khreschatyk",
      description: "Капітальний ремонт 3-кімнатної квартири 95 м²",
      address: "м. Київ, вул. Хрещатик, 42, кв. 18",
      status: "ACTIVE",
      currentStage: "FINISHING",
      stageProgress: 75,
      totalBudget: 850000,
      totalPaid: 600000,
      startDate: new Date("2025-06-15"),
      expectedEndDate: new Date("2026-03-15"),
      clientId: client1.id,
      managerId: manager.id,
    },
  });

  for (let i = 0; i < STAGE_ORDER.length; i++) {
    const stage = STAGE_ORDER[i];
    let status: "COMPLETED" | "IN_PROGRESS" | "PENDING";
    let progress = 0;

    if (i < 5) {
      status = "COMPLETED";
      progress = 100;
    } else if (i === 5) {
      status = "IN_PROGRESS";
      progress = 40;
    } else {
      status = "PENDING";
    }

    await prisma.projectStageRecord.create({
      data: {
        projectId: project2.id,
        stage,
        status,
        progress,
        sortOrder: i,
      },
    });
  }

  const project3 = await prisma.project.create({
    data: {
      title: "Котедж у Буче",
      slug: "kotedzh-bucha",
      description: "Будівництво котеджу 250 м² з басейном",
      address: "м. Буча, вул. Садова, 7",
      status: "DRAFT",
      currentStage: "DESIGN",
      stageProgress: 10,
      totalBudget: 4200000,
      totalPaid: 420000,
      startDate: new Date("2026-04-01"),
      expectedEndDate: new Date("2027-06-01"),
      clientId: client2.id,
      managerId: manager.id,
    },
  });

  for (let i = 0; i < STAGE_ORDER.length; i++) {
    await prisma.projectStageRecord.create({
      data: {
        projectId: project3.id,
        stage: STAGE_ORDER[i],
        status: i === 0 ? "IN_PROGRESS" : "PENDING",
        progress: i === 0 ? 30 : 0,
        sortOrder: i,
        notes: i === 0 ? "Розробка архітектурного проєкту та кошторису" : null,
      },
    });
  }

  console.log("✅ Projects & stages created");

  // ============================================
  // PAYMENTS
  // ============================================
  const paymentData = [
    { projectId: project1.id, amount: 500000, scheduledDate: new Date("2025-09-01"), status: "PAID" as const, paidDate: new Date("2025-08-30"), notes: "Авансовий платіж" },
    { projectId: project1.id, amount: 300000, scheduledDate: new Date("2025-11-01"), status: "PAID" as const, paidDate: new Date("2025-10-28"), notes: "Фундамент" },
    { projectId: project1.id, amount: 300000, scheduledDate: new Date("2026-01-15"), status: "PAID" as const, paidDate: new Date("2026-01-14"), notes: "Стіни - частина 1" },
    { projectId: project1.id, amount: 400000, scheduledDate: new Date("2026-04-01"), status: "PENDING" as const, notes: "Дах" },
    { projectId: project1.id, amount: 500000, scheduledDate: new Date("2026-06-01"), status: "PENDING" as const, notes: "Інженерія + Оздоблення" },
    { projectId: project1.id, amount: 500000, scheduledDate: new Date("2026-08-01"), status: "PENDING" as const, notes: "Фінальний розрахунок" },
    { projectId: project2.id, amount: 250000, scheduledDate: new Date("2025-06-15"), status: "PAID" as const, paidDate: new Date("2025-06-14") },
    { projectId: project2.id, amount: 200000, scheduledDate: new Date("2025-09-01"), status: "PAID" as const, paidDate: new Date("2025-09-02") },
    { projectId: project2.id, amount: 150000, scheduledDate: new Date("2025-12-01"), status: "PAID" as const, paidDate: new Date("2025-11-30") },
    { projectId: project2.id, amount: 250000, scheduledDate: new Date("2026-03-15"), status: "PENDING" as const, notes: "Фінальний розрахунок" },
  ];

  for (const p of paymentData) {
    await prisma.payment.create({
      data: {
        ...p,
        method: "BANK_TRANSFER",
        createdById: manager.id,
      },
    });
  }

  console.log("✅ Payments created");

  // ============================================
  // COMPLETION ACTS
  // ============================================
  await prisma.completionAct.create({
    data: {
      projectId: project1.id,
      number: "001",
      title: "Акт виконаних робіт — Фундамент",
      description: "Земляні роботи, заливка фундаменту, гідроізоляція",
      amount: 450000,
      signedByClient: true,
      signedAt: new Date("2025-11-20"),
    },
  });

  await prisma.completionAct.create({
    data: {
      projectId: project1.id,
      number: "002",
      title: "Акт виконаних робіт — Стіни (частина 1)",
      description: "Кладка зовнішніх несучих стін першого поверху",
      amount: 280000,
      signedByClient: false,
    },
  });

  console.log("✅ Completion acts created");

  // ============================================
  // PHOTO REPORTS
  // ============================================
  const photoReport1 = await prisma.photoReport.create({
    data: {
      projectId: project1.id,
      title: "Прогрес зведення стін",
      description: "Завершено кладку зовнішніх стін першого поверху. Розпочато кладку внутрішніх перегородок.",
      stage: "WALLS",
      createdById: manager.id,
    },
  });

  // Placeholder images
  for (let i = 1; i <= 4; i++) {
    await prisma.photoReportImage.create({
      data: {
        photoReportId: photoReport1.id,
        url: `https://placehold.co/800x600/e2e8f0/64748b?text=Стіни+${i}`,
        thumbnailUrl: `https://placehold.co/200x150/e2e8f0/64748b?text=Стіни+${i}`,
        caption: `Зведення стін — фото ${i}`,
        sortOrder: i,
      },
    });
  }

  const photoReport2 = await prisma.photoReport.create({
    data: {
      projectId: project1.id,
      title: "Завершення фундаменту",
      description: "Фундамент повністю залито. Гідроізоляція виконана.",
      stage: "FOUNDATION",
      createdById: manager.id,
    },
  });

  for (let i = 1; i <= 3; i++) {
    await prisma.photoReportImage.create({
      data: {
        photoReportId: photoReport2.id,
        url: `https://placehold.co/800x600/d4edda/155724?text=Фундамент+${i}`,
        thumbnailUrl: `https://placehold.co/200x150/d4edda/155724?text=Фундамент+${i}`,
        caption: `Фундамент — фото ${i}`,
        sortOrder: i,
      },
    });
  }

  console.log("✅ Photo reports created");

  // ============================================
  // MATERIALS (Price DB)
  // ============================================
  const materials = [
    { name: "Цегла керамічна М-100", sku: "BRK-001", category: "Стінові матеріали", unit: "шт", basePrice: 12.50, laborRate: 3.00, markup: 15 },
    { name: "Газоблок 600x200x300", sku: "GAS-001", category: "Стінові матеріали", unit: "шт", basePrice: 85.00, laborRate: 15.00, markup: 12 },
    { name: "Цемент М-500 (мішок 50кг)", sku: "CEM-001", category: "В'яжучі", unit: "мішок", basePrice: 195.00, laborRate: 0, markup: 10 },
    { name: "Пісок річковий", sku: "SND-001", category: "Інертні", unit: "м³", basePrice: 650.00, laborRate: 0, markup: 8 },
    { name: "Щебінь 5-20 мм", sku: "GRV-001", category: "Інертні", unit: "м³", basePrice: 850.00, laborRate: 0, markup: 8 },
    { name: "Арматура А500С ø12мм", sku: "RBR-001", category: "Металопрокат", unit: "тонн", basePrice: 28000.00, laborRate: 3500.00, markup: 10 },
    { name: "Бетон B25 (М350)", sku: "CON-001", category: "Бетон", unit: "м³", basePrice: 3200.00, laborRate: 800.00, markup: 12 },
    { name: "Дошка обрізна 50x150 мм", sku: "WOD-001", category: "Пиломатеріали", unit: "м³", basePrice: 8500.00, laborRate: 1200.00, markup: 15 },
    { name: "Металочерепиця Monterrey", sku: "ROF-001", category: "Покрівля", unit: "м²", basePrice: 320.00, laborRate: 180.00, markup: 12 },
    { name: "Утеплювач мінвата 100мм", sku: "INS-001", category: "Ізоляція", unit: "м²", basePrice: 180.00, laborRate: 45.00, markup: 10 },
    { name: "Гіпсокартон 12.5мм", sku: "DRY-001", category: "Оздоблення", unit: "лист", basePrice: 215.00, laborRate: 80.00, markup: 10 },
    { name: "Шпаклівка фінішна (мішок 25кг)", sku: "PUT-001", category: "Оздоблення", unit: "мішок", basePrice: 320.00, laborRate: 0, markup: 10 },
  ];

  for (const m of materials) {
    await prisma.material.create({ data: m });
  }

  console.log("✅ Materials created");

  // ============================================
  // LABOR RATES
  // ============================================
  const laborRates = [
    { name: "Кладка цегли", category: "Стіни", unit: "м³", ratePerUnit: 1800.00 },
    { name: "Кладка газоблоку", category: "Стіни", unit: "м³", ratePerUnit: 1200.00 },
    { name: "Заливка бетону", category: "Бетонні роботи", unit: "м³", ratePerUnit: 800.00 },
    { name: "Армування", category: "Бетонні роботи", unit: "тонн", ratePerUnit: 12000.00 },
    { name: "Штукатурка стін", category: "Оздоблення", unit: "м²", ratePerUnit: 220.00 },
    { name: "Шпаклювання", category: "Оздоблення", unit: "м²", ratePerUnit: 120.00 },
    { name: "Монтаж покрівлі", category: "Покрівля", unit: "м²", ratePerUnit: 350.00 },
    { name: "Електромонтаж", category: "Інженерія", unit: "точка", ratePerUnit: 650.00 },
    { name: "Сантехніка", category: "Інженерія", unit: "точка", ratePerUnit: 800.00 },
  ];

  for (const lr of laborRates) {
    await prisma.laborRate.create({ data: lr });
  }

  console.log("✅ Labor rates created");

  // ============================================
  // NOTIFICATIONS
  // ============================================
  await prisma.notification.createMany({
    data: [
      {
        userId: client1.id,
        type: "PHOTO_REPORT",
        title: "Новий фотозвіт",
        body: 'Менеджер додав фотозвіт до проєкту "Будинок на Липовій, 15"',
        relatedEntity: "PhotoReport",
        relatedId: photoReport1.id,
      },
      {
        userId: client1.id,
        type: "PAYMENT_REMINDER",
        title: "Нагадування про платіж",
        body: "Наступний платіж 400 000 ₴ запланований на 01.04.2026",
        relatedEntity: "Payment",
      },
      {
        userId: client1.id,
        type: "STAGE_UPDATE",
        title: "Оновлення етапу",
        body: 'Етап "Стіни" досяг 60% виконання',
        relatedEntity: "Project",
        relatedId: project1.id,
      },
    ],
  });

  console.log("✅ Notifications created");

  // ============================================
  // SETTINGS
  // ============================================
  await prisma.setting.createMany({
    data: [
      { id: "company_name", value: "Metrum Group" },
      { id: "company_phone", value: "+380441234567" },
      { id: "company_email", value: "info@metrum.group" },
      { id: "overhead_rate", value: 15 },
    ],
  });

  console.log("✅ Settings created");
  console.log("\n🎉 Seed completed!");
  console.log("\n📋 Test accounts:");
  console.log("  Admin:   admin@metrum.group / password123");
  console.log("  Manager: manager@metrum.group / password123");
  console.log("  Client:  client@example.com / password123");
  console.log("  Client2: client2@example.com / password123");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
