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
  findOnlineTimeControl,
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
import { TimeControlPicker } from "@/components/multiplayer/TimeControlPicker";
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
    // Phones: join, create, then the list. Desktop: join and list left, create right.
    <div className="flex flex-col gap-12 lg:grid lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-start lg:gap-x-10">
      <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-12">
        <section
          aria-labelledby="join-heading"
          className="animate-rise scroll-mt-24 rounded-lg bg-surface p-6 sm:p-7"
        >
          <h2 id="join-heading" className="text-2xl font-extrabold">
            Join a room
          </h2>
          <p className="mt-1.5 text-[0.9375rem] text-muted">
            Got a room ID from a friend? Enter it with the password.
          </p>
          <JoinRoomForm initialCode="" onJoined={goToGame} inline />
        </section>

        <RoomBrowser onJoin={setJoinCode} />
      </div>

      <section
        aria-labelledby="create-heading"
        className="animate-rise scroll-mt-24 rounded-lg bg-surface p-6 max-lg:order-2 sm:p-7"
        style={{ animationDelay: "80ms" }}
      >
        <h2 id="create-heading" className="text-2xl font-extrabold">
          Create a room
        </h2>
        <ol className="mt-4 grid gap-2.5 text-[0.9375rem] text-muted">
          {[
            "Set a password and a time",
            "Send your friend the room ID and password",
            "The game starts when they join",
          ].map((step, index) => (
            <li key={step} className="flex items-center gap-3">
              <span
                aria-hidden
                className="flex size-6 shrink-0 items-center justify-center rounded-full bg-raised text-xs font-bold text-ink"
              >
                {index + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
        {hosted.phase === "restoring" ? (
          <p className="mt-6 text-sm text-muted" role="status">
            Checking for a room you already host…
          </p>
        ) : profile.activeGameId ? (
          <div className="mt-6">
            <ResumeBanner gameId={profile.activeGameId} />
            <p className="text-sm text-faint">
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
            "h-12 w-full rounded-md border bg-canvas px-3.5 text-base sm:text-[0.9375rem] hover:border-line-strong focus:border-accent focus:outline-none",
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
            : "Your friend needs it to join. 4–64 characters."}
        </p>
      </div>

      <TimeControlPicker
        value={preset.id}
        onChange={(timeControl) => onlinePreferences.update({ timeControl })}
      />

      <details className="group rounded-md bg-raised">
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-2.5 select-none [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">More options</span>
            <span className="block truncate text-[0.8125rem] text-muted">
              {color === "random"
                ? "Random colour"
                : color === "w"
                  ? "You play White"
                  : "You play Black"}{" "}
              ·{" "}
              {discoverable ? "Listed in open rooms" : "Hidden from open rooms"}
            </span>
          </span>
          <svg
            aria-hidden
            viewBox="0 0 16 16"
            className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
          >
            <path
              d="m4 6 4 4 4-4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </summary>
        <div className="space-y-5 px-4 pt-2 pb-4">
          <TextField
            label="Room name"
            value={name}
            placeholder={`${username}'s room`}
            maxLength={40}
            onChange={setName}
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
            label="List in open rooms"
            hint="Anyone can see it, but joining always needs the password."
          />
        </div>
      </details>

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
  inline = false,
}: {
  initialCode: string;
  onJoined: (gameId: string) => void;
  autoFocusPassword?: boolean;
  /** One row (ID, password, button) instead of a stacked form. */
  inline?: boolean;
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
    <form
      onSubmit={submit}
      noValidate
      className={clsx(
        "mt-6",
        inline
          ? "grid gap-4 sm:grid-cols-[11rem_minmax(0,1fr)_auto] sm:items-end sm:gap-3"
          : "space-y-5",
      )}
    >
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
          className="h-12 w-full rounded-md border border-line bg-canvas px-3.5 text-lg font-semibold tracking-[0.2em] uppercase tabular-nums placeholder:font-normal placeholder:text-faint hover:border-line-strong focus:border-accent focus:outline-none"
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
          className="h-12 w-full rounded-md border border-line bg-canvas px-3.5 text-base sm:text-[0.9375rem] hover:border-line-strong focus:border-accent focus:outline-none"
        />
      </div>
      {error && !inline && (
        <p role="alert" className="text-sm text-[#f4aaa1]">
          {errorMessage(error)}
        </p>
      )}
      <Button
        type="submit"
        variant="primary"
        size="lg"
        block={!inline}
        disabled={busy}
        aria-busy={busy}
      >
        {busy ? "Joining…" : "Join room"}
      </Button>
      {error && inline && (
        <p role="alert" className="text-sm text-[#f4aaa1] sm:col-span-3">
          {errorMessage(error)}
        </p>
      )}
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
    <div className="max-w-[44rem] animate-rise" aria-live="polite">
      <div className="overflow-hidden rounded-lg bg-surface">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-accent-soft px-6 py-4 sm:px-8">
          <span
            aria-hidden
            className="size-2.5 animate-pulse rounded-full bg-accent"
          />
          <p className="font-semibold">
            {room.status === "started"
              ? "Opponent joined. Starting game…"
              : "Waiting for player to join…"}
          </p>
          <p className="w-full truncate pl-[1.375rem] text-[0.9375rem] text-muted sm:ml-auto sm:w-auto sm:pl-0">
            {room.name}
          </p>
        </div>

        <div className="px-6 pt-7 pb-8 sm:px-8">
          <h2 className="text-2xl font-extrabold">Send these to your friend</h2>
          <dl className="mt-6 grid gap-6 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-muted">Room ID</dt>
              <dd>
                <p
                  translate="no"
                  className="numeric mt-1.5 text-[clamp(2.25rem,6vw,3.25rem)] leading-none font-semibold tracking-[0.14em] text-accent"
                >
                  {room.code}
                </p>
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Password</dt>
              <dd className="mt-1.5">
                {password ? (
                  <span className="block text-[1.75rem] leading-tight font-semibold break-all">
                    {password}
                  </span>
                ) : (
                  <span className="block text-[0.9375rem] leading-snug text-muted">
                    The one you chose. It isn&rsquo;t shown again after a
                    refresh.
                  </span>
                )}
              </dd>
            </div>
          </dl>

          <div className="mt-8 grid gap-2 sm:grid-cols-2">
            <Button
              variant="primary"
              size="lg"
              onClick={() => void copy("invite")}
            >
              {copied === "invite"
                ? "Copied"
                : password
                  ? "Copy ID and password"
                  : "Copy invite"}
            </Button>
            <Button size="lg" onClick={() => void copy("id")}>
              {copied === "id" ? "Copied" : "Copy room ID"}
            </Button>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            Your friend opens Private match, enters the ID and password, and the
            game starts for you both.
          </p>
        </div>

        <dl className="grid grid-cols-3 gap-px bg-line text-[0.9375rem]">
          <div className="bg-raised px-6 py-4 sm:px-8">
            <dt className="text-sm text-muted">Time</dt>
            <dd className="mt-1 font-semibold tabular-nums">
              {formatTimeControl(room.initialMs, room.incrementMs)}
            </dd>
          </div>
          <div className="bg-raised px-6 py-4 sm:px-8">
            <dt className="text-sm text-muted">You play</dt>
            <dd className="mt-1 font-semibold">{colorLabel}</dd>
          </div>
          <div className="bg-raised px-6 py-4 sm:px-8">
            <dt className="text-sm text-muted">Visible</dt>
            <dd className="mt-1 font-semibold">
              {room.discoverable ? "Open rooms" : "Invite only"}
            </dd>
          </div>
        </dl>
      </div>

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
        <div className="mt-5">
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
    <section
      aria-labelledby="browser-heading"
      className="min-w-0 max-lg:order-3"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="browser-heading" className="text-2xl font-extrabold">
            Open rooms
          </h2>
          <p className="mt-1.5 flex items-center gap-2 text-[0.9375rem] text-muted">
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
          {status === "loading" ? "Refreshing…" : "Refresh rooms"}
        </Button>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <label htmlFor={searchId} className="sr-only">
          Search by room ID
        </label>
        <input
          id={searchId}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by room ID or name"
          className="h-11 min-w-0 flex-1 basis-full rounded-md border border-line bg-surface px-3.5 sm:basis-auto text-base sm:text-[0.9375rem] hover:border-line-strong focus:border-accent focus:outline-none sm:max-w-sm"
        />
        <label className="sr-only" htmlFor={`${searchId}-time`}>
          Filter by time control
        </label>
        <select
          id={`${searchId}-time`}
          value={timeFilter}
          onChange={(event) => setTimeFilter(event.target.value)}
          className="h-11 rounded-md border border-line bg-surface px-3 text-base text-ink sm:text-[0.9375rem] hover:border-line-strong focus:border-accent focus:outline-none"
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
        <div className="mt-4 rounded-lg border border-dashed border-line-strong px-6 py-12 text-center">
          <p className="text-base font-semibold">
            {status === "loading" && rooms.length === 0
              ? "Loading rooms…"
              : rooms.length === 0
                ? "No open rooms right now."
                : "No rooms match your filters."}
          </p>
          {status !== "loading" && rooms.length === 0 && (
            <p className="mt-1.5 text-sm text-muted">
              Create one and it shows up here for everyone straight away.
            </p>
          )}
        </div>
      ) : (
        <ul className="mt-4 grid grid-cols-1 gap-1.5">
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
  const speed = findOnlineTimeControl(room.initialMs, room.incrementMs)?.group;
  // The guest gets whichever side the host left.
  const yourSide =
    room.hostColor === "random"
      ? "Random side"
      : room.hostColor === "w"
        ? "You play Black"
        : "You play White";
  return (
    <article className="flex animate-rise flex-wrap items-center gap-x-4 gap-y-3 rounded-lg bg-surface px-4 py-3.5 transition-colors hover:bg-raised sm:px-5">
      <span
        aria-hidden
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-canvas text-base font-bold text-muted uppercase"
      >
        {room.hostName.slice(0, 1)}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="flex items-center gap-2 font-bold">
          <span className="truncate">{room.name}</span>
          <span className="shrink-0 text-xs font-medium text-muted">Password required</span>
        </h3>
        <p className="mt-0.5 truncate text-sm text-muted">
          {room.hostName} ·{" "}
          <span translate="no" className="tracking-wider tabular-nums">
            {room.code}
          </span>
        </p>
      </div>
      <dl className="flex flex-wrap gap-1.5 text-sm max-sm:order-last max-sm:basis-full max-sm:pl-14">
        <div className="rounded-md bg-canvas px-2.5 py-1">
          <dt className="sr-only">Time control</dt>
          <dd className="tabular-nums">
            {speed && <span className="text-muted">{speed} </span>}
            {time}
          </dd>
        </div>
        <div className="rounded-md bg-canvas px-2.5 py-1">
          <dt className="sr-only">Your side</dt>
          <dd>{yourSide}</dd>
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
    </article>
  );
}
