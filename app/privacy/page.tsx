import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { pageMetadata } from "@/lib/site";

export const metadata: Metadata = pageMetadata(
  "Privacy Policy",
  "What data Gambit collects to run accounts and online chess games, how it is stored, who processes it, and how to have it deleted.",
  "/privacy",
);

const UPDATED = "7 November 2026";

const SECTIONS: { heading: string; body: React.ReactNode[] }[] = [
  {
    heading: "The short version",
    body: [
      "Offline games — against the computer or two players on one device — never leave your device. We only store data when you create an account, play online or send us a message, and only what is needed to run those features. We don't sell data, show ads or use tracking cookies.",
    ],
  },
  {
    heading: "What we collect",
    body: [
      <>
        <strong className="text-ink">Account details.</strong> Your email address, username and a password hash, so you can log in
        and opponents can see who they are playing.
      </>,
      <>
        <strong className="text-ink">Online games.</strong> The moves, clocks and result of each online game, and the private rooms
        you create (room passwords are stored hashed). These build your win/loss statistics on your profile.
      </>,
      <>
        <strong className="text-ink">Contact messages.</strong> The name, email address and message you send through the{" "}
        <Link href="/contact" className="font-semibold text-accent hover:underline">contact form</Link>, so we can reply.
      </>,
      <>
        <strong className="text-ink">Abuse protection.</strong> Your IP address is used briefly as a rate-limit counter to stop
        automated abuse of sign-up checks and the contact form.
      </>,
    ],
  },
  {
    heading: "Stored on your device",
    body: [
      "Game settings (board theme, piece style, sounds, help level), your last game setup and your login session are kept in your browser's local storage. They are not sent to us except the session token, which proves who you are when you play online. Clearing your browser's site data removes them.",
    ],
  },
  {
    heading: "Who processes your data",
    body: [
      "Gambit is hosted on Vercel. Accounts, games and messages are stored in a Supabase database. Both act only on our behalf to run the service. Emails for confirming your address and resetting your password are sent through Supabase.",
    ],
  },
  {
    heading: "How long we keep it",
    body: [
      "Account details and game history are kept while your account exists. Contact messages are kept as long as needed to deal with them. Rate-limit counters are deleted within about an hour.",
    ],
  },
  {
    heading: "Your choices",
    body: [
      <>
        You can ask for a copy of your data, a correction, or deletion of your account and its games at any time through the{" "}
        <Link href="/contact" className="font-semibold text-accent hover:underline">contact page</Link>. Games you played remain
        visible to your opponent only if they were already recorded with your username; we remove your account details either way.
      </>,
    ],
  },
  {
    heading: "Children",
    body: ["Gambit is not directed at children under 13, and we don't knowingly collect their personal data."],
  },
  {
    heading: "Changes",
    body: ["If this policy changes, we update this page and the date below."],
  },
];

export default function PrivacyPage() {
  return (
    <>
      <Navbar />
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-[52rem] px-4 pt-10 pb-16 sm:px-6 lg:pt-14">
        <h1 className="animate-enter text-[2.5rem] leading-[1.02] font-extrabold sm:text-[3.5rem]">Privacy policy</h1>
        <p className="mt-4 text-sm text-faint">Last updated {UPDATED}</p>
        <div className="mt-10 space-y-10">
          {SECTIONS.map((section) => (
            <section key={section.heading}>
              <h2 className="text-2xl leading-tight font-bold">{section.heading}</h2>
              <div className="mt-4 space-y-4 text-[1.0625rem] leading-relaxed text-muted">
                {section.body.map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
        <p className="mt-12 text-[0.9375rem] text-muted">
          Questions? See the <Link href="/faq" className="font-semibold text-accent hover:underline">FAQ</Link> or{" "}
          <Link href="/contact" className="font-semibold text-accent hover:underline">contact us</Link>.
        </p>
      </main>
      <Footer />
    </>
  );
}
