import { Chess } from "chess.js";

export function sanitizeBoard(body: Record<string, unknown>) {
  if (typeof body.sequence !== "number" || !Number.isInteger(body.sequence) || body.sequence < 1 || body.sequence > 2147483647
    || !Array.isArray(body.moves) || body.moves.length > 600 || typeof body.white !== "string" || typeof body.black !== "string") return null;
  const chess = new Chess();
  const moves = [];
  try {
    for (const move of body.moves) {
      if (!move || typeof move !== "object" || typeof move.from !== "string" || typeof move.to !== "string"
        || (move.promotion != null && !["q", "r", "n", "b"].includes(move.promotion))) return null;
      const played = chess.move({ from: move.from, to: move.to, promotion: move.promotion ?? undefined });
      moves.push({ from: played.from, to: played.to, promotion: played.promotion ?? null });
    }
  } catch {
    return null;
  }
  const clock = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(86400000, Math.round(value))) : null;
  const result = body.result === "white" || body.result === "black" || body.result === "draw" ? body.result : null;
  return { white: body.white.slice(0, 32), black: body.black.slice(0, 32), fen: chess.fen(), turn: chess.turn(),
    whiteMs: clock(body.whiteMs), blackMs: clock(body.blackMs), status: result ? "finished" : "active", result, moves };
}
