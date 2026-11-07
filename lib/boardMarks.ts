import type { AssistanceConfig } from "@/types";

/**
 * Square markers are drawn as radial gradients rather than fixed-size borders so
 * every indicator scales exactly with the board, from a 320px phone to a 720px
 * desktop board, without a single media query.
 */

/** Marker ink, chosen per square shade so dots stay equally visible on both. */
function markInk(isLight: boolean): string {
  return isLight ? "rgba(26,20,13,0.34)" : "rgba(255,252,244,0.46)";
}

const ACCENT = "rgba(226,181,105,0.95)";
const DANGER = "207,96,85";

export const WASH = {
  selected: "rgba(214,172,101,0.42)",
  lastMove: "rgba(214,172,101,0.20)",
  captureTarget: `rgba(${DANGER},0.28)`,
  rejected: `rgba(${DANGER},0.42)`,
} as const;

export function quietDot(isLight: boolean): string {
  return `radial-gradient(circle, ${markInk(isLight)} 0 14%, transparent 14.5%)`;
}

export function captureRing(isLight: boolean): string {
  const ink = markInk(isLight);
  return `radial-gradient(circle, transparent 0 55%, ${ink} 55% 71%, transparent 71.5%)`;
}

/** Castling and en passant destinations, highlighted only in Beginner mode. */
export function specialMark(): string {
  return `radial-gradient(circle, ${ACCENT} 0 15%, transparent 15.5%, transparent 51%, ${ACCENT} 51% 60%, transparent 60.5%)`;
}

export function checkMark(emphasis: AssistanceConfig["checkEmphasis"]): string {
  if (emphasis === "subtle") {
    return `radial-gradient(circle, transparent 0 62%, rgba(${DANGER},0.78) 62% 78%, transparent 78.5%)`;
  }
  const peak = emphasis === "strong" ? 0.92 : 0.7;
  const mid = emphasis === "strong" ? 0.5 : 0.34;
  return `radial-gradient(circle, rgba(${DANGER},${peak}) 0 20%, rgba(${DANGER},${mid}) 46%, rgba(${DANGER},0.06) 74%, transparent 80%)`;
}
