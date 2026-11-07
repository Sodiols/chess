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
      <main className="mx-auto w-full max-w-4xl px-4 pt-10 pb-20 sm:px-6 sm:pt-16">
        <h1 className="animate-enter text-[2.25rem] leading-[1.05] font-extrabold sm:text-[3rem]">How do you want to play?</h1>
        <p className="mt-4 animate-enter text-[1.0625rem] text-muted" style={{ animationDelay: "80ms" }}>
          Online modes connect you with real players. Offline modes run entirely on this device.
        </p>
        <div className="mt-10">
          <ModeCards />
        </div>
      </main>
    </>
  );
}
