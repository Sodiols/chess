import type { Metadata } from "next";

export const metadata: Metadata = { title: "Play Online — Gambit" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
