/** Supabase Auth error codes mapped onto Gambit's message codes. */
const CODES: Record<string, string> = {
  invalid_credentials: "invalid_credentials",
  email_not_confirmed: "email_not_confirmed",
  weak_password: "weak_password",
  user_already_exists: "email_taken",
  email_exists: "email_taken",
  over_request_rate_limit: "rate_limited",
  over_email_send_rate_limit: "rate_limited",
  same_password: "same_password",
  reauthentication_needed: "reauthentication_needed",
  signup_disabled: "auth_disabled",
  email_provider_disabled: "auth_disabled",
  otp_expired: "invalid_link",
  flow_state_expired: "invalid_link",
  bad_jwt: "signed_out",
  session_not_found: "signed_out",
  validation_failed: "invalid_email",
  email_address_invalid: "invalid_email",
};

interface AuthErrorLike {
  code?: string;
  status?: number;
  message?: string;
  name?: string;
}

/**
 * `database` means the sign-up hit Gambit's profile trigger, almost always
 * because someone took the username a moment earlier; the caller rechecks.
 */
export function authErrorCode(error: unknown): string {
  const e = (error ?? {}) as AuthErrorLike;
  if (e.code && CODES[e.code]) return CODES[e.code]!;
  if (e.name === "AuthRetryableFetchError" || e.status === 0) return "network";
  if (e.status === 429) return "rate_limited";
  if (/database error/i.test(e.message ?? "")) return "database";
  return "try_again";
}

/** Errors Supabase puts in a link's URL fragment, e.g. an expired or reused link. */
export function linkError(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  return params.get("error") || params.get("error_code") ? "invalid_link" : null;
}
