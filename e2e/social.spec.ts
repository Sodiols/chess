import { Chess } from "chess.js";
import { expect, test, type Browser, type Page } from "@playwright/test";

const accounts = ["A", "B", "C"].map((letter) => ({
  email: process.env[`E2E_USER_${letter}_EMAIL`],
  password: process.env[`E2E_USER_${letter}_PASSWORD`],
}));
test.skip(!process.env.E2E_BASE_URL || accounts.some(({ email, password }) => !email || !password),
  "Requires three confirmed accounts on a test Supabase project with the social migrations.");

async function signIn(browser: Browser, index: number) {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login?next=/profile");
  await page.getByLabel("Email").fill(accounts[index]!.email!);
  await page.getByLabel("Password", { exact: true }).fill(accounts[index]!.password!);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/profile");
  await expect(page.getByRole("heading", { name: "Account settings" })).toBeVisible({ timeout: 20_000 });
  const username = await page.getByRole("heading", { level: 1 }).innerText();
  await page.getByRole("switch", { name: "Allow friends to spectate my games" }).check({ force: true });
  await page.getByRole("switch", { name: "Allow spectators in ranked matches" }).check({ force: true });
  await page.getByRole("button", { name: "Save privacy settings" }).click();
  await expect(page.getByText("Privacy settings saved.")).toBeVisible();
  return { page, username };
}

async function connectFriends(sender: Page, senderName: string, receiver: Page, receiverName: string) {
  await sender.goto(`/u/${receiverName}`);
  await expect(sender.getByRole("heading", { level: 1, name: receiverName })).toBeVisible();
  const action = sender.getByRole("button", { name: /Add friend|Remove friend|Cancel request|Accept/ }).first();
  await expect(action).toBeVisible();
  const label = await action.innerText();
  if (label === "Remove friend") return;
  if (label === "Accept") {
    await action.click();
    await expect(sender.getByRole("button", { name: "Remove friend" })).toBeVisible();
    return;
  }
  if (label === "Add friend") await action.click();
  await receiver.goto(`/u/${senderName}`);
  await receiver.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(receiver.getByRole("button", { name: "Remove friend" })).toBeVisible();
}

async function resign(page: Page) {
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("button", { name: "Resign", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Resign", exact: true }).click();
}

test("friends accept a ranked room invitation and a third account watches with the password", async ({ browser }) => {
  test.setTimeout(120_000);
  const host = await signIn(browser, 0);
  const guest = await signIn(browser, 1);
  const viewer = await signIn(browser, 2);
  await connectFriends(host.page, host.username, guest.page, guest.username);
  await connectFriends(host.page, host.username, viewer.page, viewer.username);

  await host.page.goto(`/play/rooms?invite=${guest.username}`);
  await host.page.getByLabel("Password", { exact: true }).fill("spectator-e2e");
  await host.page.getByRole("switch", { name: /^Allow spectators/ }).check({ force: true });
  await host.page.getByText("More options", { exact: true }).click();
  await host.page.getByRole("radio", { name: "White", exact: true }).check({ force: true });
  await host.page.getByRole("button", { name: "Create room", exact: true }).click();
  await host.page.getByRole("region", { name: "Invite friends" }).getByRole("button", { name: "Invite", exact: true }).click();
  await guest.page.goto("/friends");
  await guest.page.getByText(`View invitation from ${host.username}`).click();
  await guest.page.getByLabel("Room password").fill("spectator-e2e");
  await guest.page.getByRole("button", { name: "Accept and join" }).click();
  await Promise.all([host.page.waitForURL(/\/game\//), guest.page.waitForURL(/\/game\//)]);

  await viewer.page.goto(`/u/${host.username}`);
  await viewer.page.getByRole("link", { name: "Spectate", exact: true }).click();
  const password = viewer.page.getByRole("dialog", { name: "Enter Room Password" });
  await password.getByLabel("Room Password").fill("incorrect");
  await password.getByRole("button", { name: "Watch Match" }).click();
  await expect(password.getByText("Invalid room password.")).toBeVisible();
  await password.getByLabel("Room Password").fill("spectator-e2e");
  await password.getByRole("button", { name: "Watch Match" }).click();
  await expect(viewer.page.getByRole("region", { name: "Live chessboard" })).toBeVisible();
  await expect(viewer.page.getByRole("button", { name: "Resign" })).toHaveCount(0);

  const chess = new Chess();
  for (const san of ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "Nf6"]) {
    const mover = chess.turn() === "w" ? host.page : guest.page;
    const { from, to } = chess.move(san);
    await mover.locator(`[data-square="${from}"]`).click();
    await mover.locator(`[data-square="${to}"]`).click();
    await expect(viewer.page.locator(`[data-square="${to}"]`)).toHaveAttribute("aria-label", /last move/);
  }
  await resign(guest.page);
  await expect(host.page.getByRole("dialog").getByText(/\+\d+ rating/)).toBeVisible({ timeout: 15_000 });
  await expect(viewer.page.getByText(`${host.username} wins`, { exact: true })).toBeVisible({ timeout: 15_000 });

  const anonymous = await (await browser.newContext()).newPage();
  await anonymous.goto(`/u/${host.username}`);
  await expect(anonymous.getByRole("heading", { name: "Competitive record" })).toBeVisible();
  await expect(anonymous.getByText(accounts[0]!.email!, { exact: true })).toHaveCount(0);
});

test("a friend watches confirmed moves and the result of a ranked random match", async ({ browser }) => {
  test.setTimeout(100_000);
  const a = await signIn(browser, 0);
  const b = await signIn(browser, 1);
  const spectator = await signIn(browser, 2);
  await connectFriends(a.page, a.username, spectator.page, spectator.username);
  for (const { page } of [a,b]) {
    await page.goto("/play/online");
    await page.getByRole("radio", { name: /30 min/ }).check({ force: true });
  }
  await a.page.getByRole("button", { name: /Find opponent/i }).click();
  await expect(a.page.getByRole("heading", { name: "Searching for an opponent…" })).toBeVisible();
  await b.page.getByRole("button", { name: /Find opponent/i }).click();
  await Promise.all([a.page.waitForURL(/\/game\//), b.page.waitForURL(/\/game\//)]);
  await spectator.page.goto(`/u/${a.username}`);
  await spectator.page.getByRole("link", { name: "Spectate", exact: true }).click();
  await expect(spectator.page.getByRole("region", { name: "Live chessboard" })).toBeVisible();
  const aWhite = await a.page.getByText(`${a.username} (you)`, { exact:true }).first().locator("..").getByText("White", { exact:true }).count();
  const white = aWhite ? a : b;
  const black = aWhite ? b : a;
  await white.page.locator('[data-square="e2"]').click();
  await white.page.locator('[data-square="e4"]').click();
  await expect(spectator.page.getByRole("button", { name: /^White pawn on e4/ })).toBeVisible();
  await resign(black.page);
  await expect(white.page.getByRole("dialog").getByText(/\+\d+ rating/)).toBeVisible({ timeout: 15_000 });
  await expect(spectator.page.getByText(`${white.username} wins`, { exact:true })).toBeVisible();
});
