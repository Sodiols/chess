import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { ModeCards } from "@/components/play/ModeCards";

export const metadata: Metadata = {
  title: "Play — Gambit",
};

export default async function PlayPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Older links chose an assistance level here; they now belong to local play.
  const { mode } = await searchParams;
  if (typeof mode === "string") redirect(`/play/local?mode=${encodeURIComponent(mode)}`);

  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-4xl px-4 pt-8 pb-16 sm:px-5 sm:pt-12">
        <p className="eyebrow">Play</p>
        <h1 className="mt-2 text-2xl font-bold sm:text-[2rem]">How do you want to play?</h1>
        <p className="mt-2 text-sm text-muted">
          Online modes connect you with real players. Offline modes run entirely on this device.
        </p>
        <div className="mt-8">
          <ModeCards />
        </div>
      </main>
    </>
  );
}
