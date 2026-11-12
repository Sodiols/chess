import { notFound } from "next/navigation";
import { SpectatorGame } from "@/components/social/SpectatorGame";
export const metadata = { title: "Spectate match", robots: { index: false } };
export default async function SpectatePage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(sessionId)) notFound();
  return <SpectatorGame key={sessionId} id={sessionId} />;
}
