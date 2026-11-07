"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/session";
import { AuthShell, FormAlert, Spinner } from "./AuthShell";
import { useLinkError } from "./linkHash";

/**
 * Where the sign-up confirmation link lands. Supabase signs the browser in from
 * the link's fragment; once the session exists, continue to the page the
 * player was heading for.
 */
export function AuthCallback({ next }: { next: string }) {
  const router = useRouter();
  const auth = useAuth();
  const linkError = useLinkError();

  useEffect(() => {
    if (!linkError && auth.status === "signed-in") router.replace(next);
  }, [auth.status, linkError, next, router]);

  if (!linkError && (auth.status === "loading" || auth.status === "signed-in")) {
    return (
      <AuthShell title="Confirming your email">
        <Spinner label={auth.status === "loading" ? "Confirming…" : "Confirmed. Redirecting…"} />
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Link not valid" description="Confirmation links work once and expire after a while.">
      <div className="space-y-4">
        <FormAlert error="invalid_link" />
        <p className="text-sm text-muted">
          If you already confirmed, just log in. Otherwise, log in with your email and password and choose
          &ldquo;Resend confirmation email&rdquo;.
        </p>
        <Link
          href={`/login?next=${encodeURIComponent(next)}`}
          className="press inline-flex h-12 items-center rounded-md bg-accent px-6 text-[0.9375rem] font-bold text-[#1f170a] hover:bg-[#e2b970]"
        >
          Go to log in
        </Link>
      </div>
    </AuthShell>
  );
}
