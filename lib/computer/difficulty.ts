import type { BotDifficulty } from "@/types";
import type { SearchOptions } from "./search";

export const BOT_DIFFICULTIES: Record<
  BotDifficulty,
  { name: string; summary: string; replyDelayMs: number; search: Omit<SearchOptions, "random"> }
> = {
  beginner: {
    name: "Beginner",
    summary: "Plays simple moves, overlooks threats, and takes its time",
    replyDelayMs: 2400,
    search: { depth: 1, timeMs: 400, quiescence: false, noise: 90, blunderChance: 0.28 },
  },
  medium: {
    name: "Medium",
    summary: "Spots basic tactics and considers exchanges",
    replyDelayMs: 1900,
    search: { depth: 3, timeMs: 1200, quiescence: true, noise: 35, blunderChance: 0 },
  },
  pro: {
    name: "Pro",
    summary: "Calculates deeper lines and chooses the strongest move it finds",
    replyDelayMs: 2200,
    search: { depth: 7, timeMs: 2800, quiescence: true, noise: 0, blunderChance: 0 },
  },
};

export const BOT_DIFFICULTY_ORDER: BotDifficulty[] = ["beginner", "medium", "pro"];
