"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth/session";
import { api } from "@/lib/multiplayer/client";
import { errorMessage } from "@/lib/multiplayer/types";
import { Button } from "@/components/ui/Button";
import type { GameResult, PlayedMove } from "@/types";
import type { ChessClock } from "@/lib/clock";
import { socialErrors } from "./SocialUI";
import { useActivity } from "./PlayerActivity";

export function BroadcastGame({ kind, white, black, history, clock, result }: {
  kind: "computer" | "local"; white: string; black: string; history: PlayedMove[]; clock: ChessClock | null; result: GameResult | null;
}) {
  const auth = useAuth();
  const userId = auth.status === "signed-in" ? auth.user.id : null;
  const signedIn = userId !== null;
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const current = useRef({ history, clock, result });
  const update = useRef<(() => void) | null>(null);
  useActivity(signedIn && !result ? kind : null);

  useEffect(() => {
    current.current = { history, clock, result };
    update.current?.();
  }, [clock, history, result]);

  useEffect(() => {
    if (!enabled || !signedIn) return;
    let stopped = false;
    let busy = false;
    let pending = false;
    let id: string | null = null;
    let sequence = 0;
    const stop = (sessionId: string) => void api("/api/social/spectate", { method: "POST", body: { action: "stop", id: sessionId } });
    const publish = async () => {
      if (stopped) return;
      if (busy) { pending = true; return; }
      busy = true;
      const snapshot = current.current;
      const remaining = snapshot.clock?.getSnapshot().remaining;
      const outcome = snapshot.result?.kind === "draw" ? "draw" : snapshot.result?.kind === "win"
        ? snapshot.result.winner === "w" ? "white" : "black" : null;
      const response = await api<{ sessionId: string }>("/api/social/spectate", { method: "POST", body: {
        action: "publish", id, kind, white, black, sequence: ++sequence, result: outcome,
        moves: snapshot.history.map(({ from, to, promotion }) => ({ from, to, promotion })),
        whiteMs: remaining?.w, blackMs: remaining?.b,
      } });
      busy = false;
      if (stopped) {
        if (response.ok) stop(response.sessionId);
        return;
      }
      if (response.ok) { id = response.sessionId; setSession(id); setError(null); }
      else {
        setError(response.error);
        if (response.error === "watch_sharing_disabled" || response.error === "watch_unavailable") setEnabled(false);
      }
      if (pending) { pending = false; void publish(); }
    };
    update.current = () => void publish();
    void publish();
    const timer = setInterval(publish, 9000);
    return () => {
      stopped = true;
      update.current = null;
      clearInterval(timer);
      if (id) stop(id);
    };
  }, [black, enabled, kind, signedIn, userId, white]);

  if (!signedIn) return null;
  return <section className="mx-auto max-w-[92rem] px-4 pb-6 text-sm sm:px-6 lg:px-8" aria-label="Share game with friends">
    {!enabled && <p className="mb-2 text-muted">{kind === "local"
      ? "Tell both players before enabling sharing. Accepted friends can watch the board live."
      : "Accepted friends can watch this board live when sharing is on."}</p>}
    <div className="flex flex-wrap items-center gap-3">
      <Button onClick={() => { setSession(null); setError(null); setCopied(false); setEnabled(!enabled); }}>
        {enabled ? "Stop sharing" : kind === "local" ? "Both players agree · Start sharing" : "Allow friends to spectate"}
      </Button>
      {enabled && session && <Button variant="ghost" onClick={() => {
        void navigator.clipboard.writeText(new URL(`/spectate/${session}`, window.location.origin).href)
          .then(() => setCopied(true), () => setError("clipboard"));
      }}>{copied ? "Link copied" : "Copy spectator link"}</Button>}
      {enabled && !session && !error && <span role="status">Connecting…</span>}
    </div>
    {error && <p role="alert" className="mt-2 text-danger">{error === "clipboard" ? "Could not copy the spectator link." : socialErrors[error] ?? errorMessage(error)}
      {" "}<Link href="/profile#social-settings" className="underline">Account settings</Link></p>}
  </section>;
}
