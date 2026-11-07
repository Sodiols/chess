import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { ModeCards } from "@/components/play/ModeCards";
import { ShowcaseBoard } from "@/components/chess/ShowcaseBoard";
import { OPENINGS } from "@/constants/openings";

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
      <main className="mx-auto grid w-full max-w-[92rem] gap-x-16 gap-y-12 px-4 pt-10 pb-24 sm:px-6 sm:pt-14 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:px-8">
        <div>
          <h1 className="animate-enter text-[2.5rem] leading-[1] font-extrabold sm:text-[3.5rem]">
            How do you want to play?
          </h1>
          <p className="mt-5 max-w-[28rem] animate-enter text-lg leading-relaxed text-muted" style={{ animationDelay: "60ms" }}>
            Online modes connect you with real players. Offline modes run entirely on this
            device, with no account.
          </p>
          <div className="mt-12 hidden animate-enter lg:block" style={{ animationDelay: "160ms" }}>
            <ShowcaseBoard opening={OPENINGS.queensGambit} className="max-w-[30rem]" />
          </div>
        </div>

        <div className="animate-enter" style={{ animationDelay: "100ms" }}>
          <ModeCards />
          <p className="mt-8 text-[0.9375rem] text-muted">
            New to chess?{" "}
            <Link href="/how-to-play" className="font-semibold text-accent hover:underline">
              Learn the rules in five minutes
            </Link>
          </p>
        </div>
      </main>
    </>
  );
}
