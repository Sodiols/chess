import { expect, test } from "@playwright/test";

const email = process.env.E2E_OWNER_EMAIL;
const password = process.env.E2E_OWNER_PASSWORD;
test.skip(!process.env.E2E_BASE_URL || !email || !password,
  "Requires a confirmed owner account on a separate test project and E2E_OWNER_EMAIL/PASSWORD.");

test("the authorized owner enables the coach and sees real Stockfish analysis", async ({ page }) => {
  test.setTimeout(70_000);
  await page.goto("/login?next=/analysis");
  await page.getByLabel("Email").fill(email!);
  await page.getByLabel("Password", { exact: true }).fill(password!);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL(/\/analysis$/);
  await page.getByRole("button", { name: "Game settings" }).click();
  const enable = page.getByRole("switch", { name: "Enable Secret Mode" });
  await expect(enable).toBeAttached({ timeout: 20_000 });
  const wasEnabled = await enable.isChecked();
  if (!wasEnabled) {
    await page.getByText("Enable Secret Mode", { exact: true }).click();
    await expect(enable).toBeChecked();
  }
  await page.keyboard.press("Escape");
  try {
    const coach = page.getByRole("region", { name: "Engine coach" }).filter({ visible: true });
    await expect(coach.getByText(/depth [1-9]/)).toBeVisible({ timeout: 30_000 });
    await expect(coach.getByRole("button", { name: "Re-run" })).toBeVisible({ timeout: 35_000 });
    await expect(page.getByRole("button", { name: "White pawn on e2" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("region", { name: "Engine coach" }).filter({ visible: true })).toBeVisible({ timeout: 20_000 });
  } finally {
    if (!wasEnabled) {
      await page.getByRole("button", { name: "Game settings" }).click();
      await page.getByText("Enable Secret Mode", { exact: true }).click();
      await expect(page.getByRole("switch", { name: "Enable Secret Mode" })).not.toBeChecked();
    }
  }
});
