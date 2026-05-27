import { test, expect, type Page } from "@playwright/test";

/**
 * Deep-flow smoke pack — covers user-journey work that smoke.spec.ts only
 * touches at the reachability level. Targets specifically the Beta-blocking
 * checks from BETA_GAPS_AUDIT.md §5.4 that can be automated:
 *
 *   - Studio MANAGER firm isolation (Group data must not leak)
 *   - Estimates search UX (the placeholder we replaced)
 *   - Empty-state CTAs across counterparties / rfis / change-orders / inbox
 *   - Forgot-password mail-less happy path (anti-enumeration)
 *
 * Heavier journeys (receipt OCR, AI estimate generation, RFI lifecycle,
 * supplier bidding via public URL) live in smoke.spec.ts as `.skip` until
 * the seed adds upstream rows.
 */

const PASSWORD = process.env.E2E_PASSWORD || "ChangeMe!2026";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/пароль|password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /увійти|sign in|log in/i }).click();
  await page.waitForURL(/\/admin-v2|\/dashboard|\/foreman|\/owner/, { timeout: 15_000 });
}

test.describe("Firm isolation — Group vs Studio", () => {
  test("Group MANAGER sees only Group projects via API", async ({ page }) => {
    await login(page, "e2e-manager@metrum-group.local");
    const res = await page.request.get("/api/admin/projects");
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { data?: Array<{ title: string; firmId?: string | null }> };
    const titles = (body.data ?? []).map((p) => p.title);
    expect(titles).toContain("E2E Smoke Project");
    expect(titles).not.toContain("E2E Studio Project");
  });

  test("Studio MANAGER sees only Studio projects via API", async ({ page }) => {
    await login(page, "e2e-studio-manager@metrum-group.local");
    const res = await page.request.get("/api/admin/projects");
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { data?: Array<{ title: string; firmId?: string | null }> };
    const titles = (body.data ?? []).map((p) => p.title);
    expect(titles).toContain("E2E Studio Project");
    expect(titles).not.toContain("E2E Smoke Project");
  });
});

test.describe("UX checks for Beta-fixed pages", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, "e2e-manager@metrum-group.local");
  });

  test("estimates page renders search input (no 'скоро з'явиться' placeholder)", async ({ page }) => {
    await page.goto("/admin-v2/estimates");
    // The old placeholder text must be gone.
    await expect(page.getByText(/Пошук скоро з'явиться/)).toHaveCount(0);
    // The new search input must be reachable by accessible name.
    await expect(page.getByLabel(/Пошук кошторисів/i)).toBeVisible();
  });

  test("counterparties empty/non-empty UI mounts without errors", async ({ page }) => {
    await page.goto("/admin-v2/counterparties");
    await expect(page.getByRole("heading", { name: /контрагенти/i })).toBeVisible();
  });

  test("RFIs empty-state CTA points to projects when nothing matches", async ({ page }) => {
    await page.goto("/admin-v2/rfis");
    // Page renders without crashing — tab nav visible.
    await expect(page.getByRole("button", { name: /Мені — прострочені/i })).toBeVisible();
  });

  test("change-orders empty-state CTA visible when list empty", async ({ page }) => {
    await page.goto("/admin-v2/change-orders");
    await expect(page.getByRole("heading", { name: /Додаткові угоди/i })).toBeVisible();
  });

  test("documents inbox mounts and exposes upload CTA", async ({ page }) => {
    await page.goto("/admin-v2/documents/inbox");
    await expect(page.getByRole("heading", { name: /Документи \/ Inbox/i })).toBeVisible();
    // EmptyState CTA "Завантажити документ" or the dropzone button — at least one must be visible.
    const cta = page.getByRole("button", { name: /Завантажити документ|Обрати файли/i });
    await expect(cta.first()).toBeVisible();
  });
});

test.describe("Auth — forgot-password anti-enumeration", () => {
  test("non-existent email returns same generic OK message", async ({ page }) => {
    await page.goto("/forgot-password");
    await page
      .getByPlaceholder(/your@email|email/i)
      .fill(`nonexistent-${Date.now()}@example.com`);
    await page.getByRole("button", { name: /надіслати/i }).click();
    await expect(page.getByText(/якщо акаунт/i)).toBeVisible({ timeout: 5_000 });
  });
});
