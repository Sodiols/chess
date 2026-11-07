import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * Two registered accounts in two isolated browser contexts play through the
 * real server: a private room, then random matchmaking.
 *
 * Needs a running app on a TEST Supabase project (never production) with both
 * migrations applied, and two confirmed accounts created there beforehand:
 *   E2E_BASE_URL, E2E_USER_A_EMAIL, E2E_USER_A_PASSWORD, E2E_USER_B_EMAIL, E2E_USER_B_PASSWORD
 * The test creates no accounts and deletes nothing; it ends every game it starts.
 */
const env = process.env;
const accounts = [
  { email: env.E2E_USER_A_EMAIL, password: env.E2E_USER_A_PASSWORD },
  { email: env.E2E_USER_B_EMAIL, password: env.E2E_USER_B_PASSWORD },
];
test.skip(
  !env.E2E_BASE_URL || accounts.some((account) => !account.email || !account.password),
  "Set E2E_BASE_URL and the two E2E_USER_* accounts of a test Supabase project",
);

/** Server-rendered buttons ignore clicks until React attaches its handlers. */
async function hydrated(page: Page, selector: string) {
  await page.waitForFunction(
    (css) => {
      const element = document.querySelector(css);
      return Boolean(element && Object.keys(element).some((key) => key.startsWith("__reactProps")));
    },
    selector,
  );
}

async function logIn(browser: Browser, index: 0 | 1, path: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto(path);
  // Online pages send signed-out visitors to log in and back again.
  await page.waitForURL(/\/login\?next=/);
  await hydrated(page, "form button[type=submit]");
  await page.getByLabel("Email").fill(accounts[index]!.email!);
  await page.getByLabel("Password", { exact: true }).fill(accounts[index]!.password!);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL((url) => url.pathname === path);
  await expect(page.getByText("Playing as")).toBeVisible({ timeout: 20_000 });
  await resignLeftoverGame(page, path);
  return page;
}

/** A previous failed run may have left a game open; end it so this run can start one. */
async function resignLeftoverGame(page: Page, path: string) {
  const resume = page.getByRole("link", { name: "Resume game" }).first();
  if (!(await resume.isVisible())) return;
  await resume.click();
  await page.waitForURL(/\/game\//);
  await resign(page);
  await page.goto(path);
}

async function resign(page: Page) {
  await page.getByRole("button", { name: "Menu" }).first().click();
  await page.getByRole("button", { name: "Resign" }).click();
  await page.getByRole("button", { name: "Resign" }).last().click();
}

async function isWhite(page: Page): Promise<boolean> {
  const me = page.locator("div", { hasText: /\(you\)/ }).filter({ hasText: /White|Black/ }).last();
  return (await me.innerText()).includes("White");
}

async function playOpening(a: Page, b: Page) {
  await hydrated(a, "[data-square=e2]");
  await hydrated(b, "[data-square=e2]");
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
  return { white, black };
}

test("two accounts play through a password-protected room", async ({ browser }) => {
  const host = await logIn(browser, 0, "/play/rooms");
  const guest = await logIn(browser, 1, "/play/rooms");

  await host.getByLabel("Password", { exact: true }).fill("e2e-secret");
  await host.getByRole("button", { name: "Create room" }).click();
  await expect(host.getByText("Waiting for player to join…")).toBeVisible({ timeout: 15_000 });
  const code = (await host.locator("p.numeric").first().innerText()).trim();
  expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);

  // The room survives a refresh of the host's page.
  await host.reload();
  await expect(host.getByText(code)).toBeVisible({ timeout: 20_000 });

  // The guest sees it in the browser; a wrong password is refused.
  await guest.getByRole("button", { name: "Refresh rooms" }).click();
  const card = guest.locator("article", { hasText: code });
  await expect(card).toBeVisible({ timeout: 15_000 });
  await card.getByRole("button", { name: "Join" }).click();
  const dialog = guest.getByRole("dialog");
  await dialog.getByLabel("Room password").fill("not-it");
  await dialog.getByRole("button", { name: "Join room" }).click();
  await expect(dialog.getByText("Invalid room password.")).toBeVisible();
  await dialog.getByLabel("Room password").fill("e2e-secret");
  await dialog.getByRole("button", { name: "Join room" }).click();

  await host.waitForURL(/\/game\//, { timeout: 30_000 });
  await guest.waitForURL(/\/game\//, { timeout: 30_000 });
  expect(new URL(host.url()).pathname).toBe(new URL(guest.url()).pathname);

  const { white, black } = await playOpening(host, guest);
  await white.reload();
  await expect(white.getByRole("button", { name: "Black pawn on e5" })).toBeVisible({ timeout: 20_000 });

  await resign(black);
  await expect(white.getByText(/Resignation/)).toBeVisible({ timeout: 10_000 });
  await expect(black.getByText(/Resignation/)).toBeVisible({ timeout: 10_000 });
});

test("two accounts are paired by random matchmaking", async ({ browser }) => {
  const a = await logIn(browser, 0, "/play/online");
  const b = await logIn(browser, 1, "/play/online");
  // An unusual control keeps this pair away from anyone else in the queue.
  for (const page of [a, b]) await page.getByRole("radio", { name: /30 min/ }).check({ force: true });

  await a.getByRole("button", { name: "Find opponent" }).click();
  await expect(a.getByText("Searching for opponent…")).toBeVisible();
  await b.getByRole("button", { name: "Find opponent" }).click();

  await a.waitForURL(/\/game\//, { timeout: 30_000 });
  await b.waitForURL(/\/game\//, { timeout: 30_000 });
  expect(new URL(a.url()).pathname).toBe(new URL(b.url()).pathname);

  const { white, black } = await playOpening(a, b);
  await resign(white);
  await expect(black.getByText(/Resignation/)).toBeVisible({ timeout: 10_000 });

  // The finished game no longer blocks a new search.
  await black.goto("/play/online");
  await expect(black.getByRole("button", { name: "Find opponent" })).toBeEnabled({ timeout: 20_000 });
  await expect(black.getByText("You have a game in progress.", { exact: false })).toHaveCount(0);
});
