import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { MiniBoard } from "@/components/chess/MiniBoard";

export const metadata: Metadata = {
  title: "Page not found",
  description: "This page doesn't exist. Head back to Gambit to play chess online, against the computer or with a friend.",
};

export default function NotFound() {
  return (
    <>
      <Navbar />
      <main className="mx-auto grid w-full max-w-[92rem] items-center gap-12 px-4 pt-10 pb-16 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:px-8 lg:pt-16">
        <div>
          <p className="font-mono text-sm text-faint">Error 404</p>
          <h1 className="mt-3 animate-enter text-[2.5rem] leading-[1] font-extrabold sm:text-[3.5rem]">
            This square is empty.
          </h1>
          <p className="mt-5 max-w-[32rem] text-lg leading-relaxed text-muted">
            The page you were looking for doesn&apos;t exist or has moved. Try one of these instead.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link
              href="/"
              className="press inline-flex h-13 items-center rounded-md bg-accent px-7 text-base font-bold text-[#1f170a] hover:bg-[#e2b970]"
            >
              Back to home
            </Link>
            <Link href="/play" className="inline-flex h-13 items-center font-semibold text-muted hover:text-ink hover:underline">
              Start a game
            </Link>
            <Link href="/how-to-play" className="inline-flex h-13 items-center font-semibold text-muted hover:text-ink hover:underline">
              Learn the rules
            </Link>
            <Link href="/faq" className="inline-flex h-13 items-center font-semibold text-muted hover:text-ink hover:underline">
              FAQ
            </Link>
          </div>
        </div>
        <MiniBoard fen="4k3/8/8/8/8/8/8/4K3 w - - 0 1" marks={["d4"]} label="An almost empty chessboard with the d4 square marked" />
      </main>
      <Footer />
    </>
  );
}
