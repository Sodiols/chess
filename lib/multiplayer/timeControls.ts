import type { TimeControl } from "@/types";

/** Online games are always timed, so an abandoned game still ends on the clock. */
export const ONLINE_TIME_CONTROLS: { id: string; label: string; group: string; control: TimeControl }[] = [
  { id: "1+0", label: "1 min", group: "Bullet", control: { initialMs: 60_000, incrementMs: 0 } },
  { id: "3+0", label: "3 min", group: "Blitz", control: { initialMs: 180_000, incrementMs: 0 } },
  { id: "3+2", label: "3 | 2", group: "Blitz", control: { initialMs: 180_000, incrementMs: 2000 } },
  { id: "5+0", label: "5 min", group: "Blitz", control: { initialMs: 300_000, incrementMs: 0 } },
  { id: "10+0", label: "10 min", group: "Rapid", control: { initialMs: 600_000, incrementMs: 0 } },
  { id: "10+5", label: "10 | 5", group: "Rapid", control: { initialMs: 600_000, incrementMs: 5000 } },
  { id: "15+10", label: "15 | 10", group: "Rapid", control: { initialMs: 900_000, incrementMs: 10_000 } },
  { id: "30+0", label: "30 min", group: "Classical", control: { initialMs: 1_800_000, incrementMs: 0 } },
];

export const DEFAULT_ONLINE_TIME_CONTROL = "5+0";

export function findOnlineTimeControl(initialMs: unknown, incrementMs: unknown) {
  return ONLINE_TIME_CONTROLS.find(
    (entry) => entry.control.initialMs === initialMs && entry.control.incrementMs === incrementMs,
  );
}

export function onlineTimeControlById(id: string) {
  return ONLINE_TIME_CONTROLS.find((entry) => entry.id === id) ?? ONLINE_TIME_CONTROLS[3]!;
}
