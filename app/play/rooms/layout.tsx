import type { Metadata } from "next";
import { pageMetadata } from "@/lib/site";

export const metadata: Metadata = pageMetadata(
  "Private Chess Match",
  "Create a private chess room with an ID and password and invite a friend, or join an open room to play a live game online.",
  "/play/rooms",
);

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
