// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { loginHref, safeNext, validateUsername } from "@/lib/auth/validation";
import { authErrorCode, linkError } from "@/lib/auth/errors";
import { reconcileRooms } from "@/hooks/useRoomBrowser";
import type { RoomSummary } from "@/lib/multiplayer/types";

// --- A fake Supabase browser client ------------------------------------------

type Listener = (event: string, session: unknown) => void;
const authListeners: Listener[] = [];
let session: unknown = null;

const auth = {
  onAuthStateChange: vi.fn((listener: Listener) => {
    authListeners.push(listener);
    listener("INITIAL_SESSION", session);
    return { data: { subscription: { unsubscribe() {} } } };
  }),
  getSession: vi.fn(async () => ({ data: { session } })),
  refreshSession: vi.fn(async () => ({ data: { session: null } })),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  resend: vi.fn(async () => ({ error: null })),
  signOut: vi.fn(async () => {
    emit(null);
    return { error: null };
  }),
};
const client = { auth, removeAllChannels: vi.fn(async () => []) };

function emit(next: unknown) {
  session = next;
  for (const listener of authListeners) listener(next ? "SIGNED_IN" : "SIGNED_OUT", next);
}

function fakeSession(id = "user-1", isAnonymous = false) {
  return { access_token: `token-${id}`, user: { id, email: "a@example.com", is_anonymous: isAnonymous, created_at: "2026-01-01" } };
}

vi.mock("@/lib/supabase/config", () => ({
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "pk",
  isOnlineConfigured: true,
  DISCONNECT_GRACE_MS: 8000,
}));
vi.mock("@/lib/supabase/browser", () => ({ getBrowserClient: () => client }));

const router = { replace: vi.fn(), push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/play/rooms" }));

const { LoginForm } = await import("@/components/auth/LoginForm");
const { SignupForm } = await import("@/components/auth/SignupForm");
const { OnlineGate } = await import("@/components/multiplayer/OnlineGate");
const { AccountMenu } = await import("@/components/AccountMenu");

const fetchMock = vi.fn();
beforeEach(() => {
  act(() => emit(null));
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

// --- Pure helpers ------------------------------------------------------------

describe("redirect targets", () => {
  it("only allows same-site paths that aren't auth pages", () => {
    expect(safeNext("/play/rooms?x=1")).toBe("/play/rooms?x=1");
    expect(safeNext("https://evil.example")).toBe("/play");
    expect(safeNext("//evil.example")).toBe("/play");
    expect(safeNext("/\\evil.example")).toBe("/play");
    expect(safeNext("/login?next=/login")).toBe("/play");
    expect(safeNext(undefined)).toBe("/play");
    expect(loginHref("/game/abc")).toBe("/login?next=%2Fgame%2Fabc");
  });
});

describe("username rules", () => {
  it("matches the database's rules", () => {
    expect(validateUsername("sodiol")).toBeNull();
    expect(validateUsername("gambit_player")).toBeNull();
    expect(validateUsername("chessmaster99")).toBeNull();
    expect(validateUsername("ab")).toBe("invalid_username");
    expect(validateUsername("with space")).toBe("invalid_username");
    expect(validateUsername("a".repeat(21))).toBe("invalid_username");
    expect(validateUsername("Admin")).toBe("username_reserved");
  });
});

describe("auth errors", () => {
  it("maps Supabase errors to messages without leaking detail", () => {
    expect(authErrorCode({ code: "invalid_credentials", status: 400 })).toBe("invalid_credentials");
    expect(authErrorCode({ code: "over_email_send_rate_limit" })).toBe("rate_limited");
    expect(authErrorCode({ status: 500, message: "Database error saving new user" })).toBe("database");
    expect(authErrorCode({ name: "AuthRetryableFetchError", status: 0 })).toBe("network");
    expect(authErrorCode({ status: 500, message: "boom" })).toBe("try_again");
  });

  it("recognises expired and reused email links", () => {
    expect(linkError("#error=access_denied&error_code=otp_expired&error_description=x")).toBe("invalid_link");
    expect(linkError("#access_token=abc&type=recovery")).toBeNull();
    expect(linkError("")).toBeNull();
  });
});

describe("room browser refresh", () => {
  const room = (code: string, patch: Partial<RoomSummary> = {}): RoomSummary => ({
    code, name: code, hostName: "h", initialMs: 300_000, incrementMs: 0, hostColor: "random",
    status: "waiting", discoverable: true, players: 1,
    expiresAt: new Date(Date.now() + 60_000).toISOString(), gameId: null, ...patch,
  });

  it("keeps shown rooms in place, drops gone ones and adds new ones", () => {
    const shown = [room("AAAAAA"), room("BBBBBB"), room("CCCCCC")];
    const fresh = [room("CCCCCC", { name: "renamed" }), room("DDDDDD"), room("AAAAAA")];
    const next = reconcileRooms(shown, fresh, () => 0.99);
    expect(next.map((r) => r.code)).toEqual(["AAAAAA", "CCCCCC", "DDDDDD"]);
    expect(next[1]!.name).toBe("renamed");
  });
});

// --- Forms -------------------------------------------------------------------

describe("log in", () => {
  it("shows a clear error for wrong credentials and never creates an account", async () => {
    auth.signInWithPassword.mockResolvedValue({ data: {}, error: { code: "invalid_credentials", status: 400 } });
    render(<LoginForm next="/play/rooms" />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByText("Incorrect email or password.")).toBeTruthy();
    expect(auth.signUp).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("validates before calling the server", () => {
    render(<LoginForm next="/play" />);
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(screen.getByText("Enter a valid email address.")).toBeTruthy();
    expect(screen.getByText("Enter your password.")).toBeTruthy();
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("returns to the intended page once signed in", async () => {
    auth.signInWithPassword.mockImplementation(async () => {
      emit(fakeSession());
      return { data: {}, error: null };
    });
    render(<LoginForm next="/play/rooms" />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "right-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/play/rooms"));
  });

  it("toggles password visibility", () => {
    render(<LoginForm next="/play" />);
    const input = screen.getByLabelText("Password") as HTMLInputElement;
    expect(input.type).toBe("password");
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(input.type).toBe("text");
  });
});

describe("sign up", () => {
  const fill = (fields: Record<string, string>) => {
    for (const [label, value] of Object.entries(fields)) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    }
  };

  it("shows field errors and sends nothing when the form is invalid", () => {
    render(<SignupForm next="/play" />);
    fill({ Username: "ab", Email: "nope", Password: "short", "Confirm password": "other" });
    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));
    expect(screen.getByText(/3–20 letters, numbers or underscores/)).toBeTruthy();
    expect(screen.getByText("Enter a valid email address.")).toBeTruthy();
    expect(screen.getByText("Use at least 8 characters for your password.")).toBeTruthy();
    expect(screen.getByText("The passwords don't match.")).toBeTruthy();
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it("waits for email confirmation instead of treating the user as signed in", async () => {
    fetchMock.mockImplementation(() => json({ ok: true, available: true }));
    auth.signUp.mockResolvedValue({ data: { user: { id: "u" }, session: null }, error: null });
    render(<SignupForm next="/play/online" />);
    fill({ Username: "sodiol", Email: "s@example.com", Password: "long-enough", "Confirm password": "long-enough" });
    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));

    expect(await screen.findByRole("heading", { name: "Check your email" })).toBeTruthy();
    const options = auth.signUp.mock.calls[0]![0] as { options: { data: unknown; emailRedirectTo: string } };
    expect(options.options.data).toEqual({ username: "sodiol" });
    expect(options.options.emailRedirectTo).toContain("/auth/callback?next=%2Fplay%2Fonline");
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("reports a username claimed by someone else during sign-up", async () => {
    let checks = 0;
    fetchMock.mockImplementation(() =>
      json(checks++ === 0 ? { ok: true, available: true } : { ok: true, available: false, reason: "username_taken" }),
    );
    auth.signUp.mockResolvedValue({ data: {}, error: { status: 500, message: "Database error saving new user" } });
    render(<SignupForm next="/play" />);
    fill({ Username: "racer", Email: "r@example.com", Password: "long-enough", "Confirm password": "long-enough" });
    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));
    expect(await screen.findByText("That username is already taken.")).toBeTruthy();
  });
});

describe("protected online pages", () => {
  it("send signed-out visitors to log in, keeping the destination", async () => {
    render(<OnlineGate>{() => <p>secret lobby</p>}</OnlineGate>);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/login?next=%2Fplay%2Frooms"));
    expect(screen.queryByText("secret lobby")).toBeNull();
  });

  it("ask a legacy guest to create an account instead of playing", () => {
    act(() => emit(fakeSession("guest-1", true)));
    fetchMock.mockImplementation(() => json({ ok: true, profile: { id: "guest-1", username: null } }));
    render(<OnlineGate>{() => <p>secret lobby</p>}</OnlineGate>);
    expect(screen.getByRole("heading", { name: "Create an account to play online" })).toBeTruthy();
    expect(screen.queryByText("secret lobby")).toBeNull();
  });

  it("show the lobby to a signed-in player with a username", async () => {
    act(() => emit(fakeSession("player-1")));
    fetchMock.mockImplementation(() =>
      json({ ok: true, profile: { id: "player-1", username: "sodiol", nickname: "sodiol", activeGameId: null, createdAt: "" } }),
    );
    render(<OnlineGate>{(profile) => <p>lobby for {profile.username}</p>}</OnlineGate>);
    expect(await screen.findByText("lobby for sodiol")).toBeTruthy();
    const [, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer token-player-1");
  });
});

describe("navbar account menu", () => {
  it("offers log in and sign up when signed out", () => {
    render(<AccountMenu />);
    expect(screen.getByRole("link", { name: "Log in" }).getAttribute("href")).toBe("/login?next=%2Fplay%2Frooms");
    expect(screen.getByRole("link", { name: "Sign up" }).getAttribute("href")).toBe("/signup?next=%2Fplay%2Frooms");
  });

  it("shows the username, the menu, and logs out", async () => {
    act(() => emit(fakeSession("player-2")));
    fetchMock.mockImplementation(() =>
      json({ ok: true, profile: { id: "player-2", username: "menu_user", nickname: "menu_user", activeGameId: null, createdAt: "" } }),
    );
    render(<AccountMenu />);
    fireEvent.click(await screen.findByRole("button", { name: /menu_user/ }));
    expect(screen.getByRole("menuitem", { name: "My Profile" }).getAttribute("href")).toBe("/profile");
    expect(screen.getByRole("menuitem", { name: "Settings" }).getAttribute("href")).toBe("/profile#settings");
    fireEvent.click(screen.getByRole("menuitem", { name: "Logout" }));
    await waitFor(() => expect(auth.signOut).toHaveBeenCalled());
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/"));
  });
});
