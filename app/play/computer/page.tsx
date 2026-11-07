import type { Metadata } from "next";
import { pageMetadata } from "@/lib/site";
import { PlayFlow } from "@/components/game/PlayFlow";

export const metadata: Metadata = pageMetadata(
  "Play Chess vs Computer",
  "Play chess against the computer for free, with Beginner, Medium and Pro difficulty. Runs on your device, works offline and needs no account.",
  "/play/computer",
);

export default function ComputerPlayPage() {
  return <PlayFlow initialMode={null} variant="computer" />;
}
