"use client";

import {
  useEffect,
  useId,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { useHostedRoom } from "@/hooks/useHostedRoom";
import { useRoomBrowser } from "@/hooks/useRoomBrowser";
import { api } from "@/lib/multiplayer/client";
import { onlinePreferences } from "@/lib/multiplayer/preferences";
import {
  ONLINE_TIME_CONTROLS,
  onlineTimeControlById,
} from "@/lib/multiplayer/timeControls";
import {
  errorMessage,
  type Profile,
  type RoomSummary,
} from "@/lib/multiplayer/types";
import { formatTimeControl } from "@/lib/chess/format";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { OptionGroup } from "@/components/ui/OptionGroup";
import { TextField } from "@/components/ui/TextField";
import { Toggle } from "@/components/ui/Toggle";
import { CopyIcon, LockIcon, RefreshIcon } from "@/components/ui/icons";
import { TimeControlPicker } from "@/components/multiplayer/TimeControlPicker";
import { ShowcaseBoard } from "@/components/chess/ShowcaseBoard";
import { OPENINGS } from "@/constants/openings";
import { ResumeBanner } from "@/components/multiplayer/OnlineGate";

const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;

export function RoomsLobby({ profile }: { profile: Profile }) {
  const router = useRouter();
  const goToGame = (gameId: string) => router.push(`/game/${gameId}`);
  const hosted = useHostedRoom(profile.id, goToGame);
  const [joinCode, setJoinCode] = useState<string | null>(null);

  // "Create Room" / "Join Room" links point at a section; it only exists once
  // the account has loaded, after the browser's own anchor jump has passed.
  useEffect(() => {
    const target = window.location.hash.slice(1);
    if (target)
      document.getElementById(target)?.scrollIntoView({ block: "start" });
  }, []);

  if (hosted.room?.status === "waiting" || hosted.room?.status === "started") {
    return (
      <HostedRoom
        room={hosted.room}
        password={hosted.password}
        cancelling={hosted.phase === "cancelling"}
        error={hosted.error}
        unreachable={hosted.unreachable}
        onCancel={() => void hosted.cancel()}
      />
    );
  }

  return (
    <div className="space-y-24">
      <div className="grid items-start gap-6 lg:grid-cols-[1.25fr_1fr]">
        <section
          aria-labelledby="create-heading"
          className="animate-rise scroll-mt-24 rounded-lg bg-surface p-6 sm:p-8"
        >
          <h2 id="create-heading" className="text-2xl font-extrabold">
            Create a room
          </h2>
          <p className="mt-2 text-[0.9375rem] text-muted">
            Share the room ID and password with your opponent.
          </p>
          {hosted.phase === "restoring" ? (
            <p className="mt-5 text-sm text-muted" role="status">
              Checking for a room you already host…
            </p>
          ) : profile.activeGameId ? (
            <div className="mt-5">
              <ResumeBanner gameId={profile.activeGameId} />
              <p className="text-xs text-faint">
                You can host a room again once that game has finished.
              </p>
            </div>
          ) : (
            <CreateRoomForm
              username={profile.username ?? profile.nickname}
              busy={hosted.phase === "creating"}
              error={hosted.error}
              onCreate={hosted.create}
            />
          )}
        </section>

        <section
          aria-labelledby="join-heading"
          className="animate-rise scroll-mt-24 rounded-lg bg-surface p-6 sm:p-8"
          style={{ animationDelay: "80ms" }}
        >
          <h2 id="join-heading" className="text-2xl font-extrabold">
            Join a room
          </h2>
          <p className="mt-2 text-[0.9375rem] text-muted">
            Paste the ID you were given.
          </p>
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
        {joinCode && (
          <JoinRoomForm
            initialCode={joinCode}
            onJoined={goToGame}
            autoFocusPassword
          />
        )}
      </Dialog>
    </div>
  );
}

function CreateRoomForm({
  username,
  busy,
  error,
  onCreate,
}: {
  username: string;
  busy: boolean;
  error: string | null;
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
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const preset = onlineTimeControlById(prefs.timeControl);
  const passwordId = useId();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const invalid =
      password.length < 4 || password.length > 64 ? "invalid_password" : null;
    setPasswordError(invalid);
    if (invalid) return;
    void onCreate({
      name: name.trim() || `${username}'s room`,
      password,
      initialMs: preset.control.initialMs,
      incrementMs: preset.control.incrementMs,
      color,
      discoverable,
    });
  };

  return (
    <form onSubmit={submit} noValidate className="mt-7 space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="Room name"
          value={name}
          placeholder={`${username}'s room`}
          maxLength={40}
          onChange={setName}
        />
        <div>
          <label
            htmlFor={passwordId}
            className="mb-2 block text-sm font-semibold"
          >
            Password
          </label>
          <input
            id={passwordId}
            type="password"
            maxLength={64}
            autoComplete="new-password"
            value={password}
            aria-invalid={passwordError ? true : undefined}
            aria-describedby={`${passwordId}-hint`}
            onChange={(event) => setPassword(event.target.value)}
            className={clsx(
              "h-12 w-full rounded-md border bg-canvas px-3.5 text-[0.9375rem] hover:border-line-strong focus:border-accent focus:outline-none",
              passwordError ? "border-[#8a3d33]" : "border-line",
            )}
          />
          <p
            id={`${passwordId}-hint`}
            className={clsx(
              "mt-2 text-[0.8125rem]",
              passwordError ? "text-[#f4aaa1]" : "text-faint",
            )}
          >
            {passwordError
              ? errorMessage(passwordError)
              : "4–64 characters. Share it with your opponent."}
          </p>
        </div>
      </div>

      <TimeControlPicker
        value={preset.id}
        onChange={(timeControl) => onlinePreferences.update({ timeControl })}
      />

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
        <p role="alert" className="text-sm text-[#f4aaa1]">
          {errorMessage(error)}
        </p>
      )}

      <Button
        type="submit"
        variant="primary"
        size="lg"
        block
        disabled={busy}
        aria-busy={busy}
      >
        {busy ? "Creating room…" : "Create room"}
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
    if (busy) return;
    if (!CODE_PATTERN.test(normalized)) {
      setError("invalid_room_code");
      return;
    }
    if (!password) {
      setError("password_required");
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
    <form onSubmit={submit} noValidate className="mt-7 space-y-5">
      <div>
        <label htmlFor={codeId} className="mb-2 block text-sm font-semibold">
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
          className="numeric h-12 w-full rounded-md border border-line bg-canvas px-3.5 text-lg tracking-[0.3em] uppercase hover:border-line-strong focus:border-accent focus:outline-none"
        />
      </div>
      <div>
        <label
          htmlFor={passwordId}
          className="mb-2 block text-sm font-semibold"
        >
          Room password
        </label>
        <input
          id={passwordId}
          type="password"
          value={password}
          autoFocus={autoFocusPassword}
          autoComplete="off"
          onChange={(event) => setPassword(event.target.value)}
          className="h-12 w-full rounded-md border border-line bg-canvas px-3.5 text-[0.9375rem] hover:border-line-strong focus:border-accent focus:outline-none"
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-[#f4aaa1]">
          {errorMessage(error)}
        </p>
      )}
      <Button
        type="submit"
        variant="primary"
        size="lg"
        block
        disabled={busy}
        aria-busy={busy}
      >
        {busy ? "Joining…" : "Join room"}
      </Button>
    </form>
  );
}

function HostedRoom({
  room,
  password,
  cancelling,
  error,
  unreachable,
  onCancel,
}: {
  room: RoomSummary;
  password: string | null;
  cancelling: boolean;
  error: string | null;
  unreachable: boolean;
  onCancel: () => void;
}) {
  const [copied, setCopied] = useState<"id" | "invite" | null>(null);
  const invite = [
    `Join my Gambit chess room "${room.name}"`,
    `Room ID: ${room.code}`,
    password ? `Password: ${password}` : null,
    typeof window === "undefined"
      ? null
      : `${window.location.origin}/play/rooms`,
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

  const colorLabel =
    room.hostColor === "random"
      ? "Random"
      : room.hostColor === "w"
        ? "White"
        : "Black";

  return (
    <div
      className="grid items-center gap-12 lg:grid-cols-[minmax(0,34rem)_minmax(0,1fr)] lg:gap-16"
      aria-live="polite"
    >
      <div className="animate-rise">
        <p className="flex items-center gap-2.5 text-[0.9375rem] text-muted">
          <span
            aria-hidden
            className="size-2.5 animate-pulse rounded-full bg-accent"
          />
          {room.status === "started"
            ? "Opponent joined. Starting game…"
            : "Waiting for player to join…"}
        </p>
        <h2 className="mt-3 text-[2rem] leading-tight font-extrabold">
          {room.name}
        </h2>

        <div className="mt-8 overflow-hidden rounded-lg bg-surface">
          <div className="px-6 pt-6 pb-7">
            <p className="text-sm text-muted">Room ID</p>
            <p
              translate="no"
              className="numeric mt-1 text-[clamp(2.5rem,6vw,3.75rem)] leading-none font-semibold tracking-[0.18em] text-accent"
            >
              {room.code}
            </p>
          </div>
          <dl className="grid grid-cols-3 gap-px bg-line text-[0.9375rem]">
            <div className="bg-raised px-6 py-4">
              <dt className="text-sm text-muted">Host</dt>
              <dd className="mt-1 truncate font-semibold">{room.hostName}</dd>
            </div>
            <div className="bg-raised px-6 py-4">
              <dt className="text-sm text-muted">Time</dt>
              <dd className="mt-1 font-semibold tabular-nums">
                {formatTimeControl(room.initialMs, room.incrementMs)}
              </dd>
            </div>
            <div className="bg-raised px-6 py-4">
              <dt className="text-sm text-muted">You play</dt>
              <dd className="mt-1 font-semibold">{colorLabel}</dd>
            </div>
          </dl>
        </div>

        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          <Button size="lg" onClick={() => void copy("id")}>
            <CopyIcon />
            {copied === "id" ? "Copied" : "Copy room ID"}
          </Button>
          <Button size="lg" onClick={() => void copy("invite")}>
            <CopyIcon />
            {copied === "invite" ? "Copied" : "Copy invite details"}
          </Button>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-faint">
          {password
            ? "The invite includes the password you just set. Gambit stores only a hash of it."
            : "Gambit stores only a hash of the room password, so it can't be shown again after a refresh. Share the password you chose when creating the room."}
        </p>

        {unreachable && room.status === "waiting" && (
          <p role="status" className="mt-4 text-sm text-[#f4aaa1]">
            Can&rsquo;t reach the server. Retrying — the room stays open for two
            minutes without a connection.
          </p>
        )}
        {error && (
          <p role="alert" className="mt-4 text-sm text-[#f4aaa1]">
            {errorMessage(error)}
          </p>
        )}
        {room.status === "waiting" && (
          <div className="mt-6">
            <Button
              variant="ghost"
              onClick={onCancel}
              disabled={cancelling}
              aria-busy={cancelling}
            >
              {cancelling
                ? "Cancelling…"
                : error
                  ? "Try cancelling again"
                  : "Cancel room"}
            </Button>
          </div>
        )}
      </div>

      <div className="hidden lg:block">
        <ShowcaseBoard
          opening={OPENINGS.london}
          orientation={room.hostColor === "b" ? "b" : "w"}
          sweeping={room.status === "waiting"}
          caption={false}
          className="mx-auto max-w-[38rem]"
        />
      </div>
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
      if (
        search &&
        !room.code.includes(search) &&
        !room.name.toUpperCase().includes(search)
      )
        return false;
      if (timeFilter === "all") return true;
      const preset = onlineTimeControlById(timeFilter);
      return (
        room.initialMs === preset.control.initialMs &&
        room.incrementMs === preset.control.incrementMs
      );
    });
  }, [query, rooms, timeFilter]);

  return (
    <section aria-labelledby="browser-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2
            id="browser-heading"
            className="text-[2rem] leading-tight font-extrabold"
          >
            Open rooms
          </h2>
          <p className="mt-2 flex items-center gap-2 text-[0.9375rem] text-muted">
            <span
              aria-hidden
              className={clsx(
                "size-2 rounded-full",
                live === "live"
                  ? "bg-positive"
                  : live === "offline"
                    ? "bg-[#f0a49b]"
                    : "bg-faint",
              )}
            />
            {live === "live"
              ? "Updating live"
              : live === "offline"
                ? "Live updates unavailable — use Refresh rooms"
                : "Connecting to live updates…"}
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => void refresh()}
          disabled={status === "loading"}
          aria-busy={status === "loading"}
        >
          <RefreshIcon />
          {status === "loading" ? "Refreshing…" : "Refresh rooms"}
        </Button>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <label htmlFor={searchId} className="sr-only">
          Search by room ID
        </label>
        <input
          id={searchId}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by room ID or name"
          className="h-11 min-w-0 flex-1 rounded-md border border-line bg-surface px-3.5 text-[0.9375rem] hover:border-line-strong focus:border-accent focus:outline-none sm:max-w-sm"
        />
        <label className="sr-only" htmlFor={`${searchId}-time`}>
          Filter by time control
        </label>
        <select
          id={`${searchId}-time`}
          value={timeFilter}
          onChange={(event) => setTimeFilter(event.target.value)}
          className="h-11 rounded-md border border-line bg-surface px-3 text-[0.9375rem] text-ink hover:border-line-strong focus:border-accent focus:outline-none"
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
        <p role="alert" className="mt-4 text-sm text-[#f4aaa1]">
          {errorMessage(rest.error)}
        </p>
      )}

      {visible.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-line-strong px-6 py-12 text-center">
          <p className="text-base font-semibold">
            {status === "loading" && rooms.length === 0
              ? "Loading rooms…"
              : rooms.length === 0
                ? "No open rooms right now."
                : "No rooms match your filters."}
          </p>
          {status !== "loading" && rooms.length === 0 && (
            <p className="mt-1.5 text-sm text-muted">
              Create one above — it appears here for everyone instantly.
            </p>
          )}
        </div>
      ) : (
        <ul className="mt-6 grid gap-1.5">
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
  const time = formatTimeControl(room.initialMs, room.incrementMs);
  return (
    <article className="grid animate-rise grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-2 rounded-lg bg-surface px-5 py-4 transition-colors hover:bg-raised sm:grid-cols-[minmax(0,1fr)_7rem_6rem_3rem_auto]">
      <div className="min-w-0">
        <h3 className="flex items-center gap-2 font-bold">
          <span className="truncate">{room.name}</span>
          <LockIcon className="size-3.5 shrink-0 text-faint" />
        </h3>
        <p className="mt-0.5 truncate text-sm text-muted">
          Hosted by {room.hostName}
        </p>
      </div>
      <dl className="contents text-[0.9375rem]">
        <div className="hidden sm:block">
          <dt className="sr-only">Room ID</dt>
          <dd translate="no" className="numeric tracking-wider text-ink">
            {room.code}
          </dd>
        </div>
        <div className="hidden text-right sm:block">
          <dt className="sr-only">Time control</dt>
          <dd className="text-muted tabular-nums">{time}</dd>
        </div>
        <div className="hidden text-right sm:block">
          <dt className="sr-only">Players</dt>
          <dd className="text-muted tabular-nums">{room.players}/2</dd>
        </div>
      </dl>
      <Button
        size="sm"
        variant="primary"
        onClick={onJoin}
        aria-label={`Join ${room.name}`}
      >
        Join
      </Button>
      <p className="col-span-2 text-sm text-muted sm:hidden">
        <span translate="no" className="numeric text-ink">
          {room.code}
        </span>{" "}
        · {time} · {room.players}/2
      </p>
    </article>
  );
}
