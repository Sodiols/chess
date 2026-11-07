import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * Two isolated browser contexts are two different guests. They matchmake into
 * one game, exchange moves through the real server, and one resigns. Needs a
 * running app on a TEST Supabase project with anonymous sign-ins enabled.
 */
test.skip(!process.env.E2E_BASE_URL, "Set E2E_BASE_URL to run against a test Supabase project");

async function guest(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/play/online");
  await expect(page.getByText("Playing as")).toBeVisible({ timeout: 20_000 });
  // An unusual control keeps this pair away from anyone else in the queue.
  await page.getByRole("radio", { name: /30 min/ }).check({ force: true });
  return page;
}

async function isWhite(page: Page): Promise<boolean> {
  const me = page.locator("div", { hasText: /\(you\)/ }).filter({ hasText: /White|Black/ }).last();
  return (await me.innerText()).includes("White");
}

test("two guests play a live game", async ({ browser }) => {
  const a = await guest(browser);
  const b = await guest(browser);

  await a.getByRole("button", { name: "Find opponent" }).click();
  await expect(a.getByText("Searching for opponent…")).toBeVisible();
  await b.getByRole("button", { name: "Find opponent" }).click();

  await a.waitForURL(/\/game\//, { timeout: 30_000 });
  await b.waitForURL(/\/game\//, { timeout: 30_000 });
  expect(new URL(a.url()).pathname).toBe(new URL(b.url()).pathname);

  const [white, black] = (await isWhite(a)) ? [a, b] : [b, a];
  expect(await isWhite(black)).toBe(false);

  // Black cannot move White's pieces.
  await black.getByRole("button", { name: "White pawn on e2" }).click();
  await black.getByRole("button", { name: "e4, empty" }).click();
  await expect(black.getByRole("button", { name: "White pawn on e2" })).toBeVisible();

  await white.getByRole("button", { name: "White pawn on e2" }).click();
  await white.getByRole("button", { name: "e4, empty" }).click();
  await expect(black.getByRole("button", { name: "White pawn on e4" })).toBeVisible({ timeout: 10_000 });

  await black.getByRole("button", { name: "Black pawn on e7" }).click();
  await black.getByRole("button", { name: "e5, empty" }).click();
  await expect(white.getByRole("button", { name: "Black pawn on e5" })).toBeVisible({ timeout: 10_000 });

  // A refresh restores the same position from the server.
  await white.reload();
  await expect(white.getByRole("button", { name: "Black pawn on e5" })).toBeVisible({ timeout: 20_000 });

  await black.getByRole("button", { name: "Menu" }).first().click();
  await black.getByRole("button", { name: "Resign" }).click();
  await black.getByRole("button", { name: "Resign" }).last().click();

  await expect(white.getByText(/Resignation/)).toBeVisible({ timeout: 10_000 });
  await expect(black.getByText(/Resignation/)).toBeVisible({ timeout: 10_000 });
});
