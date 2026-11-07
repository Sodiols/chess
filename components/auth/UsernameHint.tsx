import type { UsernameCheck } from "@/hooks/useUsernameCheck";
import { errorMessage } from "@/lib/multiplayer/types";

/** The line under a username field: rules, then live availability. */
export function UsernameHint({ check }: { check: UsernameCheck }) {
  switch (check.status) {
    case "checking":
      return <span>Checking availability…</span>;
    case "available":
      return <span className="text-positive">✓ Available</span>;
    case "unavailable":
      return <span className="text-[#f0a49b]">{errorMessage(check.reason)}</span>;
    case "error":
      return (
        <span className={check.error === "setup_incomplete" ? "text-[#f0a49b]" : undefined}>
          {errorMessage(
            check.error === "rate_limited" || check.error === "setup_incomplete" ? check.error : "username_check_failed",
          )}
        </span>
      );
    default:
      return <span>3–20 letters, numbers or underscores.</span>;
  }
}
