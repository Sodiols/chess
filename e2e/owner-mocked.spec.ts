import { expect, test } from "@playwright/test";
import { DEFAULT_SECRET_SETTINGS } from "../lib/secret/settings";

test("the Owner Coach UI saves preferences and renders real engine analysis", async ({ page, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  test.skip(!["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname),
    "Runs only against a local app with isolated auth and API responses.");

  const accountId = "d157f0b5-34a9-440e-ab51-5e681dc56d8d";
  const token = "mock-owner-token";
  await page.addInitScript(({ accountId, token }) => {
    localStorage.setItem("gambit:auth", JSON.stringify({
      access_token: token,
      refresh_token: "mock-refresh-token",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: accountId, email: "owner@example.test", user_metadata: { username: "coach-owner" } },
    }));
  }, { accountId, token });

  let owner = false;
  let settings = { ...DEFAULT_SECRET_SETTINGS, enabled: false };
  let saves = 0;
  await page.routeWebSocket(/.*/, (socket) => socket.close());
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === "/api/owner") {
      expect(request.headers().authorization).toBe(`Bearer ${token}`);
      if (!owner) return route.fulfill({ json: { ok: true, owner: false } });
      if (request.method() === "POST") {
        settings = request.postDataJSON().settings;
        saves++;
      }
      return route.fulfill({ json: { ok: true, owner: true, settings } });
    }
    if (url.pathname.startsWith("/api/")) return route.fulfill({ status: 401, json: { ok: false, error: "unauthorized" } });
    return route.continue();
  });

  await page.goto("/analysis");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  owner = true;
  await page.reload();
  await expect(page.getByText(/Secret Mode is off/)).toBeVisible();
  await page.getByRole("button", { name: "Game settings" }).click();
  const enable = page.getByRole("switch", { name: "Enable Secret Mode" });
  await expect(enable).toBeEnabled();
  await page.getByText("Enable Secret Mode", { exact: true }).click();
  await expect(enable).toBeChecked();
  expect(saves).toBe(1);
  await page.keyboard.press("Escape");

  const coach = page.getByRole("region", { name: "Engine coach" }).filter({ visible: true });
  await expect(coach.getByText(/depth [1-9]/)).toBeVisible({ timeout: 30_000 });
  await expect(coach.getByRole("button", { name: "Re-run" })).toBeVisible({ timeout: 35_000 });
  await page.getByRole("button", { name: "White pawn on e2" }).click();
  await page.getByRole("button", { name: "e4, empty" }).click();
  await expect(page.getByRole("button", { name: "White pawn on e4" })).toBeVisible();
  await page.reload();
  await expect(coach).toBeVisible();
});
