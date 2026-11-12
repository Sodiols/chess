"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/lib/auth/session";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/multiplayer/client";
import { errorMessage } from "@/lib/multiplayer/types";
import type { NotificationItem } from "@/lib/social/types";
import { useSocialBroadcast, useSocialQuery } from "@/hooks/useSocialQuery";

type Inbox = { unread: number; items: NotificationItem[] };

export function NotificationBell() {
  const auth = useAuth();
  const id = auth.status === "signed-in" ? auth.user.id : null;
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { result, refresh } = useSocialQuery<Inbox>(id ? "/api/social/notifications" : null, { interval: 30_000 });
  useSocialBroadcast(id ? `notifications:${id}` : null, "changed", () => {
    void refresh();
    window.dispatchEvent(new Event("gambit-social-update"));
  });
  if (!id) return null;
  const mark = async (notification: number) => {
    const response = await api<Inbox>("/api/social/notifications", { method: "POST", body: { id: notification } });
    setError(response.ok ? null : response.error);
    if (response.ok) void refresh();
  };
  const count = result?.ok ? result.unread : 0;
  return <div className="relative" onKeyDown={(event) => {
    if (event.key === "Escape") { setOpen(false); event.currentTarget.querySelector("button")?.focus(); }
  }} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button type="button" aria-expanded={open} aria-label={`Notifications${count ? `, ${count} unread` : ""}`}
      onClick={() => setOpen(!open)} className="relative grid size-11 place-items-center text-muted hover:text-ink">
      <svg viewBox="0 0 24 24" className="size-5 fill-none stroke-current" strokeWidth="1.5" aria-hidden="true">
        <path d="M18 8a6 6 0 0 0-12 0c0 6-2 7-2 8h16c0-1-2-2-2-8m-8 12h4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {!!count && <span aria-hidden="true" className="absolute right-0 top-0 rounded-sm bg-accent px-1 text-xs font-bold text-canvas">{count > 99 ? "99+" : count}</span>}
    </button>
    {open && <div className="absolute right-0 z-30 max-h-[60vh] w-64 max-sm:fixed max-sm:inset-x-4 max-sm:top-24 max-sm:w-auto overflow-y-auto overscroll-contain rounded-md border border-line bg-raised p-3 sm:w-80">
      <div className="flex flex-wrap items-center justify-between gap-1"><h2 className="font-bold">Notifications</h2>
        {count > 0 && <Button size="sm" variant="ghost" onClick={() => void mark(0)}>Mark all read</Button>}</div>
      {error && <p role="alert" className="text-sm text-danger">{errorMessage(error)}</p>}
      {!result ? <p role="status" className="py-3 text-sm text-muted">Loading…</p> : !result.ok ? <p role="alert">{errorMessage(result.error)}</p>
        : !result.items.length ? <p className="py-3 text-sm text-muted">You’re all caught up.</p> : <ul className="divide-y divide-line">
          {result.items.map((item) => <li key={item.id}><Link href={item.href}
            onClick={() => { if (!item.read_at) void mark(item.id); setOpen(false); }}
            className={`block py-3 text-sm hover:underline ${item.read_at ? "text-muted" : "text-ink"}`}>{item.message}</Link></li>)}
        </ul>}
    </div>}
  </div>;
}
