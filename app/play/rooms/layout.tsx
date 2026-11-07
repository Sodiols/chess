import type { Metadata } from "next";

export const metadata: Metadata = { title: "Private Match — Gambit" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
