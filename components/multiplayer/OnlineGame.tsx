"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Color } from "@/types";
import { ASSISTANCE } from "@/constants/assistance";
import { useGameSettings } from "@/hooks/useGameSettings";
import { useSecretCoach } from "@/hooks/useSecretCoach";
import { useOnlineGame, type Connection } from "@/hooks/useOnlineGame";
import { opposite } from "@/lib/chess/engine";
import { formatTimeControl } from "@/lib/chess/format";
import { errorMessage } from "@/lib/multiplayer/types";
import { ChessBoard } from "@/components/chess/ChessBoard";
import { useSocialQuery } from "@/hooks/useSocialQuery";
import type { RatingChange } from "@/lib/social/types";
import { RoomSpectatorControl } from "@/components/social/RoomSpectatorControl";
import { Button } from "@/components/ui/Button";
import { ConfirmationDialog } from "@/components/ui/ConfirmationDialog";
import { Dialog } from "@/components/ui/Dialog";
import { EngineCoach, EvalBar } from "@/components/game/EngineCoach";
import { GameControls } from "@/components/game/GameControls";
import { GameLayout } from "@/components/game/GameLayout";
import { GameResultDialog } from "@/components/game/GameResultDialog";
import { OnlineMoveStatus } from "./OnlineMoveStatus";
import { MobileGameDrawer } from "@/components/game/MobileGameDrawer";
import { PlayerPanel } from "@/components/game/PlayerPanel";
import { PromotionDialog } from "@/components/game/PromotionDialog";
import { SettingsDialog } from "@/components/game/SettingsDialog";

/** Both players get the same built-in legal move indicators. */
const ONLINE_ASSISTANCE = ASSISTANCE.medium;
const NO_PINS = {};

type Overlay = "none" | "menu" | "settings" | "details" | "resign";

export function OnlineGame({ gameId, playerId }: { gameId: string; playerId: string }) {
  const router = useRouter();
  const { settings, updateSettings } = useGameSettings();
  const online = useOnlineGame(gameId, playerId, settings.sound);
  const [overlay, setOverlay] = useState<Overlay>("none");
  const [resultDismissed, setResultDismissed] = useState(false);

  const { game, position, myColor, result, opponentId } = online;
  // Owner-only analysis of the confirmed position. It never leaves this browser:
  // nothing here is sent to the API, Realtime or the opponent.
  const secret = useSecretCoach(position, result !== null, online.awaitingServer, Boolean(game && myColor));
  const { result: ranking } = useSocialQuery<{ rating: RatingChange | null; exclusion: string | null }>(
    game?.ranked && result ? `/api/social/rating?id=${gameId}` : null,
  );

  // Both players are sent to the rematch once the server has created it.
  const rematchId = game?.rematch_game_id ?? null;
  useEffect(() => {
    if (rematchId) router.push(`/game/${rematchId}`);
  }, [rematchId, router]);

  if (!game || !myColor) {
    return <GameLoading error={online.loadError} retry={online.retryLoad} onBack={() => router.push("/play")} />;
  }

  const players: Record<Color, string> = { w: game.white_name, b: game.black_name };
  const backTo = game.origin === "room" ? "/play/rooms" : "/play/online";
  const opponentColor = opposite(myColor);
  const lastConfirmedMove = position.history[game.ply - 1] ?? null;
  const phase = result ? "finished"
    : game.paused_at ? "paused"
    : online.connection === "offline" ? "offline"
    : online.awaitingServer ? "sending"
    : online.myTurn ? "your-turn" : "opponent-turn";
  const check = !result && !online.awaitingServer && position.inCheck
    ? online.checkers.length > 1 ? "Double check" : "Check"
    : null;
  const incomingDraw = game.status === "active" && game.draw_offered_by === opponentId;
  const outgoingDraw = game.status === "active" && game.draw_offered_by === playerId;
  const rematchFromOpponent = game.rematch_requested_by === opponentId;
  const rematchFromMe = game.rematch_requested_by === playerId;

  const bottomColor = online.orientation;
  const panel = (color: Color) => (
    <PlayerPanel
      color={color}
      name={color === myColor ? `${players[color]} (you)` : players[color]}
      active={game.turn === color && !game.paused_at && !result}
      inCheck={Boolean(check) && game.turn === color}
      material={online.material}
      clock={online.clock}
      rating={color === "w" ? game.white_rating_before : game.black_rating_before}
      settings={settings}
    />
  );

  const renderControls = (withDetails: boolean) => (
    <GameControls
      canUndo={false}
      showUndo={false}
      canOfferDraw={game.status === "active" && !outgoingDraw && online.busyAction === null}
      onUndo={() => {}}
      onFlip={online.flipBoard}
      onOfferDraw={() => void online.act("offer_draw")}
      // The menu never pauses an online game: the official clock keeps running.
      onOpenMenu={() => setOverlay("menu")}
      onOpenDetails={withDetails ? () => setOverlay("details") : undefined}
    />
  );

  return (
    <>
      <GameLayout
        title={`${game.ranked ? "Ranked" : "Casual"} ${game.origin === "room" ? "private" : "online"} match`}
        subtitle={formatTimeControl(game.initial_ms, game.increment_ms)}
        top={panel(opposite(bottomColor))}
        bottom={panel(bottomColor)}
        board={
          <div className="flex gap-1.5 sm:gap-2">
            {secret.showEvalBar && (
              <EvalBar line={secret.evalLine} turn={secret.shown.turn} orientation={online.orientation} />
            )}
            <div className="min-w-0 flex-1">
              <ChessBoard
                position={secret.shown}
                selected={secret.reviewing ? null : online.selected}
                selectedMoves={secret.reviewing ? [] : online.selectedMoves}
                pins={NO_PINS}
                rejection={online.rejection}
                orientation={online.orientation}
                settings={settings}
                assistance={ONLINE_ASSISTANCE}
                interactive={online.isInteractive && !secret.reviewing}
                onSelect={online.selectSquare}
                onMove={online.attemptMove}
                onClearSelection={online.clearSelection}
                overlay={secret.overlay}
              />
            </div>
          </div>
        }
        status={
          <div className="space-y-1.5">
            <ConnectionBanner
              connection={online.connection}
              opponentAway={online.opponentAway}
              reconnectBy={online.reconnectBy}
              opponentName={players[opponentColor]}
            />
            <OnlineMoveStatus
              phase={phase}
              opponent={players[opponentColor]}
              myColor={myColor}
              lastMove={lastConfirmedMove}
              check={check}
            />
            {(outgoingDraw || online.notice) && (
              <p className="text-xs text-muted" aria-live="polite">
                {online.notice ?? "Draw offer sent. Waiting for your opponent…"}
              </p>
            )}
          </div>
        }
        controls={renderControls}
        history={position.history}
        showMoveHistory={settings.showMoveHistory}
        coach={secret.coach && <EngineCoach {...secret.coach} />}
      />

      {game.room_id && !result && <RoomSpectatorControl gameId={gameId} />}

      {online.pendingPromotion && !game.paused_at && !result && (
        <PromotionDialog
          open
          color={myColor}
          pieceStyle={settings.pieceStyle}
          square={online.pendingPromotion.to}
          onSelect={online.choosePromotion}
          onCancel={online.cancelPromotion}
        />
      )}

      <Dialog
        open={overlay === "menu" && !result}
        onClose={() => setOverlay("none")}
        title="Game menu"
        description="Your clock keeps running while this is open."
      >
        <div className="space-y-2">
          <Button variant="primary" size="lg" block onClick={() => setOverlay("none")} autoFocus>
            Back to the board
          </Button>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Button
              disabled={outgoingDraw}
              onClick={() => {
                setOverlay("none");
                void online.act("offer_draw");
              }}
            >
              Offer draw
            </Button>
            <Button onClick={() => setOverlay("settings")}>
              Settings
            </Button>
          </div>
          <Button variant="danger" block onClick={() => setOverlay("resign")} className="mt-1">
            Resign
          </Button>
        </div>
      </Dialog>

      <SettingsDialog
        open={overlay === "settings"}
        settings={settings}
        onChange={updateSettings}
        onClose={() => setOverlay(result ? "none" : "menu")}
      />

      <MobileGameDrawer
        open={overlay === "details"}
        onClose={() => setOverlay("none")}
        history={position.history}
        material={online.material}
        players={players}
        settings={settings}
      />

      <ConfirmationDialog
        open={overlay === "resign" && !result}
        title="Are you sure you want to resign?"
        description={`${players[opponentColor]} wins the game.`}
        confirmLabel="Resign"
        destructive
        onConfirm={() => {
          setOverlay("none");
          void online.act("resign");
        }}
        onCancel={() => setOverlay("menu")}
      />

      <Dialog
        open={incomingDraw && !result}
        onClose={() => void online.act("decline_draw")}
        title="Draw offered"
        description={`${players[opponentColor]} offers a draw. Your clock is still running.`}
      >
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={() => void online.act("decline_draw")}>
            Decline
          </Button>
          <Button variant="primary" onClick={() => void online.act("accept_draw")} autoFocus>
            Accept draw
          </Button>
        </div>
      </Dialog>

      {result && (
        <GameResultDialog
          open={!resultDismissed}
          ranking={ranking?.ok ? ranking : null}
          result={result}
          players={players}
          moveCount={position.history.length}
          durationMs={game.ended_at ? Date.parse(game.ended_at) - Date.parse(game.created_at) : null}
          onRematch={() => void online.act("request_rematch")}
          rematchLabel={rematchFromOpponent ? "Accept rematch" : rematchFromMe ? "Rematch requested" : "Rematch"}
          rematchDisabled={rematchFromMe || online.busyAction === "request_rematch"}
          rematchNote={
            online.notice ??
            (rematchFromOpponent
              ? `${players[opponentColor]} wants a rematch. Colours swap.`
              : rematchFromMe
                ? `Waiting for ${players[opponentColor]} to accept…`
                : "Colours swap for the rematch.")
          }
          onDeclineRematch={rematchFromOpponent ? () => void online.act("decline_rematch") : undefined}
          newGameLabel={game.origin === "room" ? "New room" : "New match"}
          onNewGame={() => router.push(backTo)}
          onHome={() => router.push("/")}
          onDismiss={() => setResultDismissed(true)}
        />
      )}

      {result && resultDismissed && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center p-4">
          <Button
            size="sm"
            variant="primary"
            className="pointer-events-auto shadow-lg"
            onClick={() => setResultDismissed(false)}
          >
            Show result
          </Button>
        </div>
      )}
    </>
  );
}

function ConnectionBanner({
  connection,
  opponentAway,
  opponentName,
  reconnectBy,
}: {
  connection: Connection;
  opponentAway: boolean;
  opponentName: string;
  reconnectBy: number | null;
}) {
  const message = reconnectBy
    ? opponentAway
      ? `${opponentName} disconnected. Waiting for them to return.`
      : "Reconnecting to your game…"
    : connection === "offline"
      ? null
      : connection === "reconnecting"
        ? "Connecting live updates. The board also checks the server for moves."
        : connection === "connecting"
          ? "Connecting…"
          : null;

  return (
    <div role="status">
      {message && (
        <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-md bg-accent-soft px-3 py-2 text-sm text-[#e8b57a]">
          <span className="min-w-0 wrap-anywhere">{message}</span>
          {reconnectBy !== null && <ReconnectCountdown key={reconnectBy} deadline={reconnectBy} />}
        </p>
      )}
    </div>
  );
}

function ReconnectCountdown({ deadline }: { deadline: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);
  const seconds = Math.min(30, Math.max(0, Math.ceil((deadline - now) / 1000)));
  return <span role="timer" aria-live="off" className="shrink-0 font-semibold tabular-nums">{seconds}s</span>;
}

function GameLoading({ error, retry, onBack }: { error: string | null; retry: () => void; onBack: () => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
      {error ? (
        <>
          <p className="text-lg font-semibold">{errorMessage(error)}</p>
          <div className="flex flex-wrap justify-center gap-2"><Button onClick={retry}>Retry loading</Button><Button onClick={onBack}>Back to play</Button></div>
        </>
      ) : (
        <>
          <span aria-hidden className="size-6 animate-spin rounded-full border-2 border-line border-t-accent" />
          <p className="text-sm text-muted">Loading game…</p>
        </>
      )}
    </div>
  );
}
