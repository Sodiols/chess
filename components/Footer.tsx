import Link from "next/link";

const LINKS = [
  { href: "/play", label: "Play" },
  { href: "/play/computer", label: "Play the computer" },
  { href: "/play/rooms", label: "Private match" },
  { href: "/how-to-play", label: "How to play" },
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "Contact" },
  { href: "/privacy", label: "Privacy" },
];

export function Footer() {
  return (
    <footer className="mx-auto max-w-[92rem] overflow-hidden px-4 pt-20 pb-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3 text-sm text-muted">
        <p>Offline modes play entirely on this device. Online play needs a free Gambit account.</p>
        <nav aria-label="Footer" className="-mx-2 flex flex-wrap">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="inline-flex min-h-11 items-center px-2 hover:text-ink">
              {link.label}
            </Link>
          ))}
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
  );
}
