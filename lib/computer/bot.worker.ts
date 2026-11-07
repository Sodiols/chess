import type { BotDifficulty } from "@/types";
import { BOT_DIFFICULTIES } from "./difficulty";
import { chooseMove } from "./search";

export interface BotRequest {
  id: number;
  fen: string;
  difficulty: BotDifficulty;
}

// Runs off the main thread so a deep search never blocks the board.
self.onmessage = (event: MessageEvent<BotRequest>) => {
  const { id, fen, difficulty } = event.data;
  let move = null;
  try {
    const result = chooseMove(fen, BOT_DIFFICULTIES[difficulty].search);
    move = result && { from: result.from, to: result.to, promotion: result.promotion };
  } catch {
    // Reported as "no move"; the client treats it like a cancelled request.
  }
  (self as unknown as Worker).postMessage({ id, move });
};
