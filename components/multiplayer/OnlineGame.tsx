"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import type { Color } from "@/types";
import { ASSISTANCE } from "@/constants/assistance";
import { useGameSettings } from "@/hooks/useGameSettings";
import { useOnlineGame, type Connection } from "@/hooks/useOnlineGame";
import { opposite } from "@/lib/chess/engine";
import { formatTimeControl } from "@/lib/chess/format";
import { errorMessage } from "@/lib/multiplayer/types";
import { ChessBoard } from "@/components/chess/ChessBoard";
import { Button } from "@/components/ui/Button";
import { ConfirmationDialog } from "@/components/ui/ConfirmationDialog";
import { Dialog } from "@/components/ui/Dialog";
import { FlagIcon, GearIcon, HandshakeIcon } from "@/components/ui/icons";
import { GameControls } from "@/components/game/GameControls";
import { GameLayout } from "@/components/game/GameLayout";
import { GameResultDialog } from "@/components/game/GameResultDialog";
import { GameStatus } from "@/components/game/GameStatus";
import { MobileGameDrawer } from "@/components/game/MobileGameDrawer";
import { PlayerPanel } from "@/components/game/PlayerPanel";
import { PromotionDialog } from "@/components/game/PromotionDialog";
import { SettingsDialog } from "@/components/game/SettingsDialog";

/** Online boards show legal moves without coaching, for both players alike. */
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

  // Both players are sent to the rematch once the server has created it.
  const rematchId = game?.rematch_game_id ?? null;
  useEffect(() => {
    if (rematchId) router.push(`/game/${rematchId}`);
  }, [rematchId, router]);

  if (!game || !myColor) {
    return <GameLoading error={online.loadError} onBack={() => router.push("/play")} />;
  }

  const players: Record<Color, string> = { w: game.white_name, b: game.black_name };
  const backTo = game.origin === "room" ? "/play/rooms" : "/play/online";
  const opponentColor = opposite(myColor);
  const incomingDraw = game.status === "active" && game.draw_offered_by === opponentId;
  const outgoingDraw = game.status === "active" && game.draw_offered_by === playerId;
  const rematchFromOpponent = game.rematch_requested_by === opponentId;
  const rematchFromMe = game.rematch_requested_by === playerId;

  const bottomColor = online.orientation;
  const panel = (color: Color) => (
    <PlayerPanel
      color={color}
      name={color === myColor ? `${players[color]} (you)` : players[color]}
      active={position.turn === color && !result}
      inCheck={position.inCheck && position.turn === color}
      material={online.material}
      clock={online.clock}
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
        title={game.origin === "room" ? "Private match" : "Online match"}
        subtitle={formatTimeControl(game.initial_ms, game.increment_ms)}
        top={panel(opposite(bottomColor))}
        bottom={panel(bottomColor)}
        board={
          <ChessBoard
            position={position}
            selected={online.selected}
            selectedMoves={online.selectedMoves}
            pins={NO_PINS}
            rejection={online.rejection}
            orientation={online.orientation}
            settings={settings}
            assistance={ONLINE_ASSISTANCE}
            interactive={online.isInteractive}
            onSelect={online.selectSquare}
            onMove={online.attemptMove}
            onClearSelection={online.clearSelection}
          />
        }
        status={
          <div className="space-y-1.5">
            <ConnectionBanner
              connection={online.connection}
              opponentAway={online.opponentAway}
              opponentName={players[opponentColor]}
            />
            <GameStatus
              turn={position.turn}
              turnName={online.myTurn ? "You" : players[position.turn]}
              inCheck={position.inCheck}
              doubleCheck={online.checkers.length > 1}
              coach={null}
              paused={false}
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
      />

      {online.pendingPromotion && (
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
              <HandshakeIcon />
              Offer draw
            </Button>
            <Button onClick={() => setOverlay("settings")}>
              <GearIcon />
              Settings
            </Button>
          </div>
          <Button variant="danger" block onClick={() => setOverlay("resign")} className="mt-1">
            <FlagIcon />
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
}: {
  connection: Connection;
  opponentAway: boolean;
  opponentName: string;
}) {
  const message =
    connection === "offline"
      ? "You're offline. Reconnecting when the network returns…"
      : connection === "reconnecting"
        ? "Reconnecting…"
        : connection === "connecting"
          ? "Connecting…"
          : opponentAway
            ? `${opponentName} disconnected. Their clock keeps running.`
            : null;
  if (!message) return null;
  const warn = connection !== "connected" || opponentAway;

  return (
    <p
      role="status"
      className={clsx(
        "flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs",
        warn ? "border-[#5c4a29] bg-accent-soft/60 text-[#e8b57a]" : "border-line text-muted",
      )}
    >
      <span aria-hidden className={clsx("size-1.5 animate-pulse rounded-full", warn ? "bg-[#e8b57a]" : "bg-faint")} />
      {message}
    </p>
  );
}

function GameLoading({ error, onBack }: { error: string | null; onBack: () => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
      {error ? (
        <>
          <p className="text-lg font-semibold">{errorMessage(error)}</p>
          <Button onClick={onBack}>Back to play</Button>
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
