import type { Metadata } from "next";
import { PlayFlow } from "@/components/game/PlayFlow";

export const metadata: Metadata = {
  title: "Play Computer — Gambit",
};

export default function ComputerPlayPage() {
  return <PlayFlow initialMode={null} variant="computer" />;
}
