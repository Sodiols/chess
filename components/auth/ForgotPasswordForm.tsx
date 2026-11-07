"use client";

import Link from "next/link";
import { useState } from "react";
import { getBrowserClient } from "@/lib/supabase/browser";
import { siteUrl, useAuth } from "@/lib/auth/session";
import { authErrorCode } from "@/lib/auth/errors";
import { validateEmail } from "@/lib/auth/validation";
import { Button } from "@/components/ui/Button";
import { AuthShell, Field, FormAlert } from "./AuthShell";
import { NotConfigured } from "./NotConfigured";

export function ForgotPasswordForm() {
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  if (auth.status === "unconfigured") return <NotConfigured />;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const invalid = validateEmail(email);
    setFieldError(invalid);
    if (invalid) return;
    const supabase = getBrowserClient();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error: failure } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: siteUrl("/reset-password"),
    });
    setBusy(false);
    // Only delivery problems are reported. Whether the address has an account
    // is never revealed: the confirmation reads the same either way.
    const code = failure ? authErrorCode(failure) : null;
    if (code === "rate_limited" || code === "network" || code === "invalid_email") setError(code);
    else setSent(true);
  };

  if (sent) {
    return (
      <AuthShell
        title="Check your email"
        description={
          <>
            If an account exists for <span className="font-medium text-ink">{email.trim()}</span>, a password reset
            link is on its way. It works once and expires after a while.
          </>
        }
        footer={
          <Link href="/login" className="font-medium text-accent hover:underline">
            Back to log in
          </Link>
        }
      >
        <Button variant="ghost" onClick={() => setSent(false)}>
          Use a different email
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Reset your password"
      description="Enter the email you signed up with and we'll send you a reset link."
      footer={
        <Link href="/login" className="font-medium text-accent hover:underline">
          Back to log in
        </Link>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
          inputMode="email"
          maxLength={254}
          error={fieldError}
          autoFocus
        />
        <FormAlert error={error} />
        <Button type="submit" variant="primary" size="lg" block disabled={busy} aria-busy={busy}>
          {busy ? "Sending…" : "Send reset link"}
        </Button>
      </form>
    </AuthShell>
  );
}
