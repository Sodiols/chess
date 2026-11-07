import type { Metadata } from "next";
import { pageMetadata } from "@/lib/site";

export const metadata: Metadata = pageMetadata(
  "Play Chess Online",
  "Get matched with a real opponent for a live online chess game, from 1-minute bullet to 30-minute classical time controls.",
  "/play/online",
);

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
