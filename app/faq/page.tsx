import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { pageMetadata } from "@/lib/site";

export const metadata: Metadata = pageMetadata(
  "Chess FAQ",
  "Answers about Gambit: is it free, do you need an account, playing offline, private rooms, computer difficulty, time controls and the three help levels.",
  "/faq",
);

/** Plain-text answers so the same copy feeds the page and the FAQ rich result. */
const FAQS: { q: string; a: string; link?: { href: string; label: string } }[] = [
  {
    q: "Is Gambit free?",
    a: "Yes. Every mode — online matchmaking, private rooms, the computer and two-player games on one device — is free to play.",
  },
  {
    q: "Do I need an account to play?",
    a: "Only for online play. Playing the computer and two-player games on one device need no account at all. Online games and private rooms need a free account so opponents see a username and your results are recorded.",
    link: { href: "/signup", label: "Create a free account" },
  },
  {
    q: "Can I play chess offline?",
    a: "Yes. Games against the computer and local two-player games run entirely on your device, so they keep working without an internet connection once the page has loaded.",
    link: { href: "/play/computer", label: "Play the computer" },
  },
  {
    q: "How strong is the computer opponent?",
    a: "There are three levels. Beginner looks one move ahead and slips up now and then. Medium sees basic tactics and rarely hangs a piece. Pro searches deeper and plays its best move every time.",
  },
  {
    q: "How do I play chess with a friend online?",
    a: "Open Private match, create a room and share its 6-character room ID and password with your friend. They enter both to join, and the game starts straight away.",
    link: { href: "/play/rooms", label: "Create a private room" },
  },
  {
    q: "Which time controls can I play online?",
    a: "Online games are always timed, from 1-minute bullet through blitz (3, 3 | 2, 5 minutes) and rapid (10, 10 | 5, 15 | 10) up to 30-minute classical.",
    link: { href: "/play/online", label: "Find an online opponent" },
  },
  {
    q: "What are the Beginner, Medium and Pro help levels?",
    a: "They change how much the board tells you, never the rules. Beginner marks legal moves and captures, explains pins and checks, and allows undo. Medium still shows legal moves. Pro shows nothing — just you and the board.",
  },
  {
    q: "I'm new to chess. Where should I start?",
    a: "Read the five-minute rules guide, then play the computer on Beginner with the Beginner help level so the board shows every legal move as you go.",
    link: { href: "/how-to-play", label: "Learn the rules" },
  },
  {
    q: "I forgot my password. How do I get back in?",
    a: "Use “Forgot password” on the log-in page. We email you a link to choose a new one.",
    link: { href: "/forgot-password", label: "Reset your password" },
  },
  {
    q: "How do I report a bug or ask something else?",
    a: "Send us a message through the contact form and we'll get back to you by email.",
    link: { href: "/contact", label: "Contact us" },
  },
];

const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map(({ q, a }) => ({
    "@type": "Question",
    name: q,
    acceptedAnswer: { "@type": "Answer", text: a },
  })),
};

export default function FaqPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }} />
      <Navbar />
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-[52rem] px-4 pt-10 pb-16 sm:px-6 lg:pt-14">
        <h1 className="animate-enter text-[2.5rem] leading-[1.02] font-extrabold sm:text-[3.5rem]">
          Frequently asked questions
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">
          Everything people usually ask about playing on Gambit. Can&apos;t find your answer?{" "}
          <Link href="/contact" className="font-semibold text-accent hover:underline">
            Ask us
          </Link>
          .
        </p>

        <div className="mt-12 divide-y divide-line border-y border-line">
          {FAQS.map(({ q, a, link }) => (
            <section key={q} className="py-7">
              <h2 className="text-xl leading-snug font-bold">{q}</h2>
              <p className="mt-3 text-[1.0625rem] leading-relaxed text-muted">{a}</p>
              {link && (
                <Link href={link.href} className="mt-3 inline-block py-1 font-semibold text-accent hover:underline">
                  {link.label} →
                </Link>
              )}
            </section>
          ))}
        </div>
      </main>
      <Footer />
    </>
  );
}
