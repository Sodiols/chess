/** @vitest-environment jsdom */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Matchmaking } from "@/components/matchmaking/Matchmaking";
import { api } from "@/lib/multiplayer/client";

vi.mock("@/lib/multiplayer/client", () => ({ api: vi.fn() }));
vi.mock("@/hooks/usePlayerEvents", () => ({ usePlayerEvents: () => {} }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

afterEach(() => vi.useRealTimers());

it("announces the wait at 15 seconds and offers a fresh search after stopping at 30", async () => {
  vi.useFakeTimers();
  const request = vi.mocked(api);
  request.mockImplementation(async (path, options) => {
    if (options?.method === "POST") return { ok: true, status: "waiting" };
    if (options?.method === "DELETE") return { ok: true, status: "idle" };
    if (path === "/api/profile") return { ok: true, profile: { activeGameId: null } };
    return { ok: false, error: "not_found" };
  });
  render(<Matchmaking profile={{ id: "player", nickname: "Player", username: "player", countryCode: "BD", activeGameId: null, createdAt: "" }} />);

  await act(async () => fireEvent.click(screen.getByRole("button", { name: /Find Opponent/i })));
  await act(async () => vi.advanceTimersByTimeAsync(14_999));
  expect(screen.getByRole("status").textContent).toContain("You’re in the queue.");
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(screen.getByRole("status").textContent).toContain("Hang tight");
  await act(async () => vi.advanceTimersByTimeAsync(10_000));
  expect(screen.getByRole("status").textContent).toContain("try again");
  await act(async () => vi.advanceTimersByTimeAsync(5_000));
  expect(screen.getByRole("status").textContent).toContain("No opponent found in 30 seconds.");
  expect(request).toHaveBeenCalledWith("/api/matchmaking", { method: "DELETE" });
  expect((screen.getByRole("button", { name: /Retry/i }) as HTMLButtonElement).disabled).toBe(false);
  expect(request.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
});
