import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "@/lib/multiplayer/client";

const auth = vi.hoisted(() => ({ getSession: vi.fn(), refreshSession: vi.fn() }));
vi.mock("@/lib/supabase/browser", () => ({ getBrowserClient: () => ({ auth }) }));

const expired = { access_token: "expired", user: { id: "first" } };
const fetchMock = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  auth.getSession.mockResolvedValue({ data: { session: expired } });
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

it("retries a rejected session once with the same account's refreshed token", async () => {
  auth.refreshSession.mockResolvedValue({ data: { session: { ...expired, access_token: "refreshed" } } });
  fetchMock.mockResolvedValueOnce(Response.json({ ok: true }));
  expect(await api("/api/profile", { expectedUserId: "first" })).toEqual({ ok: true });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls[1]?.[1].headers.authorization).toBe("Bearer refreshed");
});

it("does not replay a mutation after refresh switches to another account", async () => {
  auth.refreshSession.mockResolvedValue({ data: { session: { access_token: "other", user: { id: "second" } } } });
  expect(await api("/api/owner", { method: "POST", body: { settings: {} } })).toEqual({ ok: false, error: "signed_out" });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("distinguishes transient authentication failure from an expired session", async () => {
  auth.refreshSession.mockResolvedValue({
    data: { session: null }, error: { name: "AuthRetryableFetchError", status: 503 },
  });
  expect(await api("/api/profile")).toEqual({ ok: false, error: "auth_unavailable" });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("reports a temporary session lookup failure before sending any request", async () => {
  auth.getSession.mockResolvedValue({
    data: { session: null }, error: { name: "AuthRetryableFetchError", status: 503 },
  });
  expect(await api("/api/profile")).toEqual({ ok: false, error: "auth_unavailable" });
  expect(fetchMock).not.toHaveBeenCalled();
});

it.each([
  ["non-JSON", () => new Response("<html>Unavailable</html>", { status: 502 })],
  ["null", () => Response.json(null)],
  ["missing status", () => Response.json({})],
  ["contradictory status", () => Response.json({ ok: true }, { status: 502 })],
])("handles a %s response as an API failure", async (_name, response) => {
  fetchMock.mockReset().mockResolvedValueOnce(response());
  expect(await api("/api/profile")).toEqual({ ok: false, error: "try_again" });
});
