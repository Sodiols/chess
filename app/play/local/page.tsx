import type { Metadata } from "next";
import { pageMetadata } from "@/lib/site";
import type { AssistanceMode } from "@/types";
import { MODE_ORDER } from "@/constants/assistance";
import { PlayFlow } from "@/components/game/PlayFlow";

export const metadata: Metadata = pageMetadata(
  "Local 2-Player Chess",
  "Play chess with a friend on one device. Pass-and-play with optional clocks, undo and beginner hints that show legal moves, captures and pins.",
  "/play/local",
);

function parseMode(value: string | string[] | undefined): AssistanceMode | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return MODE_ORDER.find((mode) => mode === candidate) ?? null;
}

export default async function LocalPlayPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { mode } = await searchParams;
  return <PlayFlow initialMode={parseMode(mode)} />;
}
