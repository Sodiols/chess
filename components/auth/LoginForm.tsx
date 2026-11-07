"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase/browser";
import { siteUrl, useAuth } from "@/lib/auth/session";
import { authErrorCode } from "@/lib/auth/errors";
import { validateEmail } from "@/lib/auth/validation";
import { Button } from "@/components/ui/Button";
import { OPENINGS } from "@/constants/openings";
import { AuthShell, Field, FormAlert, Spinner } from "./AuthShell";
import { NotConfigured } from "./NotConfigured";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string | null; password?: string | null }>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resend, setResend] = useState<"idle" | "sending" | "sent">("idle");

  // Already signed in (or just signed in): go where they were heading.
  useEffect(() => {
    if (auth.status === "signed-in") router.replace(next);
  }, [auth.status, next, router]);

  if (auth.status === "unconfigured") return <NotConfigured />;
  if (auth.status === "signed-in") {
    return (
      <AuthShell opening={OPENINGS.queensGambit} title="Log in">
        <Spinner label="Signed in. Redirecting…" />
      </AuthShell>
    );
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const errors = { email: validateEmail(email), password: password ? null : "password_required" };
    setFieldErrors(errors);
    if (errors.email || errors.password) return;

    const supabase = getBrowserClient();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error: failure } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (failure) setError(authErrorCode(failure));
  };

  const resendConfirmation = async () => {
    const supabase = getBrowserClient();
    if (!supabase) return;
    setResend("sending");
    const { error: failure } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
      options: { emailRedirectTo: siteUrl(`/auth/callback?next=${encodeURIComponent(next)}`) },
    });
    setResend(failure ? "idle" : "sent");
    if (failure) setError(authErrorCode(failure));
  };

  return (
    <AuthShell opening={OPENINGS.queensGambit}
      title="Log in"
      description="Welcome back. Log in to play online."
      footer={
        <>
          New to Gambit?{" "}
          <Link href={`/signup?next=${encodeURIComponent(next)}`} className="font-medium text-accent hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-5">
        <Field
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
          inputMode="email"
          maxLength={254}
          error={fieldErrors.email}
          autoFocus
        />
        <Field
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          maxLength={72}
          error={fieldErrors.password}
        />
        <div className="-mt-1 text-right">
          <Link href="/forgot-password" className="text-sm text-muted hover:text-ink hover:underline">
            Forgot password?
          </Link>
        </div>

        <FormAlert error={error} />
        {error === "email_not_confirmed" && (
          <Button size="sm" onClick={() => void resendConfirmation()} disabled={resend !== "idle"}>
            {resend === "sent" ? "Confirmation email sent" : resend === "sending" ? "Sending…" : "Resend confirmation email"}
          </Button>
        )}

        <Button type="submit" variant="primary" size="lg" block disabled={busy} aria-busy={busy}>
          {busy ? "Logging in…" : "Log in"}
        </Button>
      </form>
    </AuthShell>
  );
}
