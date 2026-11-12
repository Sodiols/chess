"use client";

import { useCallback, useState } from "react";
import type { Color, GameConfig } from "@/types";
import { useChessGame } from "@/hooks/useChessGame";
import { useComputerOpponent } from "@/hooks/useComputerOpponent";
import { BOT_DIFFICULTIES } from "@/lib/computer/difficulty";
import { useGameSettings } from "@/hooks/useGameSettings";
import { useSecretCoach } from "@/hooks/useSecretCoach";
import { opposite } from "@/lib/chess/engine";
import { colorName, formatTimeControl } from "@/lib/chess/format";
import { MODE_DETAILS } from "@/constants/assistance";
import { ChessBoard } from "@/components/chess/ChessBoard";
import { Button } from "@/components/ui/Button";
import { ConfirmationDialog } from "@/components/ui/ConfirmationDialog";
import { Dialog } from "@/components/ui/Dialog";
import { EngineCoach, EvalBar } from "./EngineCoach";
import { GameControls } from "./GameControls";
import { GameMenu } from "./GameMenu";
import { GameResultDialog } from "./GameResultDialog";
import { GameStatus } from "./GameStatus";
import { GameLayout } from "./GameLayout";
import { MobileGameDrawer } from "./MobileGameDrawer";
import { PlayerPanel } from "./PlayerPanel";
import { PromotionDialog } from "./PromotionDialog";
import { SettingsDialog } from "./SettingsDialog";

type Overlay = "none" | "menu" | "settings" | "details" | "resign" | "restart";

interface ChessGameProps {
  config: GameConfig;
  /** Fresh game, colours swapped. */
  onRematch: () => void;
  /** Fresh game with the identical setup. */
  onRestart: () => void;
  /** Back to the setup screen. */
  onNewGame: () => void;
  onHome: () => void;
}

export function ChessGame({
  config,
  onRematch,
  onRestart,
  onNewGame,
  onHome,
}: ChessGameProps) {
  const { settings, updateSettings } = useGameSettings();
  const game = useChessGame(config, settings);
  const [overlay, setOverlay] = useState<Overlay>("none");
  const [resultDismissed, setResultDismissed] = useState(false);

  const { position, result, clock, paused } = game;
  const turnName = config.players[position.turn];
  // Owner-only engine analysis, local to this browser. A finished game can be stepped through.
  const secret = useSecretCoach(position, result !== null || config.analysis === true);

  const thinking = useComputerOpponent(config.bot, {
    fen: position.fen,
    turn: position.turn,
    finished: result !== null,
    paused,
    playMove: game.playMove,
  });
  /** Against the computer, resigning and draws are always the human's. */
  const humanColor: Color | null = config.bot ? opposite(config.bot.color) : null;
  const resignColor = humanColor ?? position.turn;

  /** Opening the menu deliberately stops the clock; resuming restarts it. */
  const openMenu = useCallback(() => {
    if (clock && !paused && !result) game.togglePause();
    setOverlay("menu");
  }, [clock, game, paused, result]);

  const resumeFromMenu = useCallback(() => {
    if (clock && paused && !result) game.togglePause();
    setOverlay("none");
  }, [clock, game, paused, result]);

  const bottomColor: Color = game.orientation;
  const topColor = opposite(bottomColor);

  const panels = {
    top: (
      <PlayerPanel
        color={topColor}
        name={config.players[topColor]}
        active={position.turn === topColor && !result}
        inCheck={position.inCheck && position.turn === topColor}
        material={game.material}
        clock={clock}
        settings={settings}
      />
    ),
    bottom: (
      <PlayerPanel
        color={bottomColor}
        name={config.players[bottomColor]}
        active={position.turn === bottomColor && !result}
        inCheck={position.inCheck && position.turn === bottomColor}
        material={game.material}
        clock={clock}
        settings={settings}
      />
    ),
  };

  const renderControls = (withDetails: boolean) => (
    <GameControls
      canUndo={game.canUndo}
      showUndo={settings.allowUndo}
      canOfferDraw={game.isInteractive}
      showDraw={!config.bot}
      onUndo={game.undo}
      onFlip={game.flipBoard}
      onOfferDraw={() => game.offerDraw(position.turn)}
      onOpenMenu={openMenu}
      onOpenDetails={withDetails ? () => setOverlay("details") : undefined}
    />
  );

  const board = (
    <div className="relative flex gap-1.5 sm:gap-2">
      {secret.showEvalBar && <EvalBar line={secret.evalLine} turn={secret.shown.turn} orientation={game.orientation} />}
      <div className="relative min-w-0 flex-1">
        <ChessBoard
          position={secret.shown}
          selected={secret.reviewing ? null : game.selected}
          selectedMoves={secret.reviewing ? [] : game.selectedMoves}
          pins={game.pins}
          rejection={game.rejection}
          orientation={game.orientation}
          settings={settings}
          assistance={game.assistance}
          interactive={game.isInteractive && !secret.reviewing}
          onSelect={game.selectSquare}
          onMove={game.attemptMove}
          onClearSelection={game.clearSelection}
          overlay={secret.overlay}
        />

        {paused && !result && overlay === "none" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-md bg-canvas/80 backdrop-blur-[2px]">
            <p className="text-sm font-medium">Clocks paused</p>
            <Button size="sm" variant="primary" onClick={game.togglePause}>
              Resume game
            </Button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <GameLayout
        title={
          config.analysis
            ? "Analysis board"
            : config.bot
            ? `Computer · ${BOT_DIFFICULTIES[config.bot.difficulty].name}`
            : MODE_DETAILS[config.mode].name
        }
        subtitle={
          config.timeControl
            ? formatTimeControl(config.timeControl.initialMs, config.timeControl.incrementMs)
            : "No timer"
        }
        top={panels.top}
        bottom={panels.bottom}
        board={board}
        status={
          <GameStatus
            turn={position.turn}
            turnName={turnName}
            inCheck={position.inCheck}
            doubleCheck={game.checkers.length > 1}
            coach={thinking ? null : game.coach}
            paused={paused}
            thinking={thinking && !paused}
          />
        }
        controls={renderControls}
        history={position.history}
        showMoveHistory={settings.showMoveHistory}
        coach={secret.coach && <EngineCoach {...secret.coach} />}
      />

      {game.pendingPromotion && (
        <PromotionDialog
          open
          color={position.turn}
          pieceStyle={settings.pieceStyle}
          square={game.pendingPromotion.to}
          onSelect={game.choosePromotion}
          onCancel={game.cancelPromotion}
        />
      )}

      {/* Gated on `!result` so a flag fall cannot leave a stale menu stacked
          underneath the result dialog. */}
      <GameMenu
        open={overlay === "menu" && !result}
        turnName={config.players[resignColor]}
        paused={paused}
        canOfferDraw={!result}
        showDraw={!config.bot}
        onResume={resumeFromMenu}
        onRestart={() => setOverlay("restart")}
        onOfferDraw={() => {
          resumeFromMenu();
          game.offerDraw(position.turn);
        }}
        onResign={() => setOverlay("resign")}
        onSettings={() => setOverlay("settings")}
        onHome={onHome}
      />

      <SettingsDialog
        open={overlay === "settings"}
        settings={settings}
        onChange={updateSettings}
        onClose={() => setOverlay("menu")}
      />

      <MobileGameDrawer
        open={overlay === "details"}
        onClose={() => setOverlay("none")}
        history={position.history}
        material={game.material}
        players={config.players}
        settings={settings}
      />

      <ConfirmationDialog
        open={overlay === "resign" && !result}
        title="Are you sure you want to resign?"
        description={`${config.players[resignColor]} resigns and ${config.players[opposite(resignColor)]} wins the game.`}
        confirmLabel="Resign"
        destructive
        onConfirm={() => {
          setOverlay("none");
          game.resign(resignColor);
        }}
        onCancel={() => setOverlay("menu")}
      />

      <ConfirmationDialog
        open={overlay === "restart" && !result}
        title="Restart this game?"
        description="The current position, move history and clocks are discarded. The same players, sides and time control are kept."
        confirmLabel="Restart"
        destructive
        onConfirm={onRestart}
        onCancel={() => setOverlay("menu")}
      />

      <Dialog
        open={game.drawOffer !== null}
        onClose={() => game.respondToDrawOffer(false)}
        title="Draw offered"
        description={
          game.drawOffer
            ? `${config.players[game.drawOffer]} (${colorName(game.drawOffer)}) offers a draw. ${
                config.players[opposite(game.drawOffer)]
              }, do you accept?`
            : ""
        }
      >
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={() => game.respondToDrawOffer(false)}>
            Decline
          </Button>
          <Button variant="primary" onClick={() => game.respondToDrawOffer(true)} autoFocus>
            Accept draw
          </Button>
        </div>
      </Dialog>

      {result && (
        <GameResultDialog
          open={!resultDismissed}
          result={result}
          players={config.players}
          moveCount={position.history.length}
          durationMs={game.durationMs}
          onRematch={onRematch}
          onNewGame={onNewGame}
          onHome={onHome}
          onDismiss={() => setResultDismissed(true)}
        />
      )}

      {/* Dismissing the result lets both players study the final position; this
          brings it back. */}
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
