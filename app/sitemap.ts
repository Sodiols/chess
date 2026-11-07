import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/** Public pages only; signed-in, one-time and game pages are left out (and noindexed). */
const PAGES: { path: string; priority: number }[] = [
  { path: "/", priority: 1 },
  { path: "/play", priority: 0.9 },
  { path: "/play/computer", priority: 0.9 },
  { path: "/play/online", priority: 0.8 },
  { path: "/play/rooms", priority: 0.8 },
  { path: "/play/local", priority: 0.8 },
  { path: "/how-to-play", priority: 0.8 },
  { path: "/faq", priority: 0.6 },
  { path: "/contact", priority: 0.4 },
  { path: "/privacy", priority: 0.3 },
  { path: "/signup", priority: 0.5 },
  { path: "/login", priority: 0.4 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map(({ path, priority }) => ({
    url: `${SITE_URL}${path === "/" ? "" : path}`,
    changeFrequency: "monthly",
    priority,
  }));
}
