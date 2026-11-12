/** @vitest-environment jsdom */
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api, type ApiResult } from "@/lib/multiplayer/client";
import { useSecretMode } from "@/hooks/useSecretMode";
import type { AuthState } from "@/lib/auth/session";
import { DEFAULT_SECRET_SETTINGS } from "@/lib/secret/settings";

const runtime = vi.hoisted(() => ({ auth: { status: "signed-out" } as AuthState }));
vi.mock("@/lib/auth/session", () => ({ useAuth: () => runtime.auth }));
vi.mock("@/lib/multiplayer/client", () => ({ api: vi.fn() }));

const request = vi.mocked(api);
const signIn = (id: string, token: string) => {
  runtime.auth = { status: "signed-in", user: { id }, session: { access_token: token } } as AuthState;
};
const nonOwner = { ok: true, owner: false } as const;
const owner = { ok: true, owner: true, settings: { ...DEFAULT_SECRET_SETTINGS, enabled: true } } as const;

beforeEach(() => {
  runtime.auth = { status: "signed-out" };
  request.mockReset();
});

it("recovers from a failed request and rechecks when the session refreshes", async () => {
  const { result, rerender } = renderHook(useSecretMode);
  request.mockResolvedValueOnce({ ok: false, error: "network" }).mockResolvedValueOnce(owner)
    .mockResolvedValueOnce(nonOwner);
  signIn("owner", "first");
  rerender();
  await waitFor(() => expect(result.current.status).toBe("unavailable"));
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.status).toBe("owner"));
  signIn("owner", "refreshed");
  rerender();
  await waitFor(() => expect(result.current.status).toBe("not_owner"));
  expect(request).toHaveBeenCalledTimes(3);
});

it("ignores old authorization results after switching away and back", async () => {
  const { result, rerender } = renderHook(useSecretMode);
  let finishOld!: (result: ApiResult<{ owner: boolean }>) => void;
  request.mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; }))
    .mockResolvedValueOnce(nonOwner)
    .mockResolvedValueOnce({ ok: false, error: "setup_incomplete" });
  signIn("owner", "old");
  rerender();
  signIn("other", "other");
  rerender();
  await waitFor(() => expect(result.current.status).toBe("not_owner"));
  signIn("owner", "new");
  rerender();
  await waitFor(() => expect(result.current.status).toBe("migration_missing"));
  await act(async () => finishOld(owner));
  expect(result.current.isOwner).toBe(false);
  expect(result.current.status).toBe("migration_missing");
});

it("keeps confirmed settings if a write fails, then applies the server response on retry", async () => {
  const { result, rerender } = renderHook(useSecretMode);
  const saved = { ...owner, settings: { ...owner.settings, strength: "deep" } };
  request.mockResolvedValueOnce(owner).mockResolvedValueOnce({ ok: false, error: "network" }).mockResolvedValueOnce(saved);
  signIn("owner", "current");
  rerender();
  await waitFor(() => expect(result.current.isOwner).toBe(true));
  await act(async () => result.current.update({ strength: "deep" }));
  expect(result.current.settings.strength).toBe("quick");
  expect(result.current.saveError).toBe("network");
  await act(async () => result.current.update({ strength: "deep" }));
  expect(result.current.settings.strength).toBe("deep");
  expect(result.current.saveError).toBeUndefined();
});
