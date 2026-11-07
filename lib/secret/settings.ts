export type AnalysisStrength = "quick" | "deep" | "max";

/** The owner's Secret Mode preferences. Stored server-side, never in the browser. */
export interface SecretSettings {
  enabled: boolean;
  bestMove: boolean;
  topThree: boolean;
  responses: boolean;
  threats: boolean;
  evalBar: boolean;
  arrows: boolean;
  strength: AnalysisStrength;
  explanations: boolean;
}

export const DEFAULT_SECRET_SETTINGS: SecretSettings = {
  enabled: false,
  bestMove: true,
  topThree: true,
  responses: true,
  threats: true,
  evalBar: true,
  arrows: true,
  strength: "quick",
  explanations: true,
};

const STRENGTHS: AnalysisStrength[] = ["quick", "deep", "max"];

/** Keeps only known keys of the right type; anything else falls back to the default. Used at the API boundary. */
export function sanitizeSecretSettings(input: unknown): SecretSettings {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const out = { ...DEFAULT_SECRET_SETTINGS };
  for (const key of Object.keys(out) as (keyof SecretSettings)[]) {
    const value = raw[key];
    if (key === "strength") {
      if (STRENGTHS.includes(value as AnalysisStrength)) out.strength = value as AnalysisStrength;
    } else if (typeof value === "boolean") {
      out[key] = value;
    }
  }
  return out;
}
