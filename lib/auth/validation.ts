/**
 * Client-side checks for instant feedback. The database repeats the username
 * rules (`public.is_valid_username`) and is the final authority.
 */
export const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;
export const PASSWORD_MIN = 8;

const RESERVED = new Set([
  "admin", "administrator", "root", "system", "sysadmin", "gambit", "support", "help",
  "moderator", "mod", "staff", "official", "owner", "superuser", "security", "null",
  "undefined", "anonymous", "guest", "api", "auth", "login", "logout", "signup",
  "register", "profile", "settings", "account", "me", "computer", "bot", "engine",
  "server", "service", "everyone", "nobody", "webmaster", "postmaster", "abuse", "info",
]);

/** Returns an error code, or null when the name is acceptable. */
export function validateUsername(name: string): string | null {
  if (!USERNAME_PATTERN.test(name)) return "invalid_username";
  if (RESERVED.has(name.toLowerCase())) return "username_reserved";
  return null;
}

export function validateEmail(email: string): string | null {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? null : "invalid_email";
}

export function validatePassword(password: string): string | null {
  return password.length >= PASSWORD_MIN ? null : "weak_password";
}

/**
 * The page to return to after signing in. Only same-site paths are allowed, so
 * a crafted `?next=` can never send someone to another site, and auth pages are
 * never targets, so a redirect can't loop.
 */
export function safeNext(next: string | null | undefined, fallback = "/play"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  const path = next.split(/[?#]/)[0]!;
  if (["/login", "/signup", "/forgot-password", "/reset-password", "/auth/callback"].includes(path)) {
    return fallback;
  }
  return next;
}

/** `/login?next=...` for the given destination. */
export function loginHref(next: string, page: "login" | "signup" = "login"): string {
  return `/${page}?next=${encodeURIComponent(safeNext(next))}`;
}
