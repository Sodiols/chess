import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { ModeChooser } from "@/components/ModeChooser";
import { MiniBoard } from "@/components/chess/MiniBoard";
import { ModeCards } from "@/components/play/ModeCards";

/** Ruy López after 3.Bb5 — a real position rather than a decorative one. */
const HERO_FEN = "r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3";

export default function HomePage() {
  return (
    <>
      <Navbar />

      <main>
        <section className="mx-auto max-w-[92rem] px-4 pt-12 pb-14 sm:px-5 sm:pt-16 lg:px-8 lg:pt-24 lg:pb-20">
          <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
            <div className="max-w-xl">
              <p className="eyebrow">Online and offline chess</p>
              <h1 className="mt-3 text-[2.5rem] leading-[1.04] font-bold sm:text-5xl lg:text-[3.5rem]">
                Chess, your way.
              </h1>
              <p className="mt-5 text-[1.0625rem] leading-relaxed text-muted">
                Play a live opponent online, set up a private room for a friend, take
                on the computer, or share one board. Choose how much the board helps
                you — from every legal move spelled out to nothing at all.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href="/play"
                  className="inline-flex h-12 items-center rounded-lg bg-accent px-6 text-[0.9375rem] font-semibold text-[#231a0c] transition-colors hover:bg-[#dcb673]"
                >
                  Start playing
                </Link>
                <Link
                  href="/how-to-play"
                  className="inline-flex h-12 items-center rounded-lg px-4 text-[0.9375rem] text-muted transition-colors hover:bg-raised hover:text-ink"
                >
                  Learn the rules
                </Link>
              </div>
            </div>

            <div className="mx-auto w-full max-w-[26rem] lg:max-w-none">
              <MiniBoard
                fen={HERO_FEN}
                marks={["f1", "b5"]}
                label="Chessboard showing the Ruy López opening after three moves"
              />
            </div>
          </div>
        </section>

        <section
          aria-labelledby="ways-heading"
          className="mx-auto max-w-[92rem] border-t border-line px-4 py-12 sm:px-5 lg:px-8 lg:py-16"
        >
          <h2 id="ways-heading" className="text-2xl font-bold">
            Four ways to play
          </h2>
          <div className="mt-7">
            <ModeCards />
          </div>
        </section>

        <section
          aria-labelledby="modes-heading"
          className="mx-auto max-w-[92rem] border-t border-line px-4 py-12 sm:px-5 lg:px-8 lg:py-16"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
            <h2 id="modes-heading" className="text-2xl font-bold">
              Three levels of assistance
            </h2>
            <p className="text-sm text-muted">
              The rules never change — only how much the board tells you.
            </p>
          </div>

          <div className="mt-7">
            <ModeChooser />
          </div>
        </section>
      </main>

      <footer className="mx-auto max-w-[92rem] border-t border-line px-4 py-6 text-xs text-faint sm:px-5 lg:px-8">
        Offline modes play entirely on this device. Online play uses a guest identity — no account needed.
      </footer>
    </>
  );
}
