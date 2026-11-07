import type { Metadata } from "next";

export const SITE_URL = "https://chessgame-gambit.vercel.app";
export const SITE_NAME = "Gambit";
const SHARE_IMAGE = { url: "/opengraph-image", width: 1200, height: 630, alt: "Gambit — play chess online, against the computer or with a friend" };

/** Title, description, canonical URL and share-card text for one page. */
export function pageMetadata(title: string, description: string, path: string): Metadata {
  const shareTitle = `${title} — ${SITE_NAME}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    // A page's own openGraph replaces the root's wholesale, so the share image is named again here.
    openGraph: { type: "website", siteName: SITE_NAME, locale: "en_US", title: shareTitle, description, url: path, images: SHARE_IMAGE },
    twitter: { card: "summary_large_image", title: shareTitle, description, images: SHARE_IMAGE },
  };
}

/** For signed-in or one-time pages that search engines should not list. */
export const NO_INDEX: Metadata["robots"] = { index: false, follow: true };
