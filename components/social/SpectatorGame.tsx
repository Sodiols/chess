"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth/session";
import { useGameSettings } from "@/hooks/useGameSettings";
import { useSocialBroadcast } from "@/hooks/useSocialQuery";
import { api } from "@/lib/multiplayer/client";
import { errorMessage } from "@/lib/multiplayer/types";
import { loginHref } from "@/lib/auth/validation";
import { ChessEngine } from "@/lib/chess/engine";
import { formatClock } from "@/lib/chess/format";
import { ASSISTANCE } from "@/constants/assistance";
import { ChessBoard } from "@/components/chess/ChessBoard";
import { MoveHistory } from "@/components/game/MoveHistory";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Navbar } from "@/components/Navbar";
import type { Color } from "@/types";
import type { SpectatorSnapshot } from "@/lib/social/types";
import { RankMark, socialErrors } from "./SocialUI";
import { useActivity } from "./PlayerActivity";

export function SpectatorGame({ id }: { id: string }) {
  const auth = useAuth();
  const router = useRouter();
  const { settings } = useGameSettings();
  const viewer = auth.status === "signed-in" ? auth.user.id : null;
  const [access, setAccess] = useState<{ viewer: string; allowed: boolean; error?: string } | null>(null);
  const [snapshot, setSnapshot] = useState<SpectatorSnapshot | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [orientation, setOrientation] = useState<Color>("w");
  const [generation, setGeneration] = useState(0);
  const request = useRef({ revision: 0 });
  const inFlight = useRef(false);
  const pending = useRef(false);
  const current = access?.viewer === viewer ? access : null;
  const allowed = Boolean(current?.allowed);
  useActivity(allowed ? "spectating" : null);

  useEffect(() => {
    if (!viewer) return;
    let cancelled = false;
    void (async () => {
      const stored = await api<SpectatorSnapshot>(`/api/social/spectate?id=${id}`);
      const result = stored.ok ? stored : await api("/api/social/spectate", { method: "POST", body: { id, action: "authorize" } });
      if (!cancelled) {
        if (stored.ok) setSnapshot(stored);
        setAccess({ viewer, allowed: result.ok, error: result.ok ? undefined : result.error });
      }
    })();
    return () => { cancelled = true; };
  }, [generation, id, viewer]);

  const sync = useCallback(async () => {
    if (!allowed) return;
    if (inFlight.current) { pending.current = true; return; }
    inFlight.current = true;
    const call = ++request.current.revision;
    do {
      pending.current = false;
      const response = await api<SpectatorSnapshot>(`/api/social/spectate?id=${id}`);
      if (call !== request.current.revision) break;
      if (response.ok) {
        setSnapshot((last) => {
          if (!last || last.board.sequence < response.board.sequence) return response;
          if (last.board.sequence > response.board.sequence) return last;
          return { ...response, board: { ...response.board, moves: last.board.moves } };
        });
        setSyncError(null);
      } else setSyncError(response.error);
    } while (pending.current);
    inFlight.current = false;
  }, [allowed, id]);
  useSocialBroadcast(allowed && !syncError ? `watch:${id}` : null, "board_changed", sync);
  useEffect(() => {
    if (!allowed) return;
    const tracker = request.current;
    const initial = setTimeout(() => void sync(), 0);
    const timer = setInterval(() => void sync(), 4000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
      tracker.revision++;
    };
  }, [allowed, sync, viewer]);

  const board = snapshot?.board;
  const moves = board?.moves;
  const position = useMemo(() => {
    if (!moves) return null;
    const chess = new ChessEngine();
    for (const move of moves) chess.move(move.from, move.to, move.promotion ?? undefined);
    return chess.snapshot();
  }, [moves]);
  const permit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!viewer || busy) return;
    setBusy(true);
    const result = await api("/api/social/spectate", { method: "POST", body: { id, action: "authorize", password } });
    setBusy(false);
    setPassword("");
    setAccess({ viewer, allowed: result.ok, error: result.ok ? undefined : result.error });
  };
  const passwordRequired = current?.error === "spectator_password_required" || current?.error === "wrong_password";
  const blocked = syncError && !["network", "timeout", "try_again", "rate_limited"].includes(syncError);
  const winner = board?.result === "white" ? board.white : board?.result === "black" ? board.black : null;

  return <><Navbar variant="game" /><main id="main-content" tabIndex={-1} className="mx-auto max-w-[70rem] px-4 py-6 sm:px-6">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
      <h1 className="text-2xl font-bold">Spectate match</h1>
      <Link href="/friends" className="inline-flex min-h-11 items-center text-sm text-accent hover:underline">Leave spectating</Link>
    </div>
    {!viewer ? <p>{auth.status === "loading" ? "Loading…" : <Link className="text-accent underline" href={loginHref(`/spectate/${id}`)}>Log in to watch</Link>}</p>
      : passwordRequired ? <Dialog open onClose={() => router.push("/friends")} title="Enter Room Password">
        <form className="space-y-4" onSubmit={permit}>
        <label className="grid gap-1 text-sm">Room Password<input className="min-h-11 rounded-md bg-raised px-3" type="password"
          value={password} maxLength={64} required onChange={(event) => setPassword(event.target.value)} /></label>
        {current?.error === "wrong_password" && <p className="text-sm text-danger" role="alert">{errorMessage("wrong_password")}</p>}
        <Button type="submit" variant="primary" disabled={busy}>Watch Match</Button>
        </form>
      </Dialog> : blocked || current?.error ? <div className="space-y-3">
        <p role="alert">{socialErrors[syncError ?? current?.error ?? ""] ?? errorMessage(syncError ?? current?.error ?? "")}</p>
        <Button onClick={() => { setAccess(null); setSnapshot(null); setSyncError(null); setGeneration(generation + 1); }}>Try again</Button>
      </div> : !allowed || !position || !board || !snapshot ? <p role="status">Loading match…</p> : <>
        <p className="mb-4 text-sm text-muted" role="status">{board.disconnected || syncError ? "Stream disconnected. Waiting for an update…" : `${snapshot.viewers} watching`}</p>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <section className="mx-auto w-full max-w-xl space-y-2" aria-label="Live chessboard">
            <SpectatorPlayer color={orientation === "w" ? "b" : "w"} snapshot={snapshot} />
            <ChessBoard position={position} orientation={orientation} settings={settings} assistance={ASSISTANCE.pro} interactive={false}
              selected={null} selectedMoves={[]} pins={{}} rejection={null}
              onSelect={() => {}} onMove={() => {}} onClearSelection={() => {}} />
            <SpectatorPlayer color={orientation} snapshot={snapshot} />
          </section>
          <aside className="min-w-0 space-y-4">
            <p className="font-semibold" role="status">{board.result === "draw" ? "Draw" : winner ? `${winner} wins`
              : `${board.turn === "w" ? board.white : board.black} to move${position.inCheck ? " · Check" : ""}`}</p>
            <Button onClick={() => setOrientation(orientation === "w" ? "b" : "w")}>Flip board</Button>
            <div className="rounded-md bg-surface p-3"><h2 className="mb-2 font-semibold">Move history</h2>
              <MoveHistory className="max-h-72 overflow-y-auto" history={position.history} /></div>
          </aside>
        </div>
      </>}
  </main></>;
}

function SpectatorPlayer({ color, snapshot }: { color: Color; snapshot: SpectatorSnapshot }) {
  const { board } = snapshot;
  const name = color === "w" ? board.white : board.black;
  const rating = color === "w" ? board.whiteRating : board.blackRating;
  const value = color === "w" ? board.whiteMs : board.blackMs;
  return <div className="flex min-h-11 flex-wrap items-center justify-between gap-2 rounded-md bg-surface px-3 py-2">
    <div className="flex min-w-0 items-center gap-3"><span className="truncate font-bold">{name}</span>
      {rating != null && <RankMark rating={rating} />}</div>
    {value !== null && <SpectatorClock key={`${snapshot.serverNow}:${color}`} value={value} snapshot={snapshot} color={color} />}
  </div>;
}

function SpectatorClock({ value, snapshot, color }: { value: number; snapshot: SpectatorSnapshot; color: Color }) {
  const { board } = snapshot;
  const live = board.status === "active" && color === board.turn && !board.pausedAt && !!board.turnStarted;
  const elapsedBeforeLoad = board.turnStarted && color === board.turn && board.status === "active"
    ? Math.max(0, Date.parse(board.pausedAt ?? snapshot.serverNow) - Date.parse(board.turnStarted)) : 0;
  const [start] = useState(() => Date.now());
  const [now, setNow] = useState(start);
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [live]);
  return <span role="timer" className="font-bold tabular-nums">{formatClock(Math.max(0, value - elapsedBeforeLoad - (live ? now - start : 0)))}</span>;
}
