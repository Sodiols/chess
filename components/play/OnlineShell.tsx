"use client";

import { Navbar } from "@/components/Navbar";
import { OnlineGate } from "@/components/multiplayer/OnlineGate";
import type { Profile } from "@/lib/multiplayer/types";

/** Page frame for the online lobbies: heading, guest identity, then content. */
export function OnlineShell({
  title,
  description,
  width = "narrow",
  children,
}: {
  title: string;
  description: string;
  width?: "narrow" | "wide";
  children: (profile: Profile) => React.ReactNode;
}) {
  return (
    <>
      <Navbar />
      <main
        className={`mx-auto w-full px-4 pt-8 pb-16 sm:px-5 sm:pt-10 ${width === "wide" ? "max-w-6xl" : "max-w-2xl"}`}
      >
        <h1 className="text-2xl font-bold sm:text-[1.75rem]">{title}</h1>
        <p className="mt-1.5 mb-7 text-sm text-muted">{description}</p>
        <OnlineGate>{children}</OnlineGate>
      </main>
    </>
  );
}
