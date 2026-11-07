import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { ModeChooser } from "@/components/ModeChooser";
import { ShowcaseBoard } from "@/components/chess/ShowcaseBoard";
import { ModeCards } from "@/components/play/ModeCards";

export default function HomePage() {
  return (
    <>
      <Navbar />

      <main>
        <section className="mx-auto grid max-w-[92rem] items-center gap-12 px-4 pt-10 pb-20 sm:px-6 lg:min-h-[calc(100dvh-3.75rem)] lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-10 lg:px-8 lg:pt-6 lg:pb-16">
          <div>
            <h1 className="animate-enter text-[clamp(3.25rem,7.6vw,7.5rem)] leading-[0.94] font-extrabold tracking-[-0.045em]">
              Chess, your&nbsp;way.
            </h1>
            <p
              className="mt-8 max-w-[34rem] animate-enter text-xl leading-relaxed text-ink"
              style={{ animationDelay: "90ms" }}
            >
              Play live opponents online, invite a friend to a private room, take on the
              computer or share one board — with as much help from the board as you want.
            </p>

            <div
              className="mt-10 flex animate-enter flex-wrap items-center gap-x-6 gap-y-3"
              style={{ animationDelay: "180ms" }}
            >
              <Link
                href="/play"
                className="press inline-flex h-13 items-center rounded-md bg-accent px-7 text-base font-bold text-[#1f170a] hover:bg-[#e2b970]"
              >
                Start playing
              </Link>
              <Link
                href="/how-to-play"
                className="press inline-flex h-13 items-center text-base font-semibold text-muted underline-offset-4 hover:text-ink hover:underline"
              >
                Learn the rules
              </Link>
            </div>
          </div>

          <div className="mx-auto w-full animate-enter lg:max-w-[44rem]" style={{ animationDelay: "120ms" }}>
            <ShowcaseBoard />
          </div>
        </section>

        <section aria-labelledby="ways-heading" className="mx-auto max-w-[92rem] px-4 py-20 sm:px-6 lg:px-8 lg:py-32">
          <div className="grid gap-x-10 gap-y-4 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]">
            <div className="reveal">
              <h2 id="ways-heading" className="text-[clamp(2rem,4vw,3.5rem)] leading-[1] font-extrabold">
                Four ways to play
              </h2>
              <p className="mt-5 max-w-[26rem] text-lg leading-relaxed text-muted">
                Online games need a free account. The computer and the shared board run on
                this device and keep working offline.
              </p>
            </div>
            <ModeCards heading="h3" />
          </div>
        </section>

        <section aria-labelledby="modes-heading" className="bg-surface">
          <div className="mx-auto max-w-[92rem] px-4 py-20 sm:px-6 lg:px-8 lg:py-32">
            <div className="reveal flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
              <h2 id="modes-heading" className="text-[clamp(2rem,4vw,3.5rem)] leading-[1] font-extrabold">
                Three levels of help
              </h2>
              <p className="max-w-[30rem] text-lg leading-relaxed text-muted">
                The rules never change, only how much the board tells you. Here is the same
                knight on f3 in each mode.
              </p>
            </div>

            <div className="mt-12">
              <ModeChooser />
            </div>
          </div>
        </section>
      </main>

      <footer className="mx-auto max-w-[92rem] overflow-hidden px-4 pt-20 pb-8 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3 text-sm text-muted">
          <p>Offline modes play entirely on this device. Online play needs a free Gambit account.</p>
          <nav aria-label="Footer" className="flex gap-6">
            <Link href="/play" className="hover:text-ink">
              Play
            </Link>
            <Link href="/how-to-play" className="hover:text-ink">
              How to play
            </Link>
            <Link href="/profile" className="hover:text-ink">
              Profile
            </Link>
          </nav>
        </div>
        <p
          aria-hidden
          translate="no"
          className="mt-10 text-[min(28vw,26rem)] leading-[0.78] font-extrabold tracking-[-0.06em] whitespace-nowrap text-[#67635c] select-none"
        >
          Gambit
        </p>
      </footer>
    </>
  );
}
