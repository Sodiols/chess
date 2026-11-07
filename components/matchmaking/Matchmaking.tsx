"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useMatchmaking } from "@/hooks/useMatchmaking";
import { onlinePreferences } from "@/lib/multiplayer/preferences";
import { onlineTimeControlById } from "@/lib/multiplayer/timeControls";
import { errorMessage, type Profile } from "@/lib/multiplayer/types";
import { Button } from "@/components/ui/Button";
import { ShowcaseBoard } from "@/components/chess/ShowcaseBoard";
import { OPENINGS } from "@/constants/openings";
import { TimeControlPicker } from "@/components/multiplayer/TimeControlPicker";

export function Matchmaking({ profile }: { profile: Profile }) {
  const router = useRouter();
  const prefs = useSyncExternalStore(
    onlinePreferences.subscribe,
    onlinePreferences.getSnapshot,
    onlinePreferences.getServerSnapshot,
  );
  const preset = onlineTimeControlById(prefs.timeControl);
  const { state, start, cancel } = useMatchmaking(profile.id, (gameId) =>
    router.push(`/game/${gameId}`),
  );

  const searching =
    state.status === "searching" ||
    state.status === "joining" ||
    state.status === "matched";

  return (
    <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,32rem)_minmax(0,1fr)] lg:gap-16">
      {searching ? (
        <Searching
          label={preset.label}
          since={state.status === "searching" ? state.since : null}
          matched={state.status === "matched"}
          onCancel={() => void cancel()}
        />
      ) : (
        <div className="animate-rise space-y-8">
          <TimeControlPicker
            value={preset.id}
            onChange={(timeControl) =>
              onlinePreferences.update({ timeControl })
            }
          />

          {state.error && (
            <p
              role="alert"
              className="animate-rise rounded-md bg-danger-soft px-4 py-3 text-sm text-[#f4aaa1]"
            >
              {errorMessage(state.error)}
            </p>
          )}

          <div>
            <Button
              variant="primary"
              size="lg"
              block
              disabled={Boolean(profile.activeGameId)}
              onClick={() => start(preset.control)}
            >
              Find Opponent · {preset.label}
            </Button>
            {profile.activeGameId && (
              <p className="mt-3 text-sm text-muted">
                Finish or resume your game in progress before searching again.
              </p>
            )}
            <p className="mt-3 text-sm text-faint">
              You’ll be paired with the next player who picks {preset.label}.
              Colours are assigned at random.
            </p>
          </div>
        </div>
      )}

      <div className="hidden lg:block">
        <ShowcaseBoard
          opening={OPENINGS.sicilian}
          sweeping={searching}
          caption={false}
          className="mx-auto max-w-[38rem]"
        />
      </div>
    </div>
  );
}

function Searching({
  label,
  since,
  matched,
  onCancel,
}: {
  label: string;
  since: number | null;
  matched: boolean;
  onCancel: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = since ? Math.max(0, Math.floor((now - since) / 1000)) : 0;

  return (
    <div className="animate-rise" aria-live="polite">
      <h2 className="flex items-center gap-3 text-[1.75rem] leading-tight font-extrabold sm:text-[2rem]">
        {!matched && (
          <span
            aria-hidden
            className="size-3 shrink-0 animate-pulse rounded-full bg-accent"
          />
        )}
        {matched ? "Opponent found." : "Searching for opponent…"}
      </h2>
      <p className="mt-2 text-[0.9375rem] text-muted">
        {matched
          ? "Setting up the board."
          : since
            ? "You’re in the queue."
            : "Connecting to the queue…"}
      </p>

      <dl className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-line">
        <div className="bg-surface px-5 py-4">
          <dt className="text-sm text-muted">Time control</dt>
          <dd className="mt-1 text-[1.75rem] font-bold tabular-nums">
            {label}
          </dd>
        </div>
        <div className="bg-surface px-5 py-4">
          <dt className="text-sm text-muted">Waiting</dt>
          <dd className="mt-1 text-[1.75rem] font-bold tabular-nums">
            {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
          </dd>
        </div>
      </dl>

      {!matched && (
        <Button className="mt-8" size="lg" onClick={onCancel}>
          Cancel search
        </Button>
      )}
    </div>
  );
}
