import type { Metadata, Viewport } from "next";
import { Manrope, IBM_Plex_Mono } from "next/font/google";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

const HOME_TITLE = "Gambit — Play Chess Online, vs Computer or a Friend";
const HOME_DESCRIPTION =
  "Play free chess in your browser: live online matchmaking, private rooms with friends, a computer opponent with three levels, and offline two-player games on one device.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: HOME_TITLE, template: `%s — ${SITE_NAME}` },
  description: HOME_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: ["chess", "play chess online", "chess vs computer", "free chess", "chess with friends", "learn chess"],
  alternates: { canonical: "/" },
  openGraph: { type: "website", siteName: SITE_NAME, locale: "en_US", title: HOME_TITLE, description: HOME_DESCRIPTION, url: "/" },
  twitter: { card: "summary_large_image", title: HOME_TITLE, description: HOME_DESCRIPTION },
  verification: { google: "iEQ4_JCjqMIA2XScyuNewP0E9x8IZbxG1sdlqgcoWXY" },
};

export const viewport: Viewport = {
  themeColor: "#0e0e0d",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${manrope.variable} ${plexMono.variable}`}>
      <body className="min-h-dvh antialiased">
        {/* Clips the few px the tilted 3D board projects past narrow screens. On a
            wrapper, not body, because body overflow passes to the viewport and phones
            would still zoom out to fit; clip (unlike hidden) keeps sticky working. */}
        <div className="min-h-dvh overflow-x-clip">{children}</div>
      </body>
    </html>
  );
}
