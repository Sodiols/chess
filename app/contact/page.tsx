import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { ContactForm } from "@/components/ContactForm";
import { pageMetadata } from "@/lib/site";

export const metadata: Metadata = pageMetadata(
  "Contact Us",
  "Report a bug, suggest a feature or ask a question about Gambit. Send us a message and we'll reply by email.",
  "/contact",
);

export default function ContactPage() {
  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-[40rem] px-4 pt-10 pb-16 sm:px-6 lg:pt-14">
        <h1 className="animate-enter text-[2.5rem] leading-[1.02] font-extrabold sm:text-[3.5rem]">Contact us</h1>
        <p className="mt-5 text-lg leading-relaxed text-muted">
          Found a bug, have an idea or a question? Many answers are already in the{" "}
          <Link href="/faq" className="font-semibold text-accent hover:underline">FAQ</Link>. Otherwise, write to us below and
          we&apos;ll reply by email.
        </p>
        <div className="mt-10">
          <ContactForm />
        </div>
        <p className="mt-8 text-sm text-faint">
          We use your details only to reply. See our{" "}
          <Link href="/privacy" className="text-muted underline hover:text-ink">privacy policy</Link>.
        </p>
      </main>
      <Footer />
    </>
  );
}
