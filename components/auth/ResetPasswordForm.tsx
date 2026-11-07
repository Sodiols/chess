"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase/browser";
import { useAuth } from "@/lib/auth/session";
import { authErrorCode } from "@/lib/auth/errors";
import { validatePassword } from "@/lib/auth/validation";
import { Button } from "@/components/ui/Button";
import { AuthShell, Field, FormAlert, Spinner } from "./AuthShell";
import { NotConfigured } from "./NotConfigured";
import { useLinkError } from "./linkHash";

/**
 * The page a recovery link (or a guest's email-confirmation link, `mode=set`)
 * opens. Supabase signs the browser in from the link; the player then picks a
 * new password. Expired, reused and malformed links arrive with an error in
 * the fragment, or with no session at all.
 */
export function ResetPasswordForm({ next, mode }: { next: string; mode: "reset" | "set" }) {
  const router = useRouter();
  const auth = useAuth();
  const linkError = useLinkError();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ password?: string | null; confirm?: string | null }>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const title = mode === "set" ? "Set your password" : "Choose a new password";

  if (auth.status === "unconfigured") return <NotConfigured />;
  if (!linkError && auth.status === "loading") {
    return (
      <AuthShell title={title}>
        <Spinner label="Checking your link…" />
      </AuthShell>
    );
  }
  if (linkError || auth.status !== "signed-in") {
    return (
      <AuthShell title="Link not valid" description="Reset links work once and expire after a while.">
        <div className="space-y-4">
          <FormAlert error="invalid_link" />
          <Link
            href="/forgot-password"
            className="inline-flex h-10 items-center rounded-lg bg-accent px-4 text-sm font-semibold text-[#1f170a] hover:bg-[#e2b970]"
          >
            Request a new link
          </Link>
        </div>
      </AuthShell>
    );
  }
  if (done) {
    return (
      <AuthShell title="Password updated" description="You're signed in with your new password.">
        <Button variant="primary" onClick={() => router.replace(next)}>
          Continue
        </Button>
      </AuthShell>
    );
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const found = {
      password: validatePassword(password),
      confirm: password === confirm ? null : "password_mismatch",
    };
    setErrors(found);
    if (found.password || found.confirm) return;
    const supabase = getBrowserClient();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error: failure } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (!failure) {
      setDone(true);
      return;
    }
    const code = authErrorCode(failure);
    if (code === "weak_password" || code === "same_password") setErrors({ password: code });
    else setError(code);
  };

  return (
    <AuthShell title={title} description={`For ${auth.user.email ?? "your account"}.`}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field
          label="New password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          maxLength={72}
          error={errors.password}
          hint="At least 8 characters."
          autoFocus
        />
        <Field
          label="Confirm password"
          type="password"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
          maxLength={72}
          error={errors.confirm}
        />
        <FormAlert error={error} />
        <Button type="submit" variant="primary" size="lg" block disabled={busy} aria-busy={busy}>
          {busy ? "Saving…" : "Save password"}
        </Button>
      </form>
    </AuthShell>
  );
}
