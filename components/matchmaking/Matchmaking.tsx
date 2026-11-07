"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useMatchmaking } from "@/hooks/useMatchmaking";
import { onlinePreferences } from "@/lib/multiplayer/preferences";
import { onlineTimeControlById } from "@/lib/multiplayer/timeControls";
import { errorMessage, type Profile } from "@/lib/multiplayer/types";
import { Button } from "@/components/ui/Button";
import { GlobeIcon } from "@/components/ui/icons";
import { TimeControlPicker } from "@/components/multiplayer/TimeControlPicker";

export function Matchmaking({ profile }: { profile: Profile }) {
  const router = useRouter();
  const prefs = useSyncExternalStore(
    onlinePreferences.subscribe,
    onlinePreferences.getSnapshot,
    onlinePreferences.getServerSnapshot,
  );
  const preset = onlineTimeControlById(prefs.timeControl);
  const { state, start, cancel } = useMatchmaking(profile.id, (gameId) => router.push(`/game/${gameId}`));

  if (state.status === "searching" || state.status === "joining" || state.status === "matched") {
    return (
      <Searching
        label={preset.label}
        since={state.status === "searching" ? state.since : null}
        matched={state.status === "matched"}
        onCancel={() => void cancel()}
      />
    );
  }

  return (
    <div className="space-y-7">
      <TimeControlPicker value={preset.id} onChange={(timeControl) => onlinePreferences.update({ timeControl })} />

      {state.error && (
        <p role="alert" className="rounded-lg border border-[#5c2f29] bg-danger-soft px-3 py-2 text-sm text-[#f0a49b]">
          {errorMessage(state.error)}
        </p>
      )}

      <Button
        variant="primary"
        size="lg"
        block
        disabled={Boolean(profile.activeGameId)}
        onClick={() => start(preset.control)}
      >
        Find opponent
      </Button>
      {profile.activeGameId && (
        <p className="text-center text-xs text-muted">Finish or resume your game in progress before searching again.</p>
      )}
      <p className="text-center text-xs text-faint">
        You’ll be paired with the next player who picks {preset.label}. Colours are assigned at random.
      </p>
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
    <div className="flex flex-col items-center py-10 text-center" aria-live="polite">
      <span className="relative flex size-20 items-center justify-center">
        {!matched && (
          <>
            <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-accent/15 [animation-duration:1.8s]" />
            <span aria-hidden className="absolute inset-2 rounded-full border border-accent/40" />
          </>
        )}
        <GlobeIcon className="size-8 text-accent" />
      </span>

      <h2 className="mt-6 text-xl font-semibold">{matched ? "Opponent found." : "Searching for opponent…"}</h2>
      <dl className="mt-3 flex gap-6 text-sm text-muted">
        <div>
          <dt className="eyebrow">Time</dt>
          <dd className="numeric mt-0.5 text-ink">{label}</dd>
        </div>
        <div>
          <dt className="eyebrow">Waiting</dt>
          <dd className="numeric mt-0.5 text-ink">
            {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
          </dd>
        </div>
        <div>
          <dt className="eyebrow">Status</dt>
          <dd className="mt-0.5 text-ink">{since ? "In queue" : "Connecting"}</dd>
        </div>
      </dl>

      {!matched && (
        <Button className="mt-8" onClick={onCancel}>
          Cancel search
        </Button>
      )}
    </div>
  );
}
