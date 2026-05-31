import { test, expect, type Page } from "@playwright/test";

const PASSWORD = process.env.E2E_PASSWORD || "ChangeMe!2026";

function userEmail(role: string): string {
  return `e2e-${role.toLowerCase()}@metrum-group.local`;
}

async function login(page: Page, role: string) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(userEmail(role));
  await page.getByLabel(/пароль|password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /увійти|sign in|log in/i }).click();
  await page.waitForURL(/\/admin-v2|\/dashboard|\/foreman|\/owner/, { timeout: 15_000 });
}

const DASHBOARD = "/admin-v2/dashboard-v2";

test.describe("dashboard-v2 — full layout (SUPER_ADMIN)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, "SUPER_ADMIN");
  });

  test("loads without runtime errors", async ({ page }) => {
    test.setTimeout(120_000);
    const pageErrors: string[] = [];
    const serverErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));
    page.on("response", (res) => {
      if (res.url().includes("/admin-v2/dashboard-v2") && res.status() >= 500) {
        serverErrors.push(`HTTP ${res.status()} on ${res.url()}`);
      }
    });
    // Long timeout because Next.js dev compiles the page on first request.
    await page.goto(DASHBOARD, { timeout: 90_000 });
    await expect(page).toHaveURL(/\/admin-v2\/dashboard-v2/);
    expect(pageErrors, "no client runtime errors").toEqual([]);
    expect(serverErrors, "no 5xx from dashboard").toEqual([]);
  });

  test("renders hero greeting + period badge", async ({ page }) => {
    await page.goto(DASHBOARD);
    await expect(
      page.getByRole("heading", { level: 1 }),
    ).toContainText(/Доброго|Доброї|Гарного/);
    // "Останні 30 днів" appears in PeriodBadge AND in CashflowPanel subtitle —
    // assert at least one is visible.
    await expect(page.getByText("Останні 30 днів").first()).toBeVisible();
  });

  test("renders 5-card KPI strip", async ({ page }) => {
    await page.goto(DASHBOARD);
    await expect(page.getByText("АКТИВНІ ПРОЄКТИ")).toBeVisible();
    await expect(page.getByText("БЮДЖЕТ У РОБОТІ")).toBeVisible();
    await expect(page.getByText("CASHFLOW · 30 ДНІВ")).toBeVisible();
    await expect(page.getByText("МАРЖА ПЛАН/ФАКТ")).toBeVisible();
    await expect(page.getByText("РИЗИКИ ВСЬОГО")).toBeVisible();
  });

  test("renders mini-metrics row with LIVE workers card", async ({ page }) => {
    await page.goto(DASHBOARD);
    await expect(page.getByText("Прострочених етапів")).toBeVisible();
    await expect(page.getByText("Звіти виконробів очікують")).toBeVisible();
    await expect(page.getByText("Відкритих RFI")).toBeVisible();
    await expect(page.getByText(/робітник/).first()).toBeVisible();
    await expect(page.getByText("LIVE").first()).toBeVisible();
  });

  test("renders cashflow chart", async ({ page }) => {
    await page.goto(DASHBOARD);
    await expect(
      page.getByRole("heading", { name: "Грошовий потік" }),
    ).toBeVisible();
    await expect(page.getByText("Надходження")).toBeVisible();
    await expect(page.getByText("Витрати").first()).toBeVisible();
    await expect(
      page.locator('svg[aria-label="Грошовий потік"]'),
    ).toBeVisible();
  });

  test("renders project margin panel", async ({ page }) => {
    await page.goto(DASHBOARD);
    await expect(
      page.getByRole("heading", { name: "Маржа по проєктах" }),
    ).toBeVisible();
    await expect(page.getByText("Топ 6 за бюджетом")).toBeVisible();
  });

  test("renders watchlist with deadline column", async ({ page }) => {
    await page.goto(DASHBOARD);
    await expect(
      page.getByRole("heading", { name: "Топ проєктів за активністю" }),
    ).toBeVisible();
    await expect(page.getByText("ДЕДЛАЙН")).toBeVisible();
  });

  test("renders today-live dark panel", async ({ page }) => {
    await page.goto(DASHBOARD);
    await expect(page.getByText("СЬОГОДНІ ПО ВСІХ ОБʼЄКТАХ")).toBeVisible();
    await expect(page.getByText("АКТИВНІ РОБОТИ ЗАРАЗ")).toBeVisible();
  });

  test("renders activity feed", async ({ page }) => {
    await page.goto(DASHBOARD);
    await expect(
      page.getByRole("heading", { name: "Активність по всіх проєктах" }),
    ).toBeVisible();
  });

  test("renders risks panel + quick actions", async ({ page }) => {
    await page.goto(DASHBOARD);
    await expect(
      page.getByRole("heading", { name: "Топ ризики компанії" }),
    ).toBeVisible();
    // Scope to QuickActions section to avoid clash with Topbar's "Новий проєкт" CTA.
    const quickActions = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Швидкі дії" }) });
    await expect(quickActions).toBeVisible();
    await expect(quickActions.getByText("Новий проєкт")).toBeVisible();
    await expect(quickActions.getByText("AI-кошторис")).toBeVisible();
    await expect(quickActions.getByText("Платіжний день")).toBeVisible();
  });
});

test.describe("dashboard-v2 — finance gating (MANAGER)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, "MANAGER");
  });

  test("MANAGER does not see finance blocks; non-finance blocks render", async ({
    page,
  }) => {
    await page.goto(DASHBOARD);
    // Finance-gated — should NOT be visible.
    await expect(page.getByText("CASHFLOW · 30 ДНІВ")).toHaveCount(0);
    await expect(page.getByText("МАРЖА ПЛАН/ФАКТ")).toHaveCount(0);
    await expect(page.getByText("БЮДЖЕТ У РОБОТІ")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Грошовий потік" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Маржа по проєктах" }),
    ).toHaveCount(0);
    // Non-finance blocks still render.
    await expect(page.getByText("АКТИВНІ ПРОЄКТИ")).toBeVisible();
    await expect(page.getByText("РИЗИКИ ВСЬОГО")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Активність по всіх проєктах" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Топ проєктів за активністю" }),
    ).toBeVisible();
  });
});
