"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase/browser";
import { siteUrl, useAuth } from "@/lib/auth/session";
import { authErrorCode } from "@/lib/auth/errors";
import { validateEmail, validatePassword, validateUsername } from "@/lib/auth/validation";
import { api } from "@/lib/multiplayer/client";
import { checkUsername, useUsernameCheck } from "@/hooks/useUsernameCheck";
import { Button } from "@/components/ui/Button";
import { OPENINGS } from "@/constants/openings";
import { AuthShell, Field, FormAlert, Spinner } from "./AuthShell";
import { NotConfigured } from "./NotConfigured";
import { UsernameHint } from "./UsernameHint";

type Errors = Partial<Record<"username" | "email" | "password" | "confirm", string | null>>;

export function SignupForm({ next }: { next: string }) {
  const router = useRouter();
  const auth = useAuth();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<{ email: string; upgrade: boolean } | null>(null);
  const check = useUsernameCheck(username.trim());
  // A guest from the old automatic sign-in keeps their id and games by linking
  // an email to that identity instead of creating a second account.
  const upgrading = auth.status === "anonymous";

  useEffect(() => {
    if (auth.status === "signed-in" && !sentTo) router.replace(next);
  }, [auth.status, next, router, sentTo]);

  if (auth.status === "unconfigured") return <NotConfigured />;
  if (sentTo) return <CheckEmail sentTo={sentTo} next={next} onBack={() => setSentTo(null)} />;
  if (auth.status === "signed-in" || auth.status === "loading") {
    return (
      <AuthShell opening={OPENINGS.sicilian} title="Create your account">
        <Spinner label={auth.status === "loading" ? "Loading…" : "Signed in. Redirecting…"} />
      </AuthShell>
    );
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const name = username.trim();
    const found: Errors = {
      username: validateUsername(name),
      email: validateEmail(email),
      password: upgrading ? null : validatePassword(password),
      confirm: upgrading || password === confirm ? null : "password_mismatch",
    };
    setErrors(found);
    setError(null);
    if (Object.values(found).some(Boolean)) return;

    const supabase = getBrowserClient();
    if (!supabase) return;
    setBusy(true);
    try {
      // Fresh check right before submitting; the database still has the last word.
      const latest = await checkUsername(name);
      if (latest.status === "unavailable") {
        setErrors({ username: latest.reason });
        return;
      }
      // Without the accounts migration the username couldn't be stored: stop
      // before creating an account that would be missing it.
      if (latest.status === "error" && latest.error === "setup_incomplete") {
        setError("setup_incomplete");
        return;
      }

      if (upgrading) {
        const claimed = await api("/api/profile", { method: "POST", body: { username: name } });
        if (!claimed.ok) {
          if (claimed.error.includes("username")) setErrors({ username: claimed.error });
          else setError(claimed.error);
          return;
        }
        const { error: failure } = await supabase.auth.updateUser(
          { email: email.trim(), data: { username: name } },
          { emailRedirectTo: siteUrl(`/reset-password?mode=set&next=${encodeURIComponent(next)}`) },
        );
        if (failure) {
          setError(authErrorCode(failure));
          return;
        }
        setSentTo({ email: email.trim(), upgrade: true });
        return;
      }

      const { data, error: failure } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { username: name },
          emailRedirectTo: siteUrl(`/auth/callback?next=${encodeURIComponent(next)}`),
        },
      });
      if (failure) {
        const code = authErrorCode(failure);
        if (code === "database") {
          // The profile trigger refused: someone claimed the name a moment ago.
          const again = await checkUsername(name);
          if (again.status === "unavailable") setErrors({ username: again.reason });
          else setError("try_again");
        } else if (code === "weak_password") setErrors({ password: code });
        else if (code === "invalid_email" || code === "email_taken") setErrors({ email: code });
        else setError(code);
        return;
      }
      // With email confirmation on there is no session yet: the account isn't
      // usable until the link is opened, so it must not look signed in.
      if (data.session) router.replace(next);
      else setSentTo({ email: email.trim(), upgrade: false });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell opening={OPENINGS.sicilian}
      title="Create your account"
      description={
        upgrading
          ? "You're playing as a guest. Add an email and username to keep your games under a permanent account."
          : "Pick a username other players will see. Offline modes never need an account."
      }
      footer={
        <>
          Already have an account?{" "}
          <Link href={`/login?next=${encodeURIComponent(next)}`} className="font-medium text-accent hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-5">
        <Field
          label="Username"
          value={username}
          onChange={(value) => setUsername(value.replace(/\s/g, ""))}
          autoComplete="username"
          autoCapitalize="none"
          maxLength={20}
          error={errors.username}
          hint={<UsernameHint check={check} />}
          autoFocus
        />
        <Field
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
          inputMode="email"
          maxLength={254}
          error={errors.email}
        />
        {!upgrading && (
          <>
            <Field
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              maxLength={72}
              error={errors.password}
              hint="At least 8 characters."
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
          </>
        )}
        {upgrading && (
          <p className="text-xs leading-relaxed text-faint">
            After you confirm your email you&rsquo;ll choose a password.
          </p>
        )}

        <FormAlert error={error} />
        <Button type="submit" variant="primary" size="lg" block disabled={busy} aria-busy={busy}>
          {busy ? "Creating account…" : "Create Account"}
        </Button>
      </form>
    </AuthShell>
  );
}

function CheckEmail({
  sentTo,
  next,
  onBack,
}: {
  sentTo: { email: string; upgrade: boolean };
  next: string;
  onBack: () => void;
}) {
  const [resend, setResend] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  const again = async () => {
    const supabase = getBrowserClient();
    if (!supabase) return;
    setResend("sending");
    const { error: failure } = await supabase.auth.resend(
      sentTo.upgrade
        ? { type: "email_change", email: sentTo.email }
        : {
            type: "signup",
            email: sentTo.email,
            options: { emailRedirectTo: siteUrl(`/auth/callback?next=${encodeURIComponent(next)}`) },
          },
    );
    setResend(failure ? "idle" : "sent");
    setError(failure ? authErrorCode(failure) : null);
  };

  return (
    <AuthShell opening={OPENINGS.sicilian}
      title="Check your email"
      description={
        <>
          We sent a confirmation link to <span className="font-medium text-ink">{sentTo.email}</span>. Open it
          to {sentTo.upgrade ? "confirm your email and set a password" : "activate your account"}.
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-xs leading-relaxed text-faint">
          Nothing after a few minutes? Check spam. If this email already has an account, log in instead.
        </p>
        <FormAlert error={error} />
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void again()} disabled={resend !== "idle"}>
            {resend === "sent" ? "Email sent" : resend === "sending" ? "Sending…" : "Resend email"}
          </Button>
          <Button variant="ghost" onClick={onBack}>
            Use a different email
          </Button>
        </div>
      </div>
    </AuthShell>
  );
}
