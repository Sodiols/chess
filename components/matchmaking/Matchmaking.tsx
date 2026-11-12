"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { MATCHMAKING_LIMIT_MS, useMatchmaking } from "@/hooks/useMatchmaking";
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
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,32rem)_minmax(0,1fr)] lg:gap-16">
      {searching ? (
        <Searching
          label={preset.label}
          since={state.status === "matched" ? null : state.since}
          joining={state.status === "joining"}
          matched={state.status === "matched"}
          onCancel={() => void cancel()}
        />
      ) : (
        <div className="animate-rise space-y-6 sm:space-y-8">
          <TimeControlPicker
            value={preset.id}
            onChange={(timeControl) =>
              onlinePreferences.update({ timeControl })
            }
          />

          {state.timedOut && (
            <p role="status" className="rounded-md bg-surface px-4 py-3 text-sm text-ink">
              No opponent found in 30 seconds. Retry when you’re ready.
            </p>
          )}

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
              disabled={Boolean(profile.activeGameId) || state.cancelling}
              onClick={() => start(preset.control)}
            >
              {state.cancelling
                ? "Ending search…"
                : state.timedOut
                  ? `Retry · ${preset.label}`
                  : `Find Opponent · ${preset.label}`}
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
  joining,
  onCancel,
}: {
  label: string;
  since: number | null;
  matched: boolean;
  joining: boolean;
  onCancel: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = since ? Math.min(MATCHMAKING_LIMIT_MS / 1000, Math.max(0, Math.floor((now - since) / 1000))) : 0;

  return (
    <div className="animate-rise">
      <h2 className="text-balance text-2xl leading-tight font-bold sm:text-[2rem]">
        {matched ? "Opponent found" : "Searching for an opponent…"}
      </h2>
      <p role="status" className="mt-2 min-h-10 text-sm leading-relaxed text-muted sm:text-base">
        {matched
          ? "Opponent found. Setting up the board."
          : seconds >= 25
            ? "Still waiting. If this search ends, try again."
            : seconds >= 15
              ? "Hang tight. We’re still looking for an opponent."
              : joining
                ? "Connecting to the queue…"
                : "You’re in the queue."}
      </p>

      <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-line">
        <div className="bg-surface px-4 py-3 sm:px-5 sm:py-4">
          <dt className="text-sm text-muted">Time control</dt>
          <dd className="mt-1 text-[1.75rem] font-bold tabular-nums">
            {label}
          </dd>
        </div>
        <div className="bg-surface px-4 py-3 sm:px-5 sm:py-4">
          <dt className="text-sm text-muted">Waiting</dt>
          <dd className="mt-1 text-[1.75rem] font-bold tabular-nums">
            {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
          </dd>
        </div>
      </dl>

      {!matched && (
        <Button className="mt-6" size="lg" onClick={onCancel}>
          Cancel search
        </Button>
      )}
    </div>
  );
}
