import { expect, test, type Page } from "@playwright/test";

/**
 * Flows that need no account and change nothing in Supabase: route protection,
 * client-side form validation, and both offline modes. Runs against E2E_BASE_URL.
 */
test.skip(!process.env.E2E_BASE_URL, "Set E2E_BASE_URL to run end-to-end tests");

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

test("online pages send signed-out visitors to log in and keep the destination", async ({ page }) => {
  await page.goto("/play/rooms");
  await page.waitForURL(/\/login\?next=%2Fplay%2Frooms/);
  await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Create an account" })).toHaveAttribute("href", "/signup?next=%2Fplay%2Frooms");
});

test("sign-up explains every invalid field before contacting the server", async ({ page }) => {
  await page.goto("/signup");
  await hydrated(page, "form button[type=submit]");
  await page.getByLabel("Username").fill("a b");
  await page.getByLabel("Email").fill("not-an-email");
  await page.getByLabel("Password", { exact: true }).fill("short");
  await page.getByLabel("Confirm password", { exact: true }).fill("different");
  await page.getByRole("button", { name: "Create Account" }).click();
  await expect(page.getByText("Enter a valid email address.")).toBeVisible();
  await expect(page.getByText("Use at least 8 characters for your password.")).toBeVisible();
  await expect(page.getByText("The passwords don't match.")).toBeVisible();
});

test("an expired reset link is reported, with a way to get a new one", async ({ page }) => {
  await page.goto("/reset-password#error=access_denied&error_code=otp_expired&error_description=expired");
  await expect(page.getByRole("heading", { name: "Link not valid" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Request a new link" })).toHaveAttribute("href", "/forgot-password");
});

test("the computer answers a move without an account", async ({ page }) => {
  await page.goto("/play/computer");
  await hydrated(page, "form, button");
  await page.getByRole("radio", { name: "Beginner" }).check({ force: true });
  await page.getByRole("radio", { name: "White" }).check({ force: true });
  await page.getByRole("button", { name: "Play computer" }).click();
  await hydrated(page, "[data-square=e2]");
  await page.getByRole("button", { name: "White pawn on e2" }).click();
  await page.getByRole("button", { name: "e4, empty" }).click();
  await expect(page.getByRole("button", { name: "White pawn on e4" })).toBeVisible();
  // Some black piece has moved off its starting square once the computer replies.
  await expect
    .poll(async () => page.getByRole("button", { name: /^Black (pawn|knight) on [a-h][3-6]/ }).count(), { timeout: 15_000 })
    .toBeGreaterThan(0);
});

test("two players alternate on one device", async ({ page }) => {
  await page.goto("/play/local");
  await hydrated(page, "button");
  await page.getByRole("button", { name: "Start game" }).click();
  await hydrated(page, "[data-square=e2]");
  await page.getByRole("button", { name: "White pawn on e2" }).click();
  await page.getByRole("button", { name: "e4, empty" }).click();
  // White can't move twice in a row.
  await page.getByRole("button", { name: "White pawn on d2" }).click();
  await page.getByRole("button", { name: "d4, empty" }).click();
  await expect(page.getByRole("button", { name: "White pawn on d2" })).toBeVisible();
  await page.getByRole("button", { name: "Black pawn on e7" }).click();
  await page.getByRole("button", { name: "e5, empty" }).click();
  await expect(page.getByRole("button", { name: "Black pawn on e5" })).toBeVisible();

  // Dragging works as well as clicking.
  await page.getByRole("button", { name: "White knight on g1" }).dragTo(page.getByRole("button", { name: "f3, empty" }));
  await expect(page.getByRole("button", { name: "White knight on f3" })).toBeVisible();
});
