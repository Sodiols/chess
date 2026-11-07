import type { BotDifficulty } from "@/types";
import type { SearchOptions } from "./search";

export const BOT_DIFFICULTIES: Record<
  BotDifficulty,
  { name: string; summary: string; search: Omit<SearchOptions, "random"> }
> = {
  beginner: {
    name: "Beginner",
    summary: "Looks one move ahead and slips up now and then",
    // Shallow, no capture search, heavy noise and the odd random move.
    search: { depth: 2, timeMs: 400, quiescence: false, noise: 120, blunderChance: 0.15 },
  },
  medium: {
    name: "Medium",
    summary: "Sees basic tactics and rarely hangs a piece",
    search: { depth: 3, timeMs: 1200, quiescence: true, noise: 20, blunderChance: 0 },
  },
  pro: {
    name: "Pro",
    summary: "Deeper search, plays its best move every time",
    search: { depth: 6, timeMs: 2000, quiescence: true, noise: 0, blunderChance: 0 },
  },
};

export const BOT_DIFFICULTY_ORDER: BotDifficulty[] = ["beginner", "medium", "pro"];
