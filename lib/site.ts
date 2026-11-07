import type { Metadata } from "next";

export const SITE_URL = "https://chessgame-gambit.vercel.app";
export const SITE_NAME = "Gambit";

/** Title, description, canonical URL and share-card text for one page. */
export function pageMetadata(title: string, description: string, path: string): Metadata {
  const shareTitle = `${title} — ${SITE_NAME}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { type: "website", siteName: SITE_NAME, locale: "en_US", title: shareTitle, description, url: path },
    twitter: { card: "summary_large_image", title: shareTitle, description },
  };
}

/** For signed-in or one-time pages that search engines should not list. */
export const NO_INDEX: Metadata["robots"] = { index: false, follow: true };
