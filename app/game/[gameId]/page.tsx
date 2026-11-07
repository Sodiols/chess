import type { Metadata } from "next";
import { OnlineGameScreen } from "@/components/multiplayer/OnlineGameScreen";

export const metadata: Metadata = {
  title: "Online game — Gambit",
};

export default async function GamePage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  return <OnlineGameScreen gameId={gameId} />;
}
