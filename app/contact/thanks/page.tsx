import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { NO_INDEX } from "@/lib/site";

export const metadata: Metadata = {
  title: "Message sent",
  description: "Thanks for contacting Gambit. We've received your message and will reply by email.",
  robots: NO_INDEX,
};

export default function ContactThanksPage() {
  return (
    <>
      <Navbar />
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-[40rem] px-4 pt-10 pb-16 sm:px-6 lg:pt-14">
        <h1 className="animate-enter text-[2.5rem] leading-[1.02] font-extrabold sm:text-[3.5rem]">Thank you!</h1>
        <p className="mt-5 text-lg leading-relaxed text-muted">
          Your message has arrived. We read every one and will reply to the email address you gave us.
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3">
          <Link
            href="/play"
            className="press inline-flex h-13 items-center rounded-md bg-accent px-7 text-base font-bold text-[#1f170a] hover:bg-[#e2b970]"
          >
            Play a game
          </Link>
          <Link href="/" className="inline-flex h-13 items-center font-semibold text-muted hover:text-ink hover:underline">
            Back to home
          </Link>
          <Link href="/faq" className="inline-flex h-13 items-center font-semibold text-muted hover:text-ink hover:underline">
            Read the FAQ
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
