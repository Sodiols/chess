"use client";

import { Navbar } from "@/components/Navbar";
import { OnlineGate } from "@/components/multiplayer/OnlineGate";
import type { Profile } from "@/lib/multiplayer/types";

/** Page frame for the online lobbies: heading, signed-in player, then content. */
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
      <main id="main-content" tabIndex={-1}
        className={`mx-auto w-full px-4 pt-10 pb-24 sm:px-6 sm:pt-14 lg:px-8 ${width === "wide" ? "max-w-[92rem]" : "max-w-[80rem]"}`}
      >
        <h1 className="animate-enter text-[2.5rem] leading-[1] font-extrabold sm:text-[3.5rem]">
          {title}
        </h1>
        <p
          className="mt-4 mb-10 animate-enter text-lg text-muted"
          style={{ animationDelay: "60ms" }}
        >
          {description}
        </p>
        <OnlineGate>{children}</OnlineGate>
      </main>
    </>
  );
}
