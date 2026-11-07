import type { Metadata } from "next";
import { NO_INDEX } from "@/lib/site";
import { OnlineGameScreen } from "@/components/multiplayer/OnlineGameScreen";

export const metadata: Metadata = { title: "Online game", robots: NO_INDEX };

export default async function GamePage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  return <OnlineGameScreen gameId={gameId} />;
}
