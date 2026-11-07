"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Color, PieceSymbol, Square } from "@/types";
import { ChessClock } from "@/lib/clock";
import { findCheckers } from "@/lib/chess/analysis";
import { computeMaterial } from "@/lib/chess/material";
import { resolveSquareClick } from "@/lib/chess/selection";
import { opposite } from "@/lib/chess/engine";
import { playSound } from "@/lib/sound";
import { api, ensureSession } from "@/lib/multiplayer/client";
import { OnlineGameStore } from "@/lib/multiplayer/onlineGameStore";
import { errorMessage, rowResult, type GameAction, type GameRow, type GameSnapshot, type MoveRow } from "@/lib/multiplayer/types";
import { getBrowserClient } from "@/lib/supabase/browser";
import { DISCONNECT_GRACE_MS } from "@/lib/supabase/config";
import type { Rejection } from "./useChessGame";

export type Connection = "connecting" | "connected" | "reconnecting" | "offline";

type MoveResponse = { game: GameRow; move: MoveRow | null };

/**
 * One live online game. Moves are shown optimistically and sent to the server,
 * which validates and commits them; the server's broadcast (or the HTTP
 * response, whichever lands first) confirms or corrects the board. Clocks are
 * animated locally from server timestamps and never decide a result here: a
 * flag only asks the server to check its own clock.
 */
export function useOnlineGame(gameId: string, playerId: string, sound: boolean) {
  const [store] = useState(() => new OnlineGameStore(playerId));
  const view = useSyncExternalStore(store.subscribe, store.getView, store.getView);
  const { game, position, myColor } = view;

  const [loadError, setLoadError] = useState<string | null>(null);
  const [connection, setConnection] = useState<Connection>("connecting");
  const [opponentPresent, setOpponentPresent] = useState<boolean | null>(null);
  const [opponentAway, setOpponentAway] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<Square | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: Square; to: Square } | null>(null);
  const [rejection, setRejection] = useState<Rejection | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [busyAction, setBusyAction] = useState<GameAction | null>(null);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Canonical state: fetch, and refetch whenever we may have missed something.
  // ---------------------------------------------------------------------------

  const fetching = useRef(false);
  const refetchAgain = useRef(false);

  const resync = useCallback(async () => {
    if (fetching.current) {
      refetchAgain.current = true;
      return;
    }
    fetching.current = true;
    do {
      refetchAgain.current = false;
      const startedAt = Date.now();
      const result = await api<GameSnapshot>(`/api/games/${gameId}`);
      if (!mounted.current) break;
      if (result.ok) {
        store.load(result, startedAt, Date.now());
        setLoadError(null);
      } else if (!store.getGame()) {
        setLoadError(result.error);
      }
    } while (refetchAgain.current);
    fetching.current = false;
  }, [gameId, store]);

  const applyServer = useCallback(
    (row: GameRow, move: MoveRow | null) => {
      if (store.apply(row, move) === "resync") void resync();
    },
    [resync, store],
  );

  // ---------------------------------------------------------------------------
  // Realtime: authorised private channel with database broadcasts and presence.
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const supabase = getBrowserClient();
    if (!supabase) return;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    void (async () => {
      // First paint comes from HTTP, so the board shows even if Realtime is slow.
      void resync();
      await ensureSession();
      await supabase.realtime.setAuth();
      if (cancelled) return;

      const subscribed = supabase.channel(`game:${gameId}`, {
        config: { private: true, presence: { key: playerId } },
      });
      channel = subscribed;
      subscribed
        .on("broadcast", { event: "game_updated" }, ({ payload }) => {
          const { game: row, move } = payload as { game?: GameRow; move?: MoveRow | null };
          if (row) applyServer(row, move ?? null);
        })
        .on("presence", { event: "sync" }, () => {
          // Only the two participants may join this topic, so any other key is the opponent.
          const others = Object.keys(subscribed.presenceState()).filter((key) => key !== playerId);
          setOpponentPresent(others.length > 0);
        })
        .subscribe((status) => {
          if (cancelled) return;
          if (status === "SUBSCRIBED") {
            setConnection("connected");
            // Covers anything broadcast before we joined or while we were away.
            void resync();
            void subscribed.track({ joinedAt: Date.now() });
          } else {
            setConnection(navigator.onLine ? "reconnecting" : "offline");
          }
        });
    })();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [applyServer, gameId, playerId, resync]);

  // Network and tab-visibility changes are the common ways to miss events.
  useEffect(() => {
    const goOffline = () => setConnection("offline");
    const comeBack = () => {
      setConnection((current) => (current === "offline" ? "reconnecting" : current));
      void resync();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void resync();
    };
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", comeBack);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", comeBack);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [resync]);

  // A brief absence (a refresh, a tunnel) shouldn't alarm the other player.
  useEffect(() => {
    if (opponentPresent !== false) return;
    const timer = setTimeout(() => setOpponentAway(true), DISCONNECT_GRACE_MS);
    return () => {
      clearTimeout(timer);
      setOpponentAway((away) => {
        if (away) setNotice("Opponent reconnected.");
        return false;
      });
    };
  }, [opponentPresent]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(timer);
  }, [notice]);

  // ---------------------------------------------------------------------------
  // Clock display, re-anchored to the server on every committed change.
  // ---------------------------------------------------------------------------

  const initialMs = game?.initial_ms;
  const incrementMs = game?.increment_ms;
  const onFlag = useRef<() => void>(() => {});
  const clock = useMemo(() => {
    if (initialMs === undefined || incrementMs === undefined) return null;
    const instance = new ChessClock(initialMs, incrementMs);
    instance.onFlag = () => onFlag.current();
    return instance;
  }, [incrementMs, initialMs]);
  useEffect(() => () => clock?.dispose(), [clock]);

  const lastClaim = useRef(0);
  useEffect(() => {
    onFlag.current = () => {
      // Ask the server; it alone decides whether time is really up.
      if (Date.now() - lastClaim.current < 1500) return;
      lastClaim.current = Date.now();
      void api<MoveResponse>(`/api/games/${gameId}/action`, {
        method: "POST",
        body: { action: "claim_timeout" },
      }).then((result) => {
        if (result.ok) applyServer(result.game, null);
      });
    };
  }, [applyServer, gameId]);

  const clockKey = game ? `${game.version}|${game.turn_started_at}|${game.status}` : "";
  useEffect(() => {
    if (!clock || !clockKey) return;
    const current = store.getGame();
    const reading = store.clockReading();
    if (!current || !reading) return;
    clock.restore(reading, current.turn);
    if (current.status !== "active") clock.stop();
  }, [clock, clockKey, store]);

  // ---------------------------------------------------------------------------
  // Sounds follow the board, so our moves and the opponent's sound the same.
  // ---------------------------------------------------------------------------

  const result = game ? rowResult(game) : null;
  const lastMove = position.lastMove;
  const plies = position.history.length;
  const heardPlies = useRef<number | null>(null);
  useEffect(() => {
    const previous = heardPlies.current;
    heardPlies.current = plies;
    if (!sound || previous === null || plies <= previous || !lastMove) return;
    playSound(
      lastMove.promotion
        ? "promote"
        : lastMove.isCastle
          ? "castle"
          : lastMove.isCheck
            ? "check"
            : lastMove.isCapture
              ? "capture"
              : "move",
    );
  }, [lastMove, plies, sound]);

  const finished = result !== null;
  const heardEnd = useRef(false);
  useEffect(() => {
    if (finished && !heardEnd.current && sound) playSound("gameEnd");
    heardEnd.current = finished;
  }, [finished, sound]);

  // ---------------------------------------------------------------------------
  // Moves
  // ---------------------------------------------------------------------------

  const myTurn = Boolean(game && game.status === "active" && myColor && position.turn === myColor);
  const isInteractive = myTurn && !view.pending && pendingPromotion === null;

  const submit = useCallback(
    async (from: Square, to: Square, promotion: PieceSymbol | null) => {
      const requestId = crypto.randomUUID();
      const planned = store.playOptimistic(from, to, promotion, requestId);
      setSelected(null);
      setPendingPromotion(null);
      if (!planned) return;
      if (myColor) clock?.moveCompleted(myColor);

      const body = { from, to, promotion, expectedVersion: planned.expectedVersion, requestId };
      let response = await api<MoveResponse>(`/api/games/${gameId}/move`, { method: "POST", body });
      // The request id makes a retry safe: if the first attempt landed, the
      // server returns that same move instead of playing it twice.
      if (!response.ok && response.error === "network") {
        response = await api<MoveResponse>(`/api/games/${gameId}/move`, { method: "POST", body });
      }
      if (!mounted.current) return;
      if (response.ok) {
        applyServer(response.game, response.move);
        return;
      }
      store.dropPending();
      if (response.error !== "stale") setNotice(errorMessage(response.error));
      void resync();
    },
    [applyServer, clock, gameId, myColor, resync, store],
  );

  const reject = useCallback(
    (from: Square, to: Square) => {
      setRejection((current) => ({ from, to, token: (current?.token ?? 0) + 1 }));
      if (sound) playSound("illegal");
    },
    [sound],
  );

  const attemptMove = useCallback(
    (from: Square, to: Square) => {
      if (!isInteractive) return;
      const move = position.movesFrom[from]?.find((candidate) => candidate.to === to);
      if (!move) return reject(from, to);
      // The clock keeps running while the piece is chosen, as on the server.
      if (move.isPromotion) return setPendingPromotion({ from, to });
      void submit(from, to, null);
    },
    [isInteractive, position.movesFrom, reject, submit],
  );

  const selectSquare = useCallback(
    (square: Square) => {
      if (!isInteractive) return;
      const outcome = resolveSquareClick(position, selected, square);
      if (outcome.kind === "select") setSelected(outcome.square);
      else if (outcome.kind === "move") attemptMove(outcome.from, outcome.to);
      else if (outcome.kind === "reject") reject(outcome.from, outcome.to);
    },
    [attemptMove, isInteractive, position, reject, selected],
  );

  useEffect(() => {
    if (!rejection) return;
    const timer = setTimeout(() => setRejection(null), 2400);
    return () => clearTimeout(timer);
  }, [rejection]);

  // ---------------------------------------------------------------------------
  // Resign, draws and rematches
  // ---------------------------------------------------------------------------

  const act = useCallback(
    async (action: GameAction) => {
      setBusyAction(action);
      const response = await api<MoveResponse>(`/api/games/${gameId}/action`, { method: "POST", body: { action } });
      if (!mounted.current) return;
      setBusyAction(null);
      if (response.ok) applyServer(response.game, null);
      else setNotice(errorMessage(response.error));
    },
    [applyServer, gameId],
  );

  const selectedMoves = useMemo(
    () => (selected ? (position.movesFrom[selected] ?? []) : []),
    [position, selected],
  );
  const checkers = useMemo(
    () => (position.inCheck ? findCheckers(store.raw(), position.turn) : []),
    [position, store],
  );
  const material = useMemo(() => computeMaterial(position.history, position.pieceAt), [position]);

  const opponentId = game && myColor ? (myColor === "w" ? game.black_id : game.white_id) : null;
  const baseOrientation: Color = myColor ?? "w";

  return {
    game,
    position,
    myColor,
    opponentId,
    result,
    loadError,
    connection,
    opponentAway: opponentAway && !finished,
    notice,
    clock,
    selected,
    selectedMoves,
    checkers,
    material,
    rejection,
    pendingPromotion,
    isInteractive,
    myTurn,
    awaitingServer: view.pending,
    busyAction,
    orientation: flipped ? opposite(baseOrientation) : baseOrientation,
    selectSquare,
    attemptMove,
    choosePromotion: (piece: PieceSymbol) => {
      if (pendingPromotion) void submit(pendingPromotion.from, pendingPromotion.to, piece);
    },
    cancelPromotion: () => setPendingPromotion(null),
    clearSelection: () => setSelected(null),
    flipBoard: () => setFlipped((value) => !value),
    act,
    dismissNotice: () => setNotice(null),
  };
}
