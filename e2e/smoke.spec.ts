import { test, expect, type Page } from "@playwright/test";

/**
 * Beta smoke pack — golden-path scenarios per BETA_READINESS_CHECKLIST P0.7.
 *
 * Setup (one-time):
 *   1. `npm run test:e2e:install`            — downloads Chromium
 *   2. `npm run db:seed-e2e`                 — idempotent test users + project
 *   3. `npm run dev` (or `npm run build && npm run start`)
 *   4. `npm run test:e2e`
 *
 * Env overrides:
 *   - BASE_URL              (default http://localhost:3000)
 *   - E2E_PASSWORD          (default ChangeMe!2026; must match seed)
 */

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

test.describe("Beta smoke — public surfaces", () => {
  test("login page renders", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator("body")).toBeVisible();
  });

  test("forgot-password page renders and submits", async ({ page }) => {
    await page.goto("/forgot-password");
    await expect(page.getByRole("heading", { name: /відновлення/i })).toBeVisible();
    await page.getByPlaceholder(/your@email|email/i).fill("nonexistent@example.com");
    await page.getByRole("button", { name: /надіслати/i }).click();
    // Response is the same whether the user exists or not (anti-enumeration).
    await expect(page.getByText(/якщо акаунт/i)).toBeVisible({ timeout: 5_000 });
  });

  test("public RFQ with invalid token returns 404", async ({ request }) => {
    const res = await request.get("/api/public/rfq/00000000000000000000000000000000");
    expect([400, 404]).toContain(res.status());
  });
});

test.describe("Beta smoke — authenticated MANAGER flows", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, "MANAGER");
  });

  test("dashboard loads", async ({ page }) => {
    await page.goto("/admin-v2");
    await expect(page).toHaveURL(/\/admin-v2/);
  });

  test("projects list reachable", async ({ page }) => {
    await page.goto("/admin-v2/projects");
    await expect(page).toHaveURL(/\/admin-v2\/projects/);
  });

  test("estimates list reachable", async ({ page }) => {
    await page.goto("/admin-v2/estimates");
    await expect(page).toHaveURL(/\/admin-v2\/estimates/);
  });

  test("RFI list reachable", async ({ page }) => {
    await page.goto("/admin-v2/rfis");
    await expect(page).toHaveURL(/\/admin-v2\/rfis/);
  });

  test("change orders list reachable", async ({ page }) => {
    await page.goto("/admin-v2/change-orders");
    await expect(page).toHaveURL(/\/admin-v2\/change-orders/);
  });

  test("counterparties list reachable", async ({ page }) => {
    await page.goto("/admin-v2/counterparties");
    await expect(page).toHaveURL(/\/admin-v2\/counterparties/);
  });

  test("procurement overview reachable", async ({ page }) => {
    await page.goto("/admin-v2/procurement");
    await expect(page.getByRole("heading", { name: /закупівлі/i })).toBeVisible();
  });
});

test.describe("Beta smoke — ACL enforcement", () => {
  test("admin API rejects unauthenticated requests", async ({ request }) => {
    const res = await request.get("/api/admin/projects");
    expect(res.status()).toBe(401);
  });

  test("CLIENT cannot view procurement", async ({ page }) => {
    await login(page, "CLIENT");
    const res = await page.request.get("/api/admin/purchase-requests");
    expect([401, 403]).toContain(res.status());
  });

  test("SUPER_ADMIN can view procurement", async ({ page }) => {
    await login(page, "SUPER_ADMIN");
    const res = await page.request.get("/api/admin/purchase-requests");
    expect(res.status()).toBe(200);
  });
});

test.describe("Beta smoke — TODO (require deeper seed)", () => {
  // These exercise mutation flows; left as `.skip` until the seed inserts the
  // upstream rows (estimate, RFI, change order, RFQ with valid token).

  test.skip("create estimate → approve → move", async () => {});
  test.skip("sync estimate to financing", async () => {});
  test.skip("upload receipt → OCR → assign", async () => {});
  test.skip("create RFI → answer → close", async () => {});
  test.skip("create change order", async () => {});
  test.skip("supplier bid submit via public RFQ URL", async () => {});
});
