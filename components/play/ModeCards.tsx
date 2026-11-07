import Link from "next/link";
import clsx from "clsx";
import type { PieceSymbol } from "@/types";
import { PIECE_GEOMETRY, PIECE_VIEWBOX } from "@/lib/pieces";

interface ModeCard {
  id: string;
  title: string;
  description: string;
  where: "Online" | "Offline";
  /** Each mode is marked by a piece from the board's own set. */
  piece: PieceSymbol;
  actions: { label: string; href: string; primary?: boolean }[];
}

const CARDS: ModeCard[] = [
  {
    id: "online",
    title: "Play Online",
    description: "Get matched with a live opponent at the time control you choose.",
    where: "Online",
    piece: "n",
    actions: [{ label: "Find Opponent", href: "/play/online", primary: true }],
  },
  {
    id: "rooms",
    title: "Private Match",
    description: "Open a room with a code and password, or join a friend's.",
    where: "Online",
    piece: "r",
    actions: [
      { label: "Create Room", href: "/play/rooms#create-heading", primary: true },
      { label: "Join Room", href: "/play/rooms#join-heading" },
    ],
  },
  {
    id: "computer",
    title: "Play Computer",
    description: "Three strengths, from friendly to sharp. Runs on this device.",
    where: "Offline",
    piece: "q",
    actions: [{ label: "Play Computer", href: "/play/computer", primary: true }],
  },
  {
    id: "local",
    title: "Local 1v1",
    description: "Two players, one board, passed across the table.",
    where: "Offline",
    piece: "p",
    actions: [{ label: "Start Local Game", href: "/play/local", primary: true }],
  },
];

/** The four ways to play, as one list. Pure links, so it renders on the server. */
export function ModeCards({ heading: Heading = "h2" }: { heading?: "h2" | "h3" }) {
  return (
    <ul className="grid gap-1.5">
      {CARDS.map((card) => (
        <li key={card.id} className="reveal">
          <article className="group grid grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-x-5 gap-y-4 rounded-lg bg-raised px-5 py-6 transition-colors duration-200 hover:bg-[#262522] sm:grid-cols-[3.25rem_minmax(0,1fr)_auto] sm:px-7">
            <svg
              viewBox={PIECE_VIEWBOX}
              aria-hidden
              className="size-11 fill-faint transition-[transform,fill] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:-translate-y-1 group-hover:-rotate-6 group-hover:fill-accent sm:size-13"
            >
              {PIECE_GEOMETRY[card.piece].body.map((d, index) => (
                <path key={index} d={d} />
              ))}
            </svg>

            <div className="min-w-0">
              <Heading className="text-2xl leading-tight font-bold">{card.title}</Heading>
              <p className="mt-1.5 text-base leading-snug text-muted">
                {card.description} <span className="whitespace-nowrap text-faint">· {card.where}</span>
              </p>
            </div>

            <div className="col-span-2 flex flex-wrap gap-2 sm:col-span-1 sm:justify-end">
              {card.actions.map((action) => (
                <Link
                  key={action.label}
                  href={action.href}
                  className={clsx(
                    "press inline-flex h-11 items-center rounded-md px-5 text-sm whitespace-nowrap",
                    action.primary
                      ? "bg-accent font-bold text-[#1f170a] hover:bg-[#e2b970]"
                      : "bg-[#2c2b28] font-semibold text-ink hover:bg-[#363531]",
                  )}
                >
                  {action.label}
                </Link>
              ))}
            </div>
          </article>
        </li>
      ))}
    </ul>
  );
}
