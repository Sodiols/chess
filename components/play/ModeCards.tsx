import Link from "next/link";
import clsx from "clsx";

interface ModeCard {
  id: string;
  title: string;
  description: string;
  where: "Online" | "Offline";
  actions: { label: string; href: string; primary?: boolean }[];
}

const CARDS: ModeCard[] = [
  {
    id: "online",
    title: "Play Online",
    description: "Get matched with a live opponent at the time control you choose.",
    where: "Online",
    actions: [{ label: "Find Opponent", href: "/play/online", primary: true }],
  },
  {
    id: "rooms",
    title: "Private Match",
    description: "Open a room with a code and password, or join a friend's.",
    where: "Online",
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
    actions: [{ label: "Play Computer", href: "/play/computer", primary: true }],
  },
  {
    id: "local",
    title: "Local 1v1",
    description: "Two players, one board, passed across the table.",
    where: "Offline",
    actions: [{ label: "Start Local Game", href: "/play/local", primary: true }],
  },
];

/** The four ways to play, as one list. Pure links, so it renders on the server. */
export function ModeCards({ heading: Heading = "h2" }: { heading?: "h2" | "h3" }) {
  return (
    <ul className="grid gap-1.5">
      {CARDS.map((card) => (
        <li key={card.id} className="reveal">
          <article className="grid grid-cols-1 items-center gap-x-4 gap-y-4 rounded-lg bg-raised px-4 py-5 transition-colors duration-200 hover:bg-[#262522] sm:px-6 xl:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <Heading className="text-xl leading-tight sm:text-2xl font-bold">{card.title}</Heading>
                <span className="text-sm text-faint">{card.where}</span>
              </div>
              <p className="mt-1.5 text-base leading-snug text-muted">{card.description}</p>
            </div>

            <div className="flex flex-wrap gap-2 xl:justify-end">
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
