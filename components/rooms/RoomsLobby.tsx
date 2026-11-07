"use client";

import { useId, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { useHostedRoom } from "@/hooks/useHostedRoom";
import { useRoomBrowser } from "@/hooks/useRoomBrowser";
import { api } from "@/lib/multiplayer/client";
import { onlinePreferences } from "@/lib/multiplayer/preferences";
import { ONLINE_TIME_CONTROLS, onlineTimeControlById } from "@/lib/multiplayer/timeControls";
import { errorMessage, type Profile, type RoomSummary } from "@/lib/multiplayer/types";
import { formatTimeControl } from "@/lib/chess/format";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { OptionGroup } from "@/components/ui/OptionGroup";
import { TextField } from "@/components/ui/TextField";
import { Toggle } from "@/components/ui/Toggle";
import { CopyIcon, LockIcon, RefreshIcon } from "@/components/ui/icons";
import { TimeControlPicker } from "@/components/multiplayer/TimeControlPicker";

const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;

export function RoomsLobby({ profile }: { profile: Profile }) {
  const router = useRouter();
  const goToGame = (gameId: string) => router.push(`/game/${gameId}`);
  const hosted = useHostedRoom(profile.id, goToGame);
  const [joinCode, setJoinCode] = useState<string | null>(null);

  if (hosted.room?.status === "waiting" || hosted.room?.status === "started") {
    return <HostedRoom room={hosted.room} password={hosted.password} onCancel={() => void hosted.cancel()} />;
  }

  return (
    <div className="space-y-12">
      <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr] lg:gap-10">
        <section aria-labelledby="create-heading" className="panel p-5 sm:p-6">
          <h2 id="create-heading" className="text-lg font-semibold">
            Create a room
          </h2>
          <p className="mt-1 text-sm text-muted">Share the room ID and password with your opponent.</p>
          <CreateRoomForm
            nickname={profile.nickname}
            busy={hosted.busy}
            error={hosted.error ?? (hosted.room ? `Room ${hosted.room.status}.` : null)}
            disabled={Boolean(profile.activeGameId)}
            onCreate={hosted.create}
          />
        </section>

        <section aria-labelledby="join-heading" className="panel p-5 sm:p-6">
          <h2 id="join-heading" className="text-lg font-semibold">
            Join a room
          </h2>
          <p className="mt-1 text-sm text-muted">Paste the ID you were given.</p>
          <JoinRoomForm initialCode="" onJoined={goToGame} />
        </section>
      </div>

      <RoomBrowser onJoin={setJoinCode} />

      <Dialog
        open={joinCode !== null}
        onClose={() => setJoinCode(null)}
        title={`Join room ${joinCode ?? ""}`}
        description="Enter the password the host shared with you."
      >
        {joinCode && <JoinRoomForm initialCode={joinCode} onJoined={goToGame} autoFocusPassword />}
      </Dialog>
    </div>
  );
}

function CreateRoomForm({
  nickname,
  busy,
  error,
  disabled,
  onCreate,
}: {
  nickname: string;
  busy: boolean;
  error: string | null;
  disabled: boolean;
  onCreate: ReturnType<typeof useHostedRoom>["create"];
}) {
  const prefs = useSyncExternalStore(
    onlinePreferences.subscribe,
    onlinePreferences.getSnapshot,
    onlinePreferences.getServerSnapshot,
  );
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [color, setColor] = useState<"w" | "b" | "random">("random");
  const [discoverable, setDiscoverable] = useState(true);
  const preset = onlineTimeControlById(prefs.timeControl);
  const passwordId = useId();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    void onCreate({
      name: name.trim() || `${nickname}'s room`,
      password,
      initialMs: preset.control.initialMs,
      incrementMs: preset.control.incrementMs,
      color,
      discoverable,
    });
  };

  return (
    <form onSubmit={submit} className="mt-5 space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Room name" value={name} placeholder={`${nickname}'s room`} maxLength={40} onChange={setName} />
        <div>
          <label htmlFor={passwordId} className="eyebrow mb-2 block">
            Password
          </label>
          <input
            id={passwordId}
            type="password"
            required
            minLength={4}
            maxLength={64}
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-10 w-full rounded-lg border border-line bg-raised px-3 text-sm hover:border-line-strong focus:border-accent focus:outline-none"
          />
        </div>
      </div>

      <TimeControlPicker value={preset.id} onChange={(timeControl) => onlinePreferences.update({ timeControl })} />

      <OptionGroup<"w" | "b" | "random">
        legend="You play"
        columns={3}
        value={color}
        onChange={setColor}
        options={[
          { value: "w", label: "White" },
          { value: "b", label: "Black" },
          { value: "random", label: "Random" },
        ]}
      />

      <Toggle
        checked={discoverable}
        onChange={setDiscoverable}
        label="List in the room browser"
        hint="Anyone can see it, but joining always needs the password."
      />

      {error && (
        <p role="alert" className="text-sm text-[#f0a49b]">
          {errorMessage(error)}
        </p>
      )}

      <Button type="submit" variant="primary" size="lg" block disabled={busy || disabled || password.length < 4}>
        {busy ? "Creating…" : "Create room"}
      </Button>
    </form>
  );
}

function JoinRoomForm({
  initialCode,
  onJoined,
  autoFocusPassword = false,
}: {
  initialCode: string;
  onJoined: (gameId: string) => void;
  autoFocusPassword?: boolean;
}) {
  const [code, setCode] = useState(initialCode);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const codeId = useId();
  const passwordId = useId();
  const normalized = code.trim().toUpperCase();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!CODE_PATTERN.test(normalized)) {
      setError("room_not_found");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await api<{ gameId: string }>(`/api/rooms/${normalized}`, {
      method: "POST",
      body: { action: "join", password },
    });
    setBusy(false);
    if (result.ok) onJoined(result.gameId);
    else setError(result.error);
  };

  return (
    <form onSubmit={submit} className="mt-5 space-y-4">
      <div>
        <label htmlFor={codeId} className="eyebrow mb-2 block">
          Room ID
        </label>
        <input
          id={codeId}
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          placeholder="K7K2QX"
          maxLength={6}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className="numeric h-10 w-full rounded-lg border border-line bg-raised px-3 text-sm tracking-[0.2em] uppercase hover:border-line-strong focus:border-accent focus:outline-none"
        />
      </div>
      <div>
        <label htmlFor={passwordId} className="eyebrow mb-2 block">
          Room password
        </label>
        <input
          id={passwordId}
          type="password"
          value={password}
          autoFocus={autoFocusPassword}
          autoComplete="off"
          onChange={(event) => setPassword(event.target.value)}
          className="h-10 w-full rounded-lg border border-line bg-raised px-3 text-sm hover:border-line-strong focus:border-accent focus:outline-none"
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-[#f0a49b]">
          {errorMessage(error)}
        </p>
      )}
      <Button type="submit" variant="primary" block disabled={busy || !normalized || !password}>
        {busy ? "Joining…" : "Join room"}
      </Button>
    </form>
  );
}

function HostedRoom({ room, password, onCancel }: { room: RoomSummary; password: string; onCancel: () => void }) {
  const [copied, setCopied] = useState<"id" | "invite" | null>(null);
  const invite = [
    `Join my Gambit chess room "${room.name}"`,
    `Room ID: ${room.code}`,
    password ? `Password: ${password}` : null,
    typeof window === "undefined" ? null : `${window.location.origin}/play/rooms`,
  ]
    .filter(Boolean)
    .join("\n");

  const copy = async (what: "id" | "invite") => {
    try {
      await navigator.clipboard.writeText(what === "id" ? room.code : invite);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  };

  const colorLabel = room.hostColor === "random" ? "Random" : room.hostColor === "w" ? "White" : "Black";

  return (
    <div className="mx-auto max-w-lg text-center" aria-live="polite">
      <p className="eyebrow">{room.status === "started" ? "Opponent joined" : "Waiting for player to join…"}</p>
      <h2 className="mt-2 text-xl font-semibold">{room.name}</h2>

      <div className="mt-6 rounded-xl border border-line bg-surface p-5">
        <p className="eyebrow">Room ID</p>
        <p className="numeric mt-1 text-4xl font-semibold tracking-[0.25em] text-accent">{room.code}</p>
        <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-4 text-sm">
          <div>
            <dt className="eyebrow">Host</dt>
            <dd className="mt-0.5 truncate">{room.hostName}</dd>
          </div>
          <div>
            <dt className="eyebrow">Time</dt>
            <dd className="numeric mt-0.5">{formatTimeControl(room.initialMs, room.incrementMs)}</dd>
          </div>
          <div>
            <dt className="eyebrow">You play</dt>
            <dd className="mt-0.5">{colorLabel}</dd>
          </div>
        </dl>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        <Button onClick={() => void copy("id")}>
          <CopyIcon />
          {copied === "id" ? "Copied" : "Copy room ID"}
        </Button>
        <Button onClick={() => void copy("invite")}>
          <CopyIcon />
          {copied === "invite" ? "Copied" : "Copy invite details"}
        </Button>
      </div>
      <p className="mt-3 text-xs text-faint">
        The invite includes the password you just set. Gambit stores only a hash of it.
      </p>

      <span className="mt-8 inline-flex items-center gap-2 text-sm text-muted">
        <span aria-hidden className="size-2 animate-pulse rounded-full bg-accent" />
        {room.status === "started" ? "Starting game…" : "Waiting for an opponent"}
      </span>

      {room.status === "waiting" && (
        <div className="mt-6">
          <Button variant="ghost" onClick={onCancel}>
            Cancel room
          </Button>
        </div>
      )}
    </div>
  );
}

function RoomBrowser({ onJoin }: { onJoin: (code: string) => void }) {
  const { status, rooms, live, refresh, ...rest } = useRoomBrowser(true);
  const [query, setQuery] = useState("");
  const [timeFilter, setTimeFilter] = useState("all");
  const searchId = useId();

  const visible = useMemo(() => {
    const search = query.trim().toUpperCase();
    return rooms.filter((room) => {
      if (search && !room.code.includes(search) && !room.name.toUpperCase().includes(search)) return false;
      if (timeFilter === "all") return true;
      const preset = onlineTimeControlById(timeFilter);
      return room.initialMs === preset.control.initialMs && room.incrementMs === preset.control.incrementMs;
    });
  }, [query, rooms, timeFilter]);

  return (
    <section aria-labelledby="browser-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="browser-heading" className="text-lg font-semibold">
            Open rooms
          </h2>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted">
            <span aria-hidden className={clsx("size-1.5 rounded-full", live ? "bg-positive" : "bg-faint")} />
            {live ? "Updating live" : "Connecting to live updates…"}
          </p>
        </div>
        <Button size="sm" onClick={() => void refresh()} disabled={status === "loading"}>
          <RefreshIcon />
          Refresh rooms
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <label htmlFor={searchId} className="sr-only">
          Search by room ID
        </label>
        <input
          id={searchId}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by room ID or name"
          className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-raised px-3 text-sm hover:border-line-strong focus:border-accent focus:outline-none sm:max-w-xs"
        />
        <label className="sr-only" htmlFor={`${searchId}-time`}>
          Filter by time control
        </label>
        <select
          id={`${searchId}-time`}
          value={timeFilter}
          onChange={(event) => setTimeFilter(event.target.value)}
          className="h-9 rounded-lg border border-line bg-raised px-2.5 text-sm hover:border-line-strong focus:border-accent focus:outline-none"
        >
          <option value="all">All time controls</option>
          {ONLINE_TIME_CONTROLS.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
        </select>
      </div>

      {status === "error" && "error" in rest && (
        <p role="alert" className="mt-4 text-sm text-[#f0a49b]">
          {errorMessage(rest.error)}
        </p>
      )}

      {visible.length === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed border-line px-4 py-10 text-center">
          <p className="text-sm font-medium">
            {status === "loading" && rooms.length === 0
              ? "Loading rooms…"
              : rooms.length === 0
                ? "No open rooms right now."
                : "No rooms match your filters."}
          </p>
          {status !== "loading" && rooms.length === 0 && (
            <p className="mt-1 text-xs text-faint">Create one above — it appears here for everyone instantly.</p>
          )}
        </div>
      ) : (
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((room) => (
            <li key={room.code}>
              <RoomCard room={room} onJoin={() => onJoin(room.code)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RoomCard({ room, onJoin }: { room: RoomSummary; onJoin: () => void }) {
  return (
    <article className="flex h-full animate-rise flex-col rounded-xl border border-line bg-surface p-4 transition-colors hover:border-line-strong">
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 truncate font-semibold">{room.name}</h3>
        <LockIcon className="size-4 shrink-0 text-faint" />
      </div>
      <p className="mt-0.5 truncate text-xs text-muted">Hosted by {room.hostName}</p>
      <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <div className="flex gap-1">
          <dt className="sr-only">Room ID</dt>
          <dd className="numeric tracking-wider text-ink">{room.code}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="sr-only">Time control</dt>
          <dd className="numeric">{formatTimeControl(room.initialMs, room.incrementMs)}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="sr-only">Players</dt>
          <dd className="numeric">{room.players}/2</dd>
        </div>
        <div className="flex gap-1">
          <dt className="sr-only">Status</dt>
          <dd className="text-positive">Waiting</dd>
        </div>
      </dl>
      <Button size="sm" variant="secondary" className="mt-4 self-start" onClick={onJoin}>
        Join
      </Button>
    </article>
  );
}
