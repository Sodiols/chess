"use client";

import { useState } from "react";
import { useSocialQuery } from "@/hooks/useSocialQuery";
import { api } from "@/lib/multiplayer/client";
import { errorMessage } from "@/lib/multiplayer/types";
import { Button } from "@/components/ui/Button";

export function RoomSpectatorControl({ gameId }: { gameId: string }) {
  const { result, refresh } = useSocialQuery<{ enabled: boolean | null }>(`/api/social/spectate?roomGame=${gameId}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!result?.ok || result.enabled === null) return null;
  const change = async () => {
    setBusy(true);
    const response = await api("/api/social/spectate", { method: "POST", body: { id: gameId, action: "room", enabled: !result.enabled } });
    setError(response.ok ? null : response.error);
    if (response.ok) await refresh();
    setBusy(false);
  };
  return <div className="mx-auto max-w-[92rem] px-4 pb-4 sm:px-6 lg:px-8">
    <Button size="sm" disabled={busy} onClick={() => void change()}>{result.enabled ? "Disable room spectating" : "Enable room spectating"}</Button>
    {error && <p role="alert" className="mt-2 text-sm text-danger">{errorMessage(error)}</p>}
  </div>;
}
