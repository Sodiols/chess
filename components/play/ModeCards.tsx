import Link from "next/link";
import clsx from "clsx";
import { ChipIcon, GlobeIcon, LockIcon, UsersIcon } from "@/components/ui/icons";

interface ModeCard {
  id: string;
  title: string;
  description: string;
  tag: string;
  icon: React.ReactNode;
  actions: { label: string; href: string; primary?: boolean }[];
}

const CARDS: ModeCard[] = [
  {
    id: "online",
    title: "Play Online",
    description: "Find an opponent and start a live chess match.",
    tag: "Online",
    icon: <GlobeIcon className="size-5" />,
    actions: [{ label: "Find Opponent", href: "/play/online", primary: true }],
  },
  {
    id: "rooms",
    title: "Private Match",
    description: "Create a room or join another player's match.",
    tag: "Online",
    icon: <LockIcon className="size-5" />,
    actions: [
      { label: "Create Room", href: "/play/rooms#create-heading", primary: true },
      { label: "Join Room", href: "/play/rooms#join-heading" },
    ],
  },
  {
    id: "computer",
    title: "Play Computer",
    description: "Challenge a computer opponent at your preferred difficulty.",
    tag: "Offline",
    icon: <ChipIcon className="size-5" />,
    actions: [{ label: "Play Computer", href: "/play/computer", primary: true }],
  },
  {
    id: "local",
    title: "Local 1v1",
    description: "Play against someone on the same device.",
    tag: "Offline",
    icon: <UsersIcon className="size-5" />,
    actions: [{ label: "Start Local Game", href: "/play/local", primary: true }],
  },
];

/** The four ways to play. Pure links, so it renders on the server. */
export function ModeCards() {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4">
      {CARDS.map((card, index) => (
        <li
          key={card.id}
          className="animate-rise [animation-fill-mode:backwards]"
          style={{ animationDelay: `${index * 50}ms` }}
        >
          <article className="group flex h-full flex-col rounded-xl border border-line bg-surface p-5 transition-colors duration-150 hover:border-line-strong hover:bg-raised/60 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <span className="flex size-10 items-center justify-center rounded-lg border border-line bg-raised text-accent transition-colors group-hover:border-accent/50">
                {card.icon}
              </span>
              <span className="text-[0.6875rem] tracking-wide text-faint uppercase">{card.tag}</span>
            </div>
            <h2 className="mt-4 text-lg font-semibold">{card.title}</h2>
            <p className="mt-1 flex-1 text-sm text-muted">{card.description}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {card.actions.map((action) => (
                <Link
                  key={action.label}
                  href={action.href}
                  className={clsx(
                    "inline-flex h-10 items-center rounded-lg px-4 text-sm transition-colors",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                    action.primary
                      ? "bg-accent font-semibold text-[#231a0c] hover:bg-[#dcb673]"
                      : "border border-line bg-raised text-ink hover:border-line-strong hover:bg-[#26262b]",
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
