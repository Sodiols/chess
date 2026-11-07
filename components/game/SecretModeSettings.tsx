"use client";

import Link from "next/link";
import type { AnalysisStrength, SecretSettings } from "@/lib/secret/settings";
import { STRENGTHS } from "@/lib/secret/stockfish";
import { useSecretMode } from "@/hooks/useSecretMode";
import { OptionGroup } from "@/components/ui/OptionGroup";
import { Toggle } from "@/components/ui/Toggle";

const SWITCHES: { key: Exclude<keyof SecretSettings, "enabled" | "strength">; label: string }[] = [
  { key: "bestMove", label: "Best move suggestions" },
  { key: "topThree", label: "Top 3 candidate moves" },
  { key: "responses", label: "Predicted opponent responses" },
  { key: "threats", label: "Tactical threat detection" },
  { key: "evalBar", label: "Evaluation bar" },
  { key: "arrows", label: "Engine analysis arrows" },
  { key: "explanations", label: "Show move explanations" },
];

/** Renders nothing unless the server has confirmed the signed-in account is the owner. */
export function SecretModeSettings() {
  const { isOwner, settings, update } = useSecretMode();
  if (!isOwner) return null;

  return (
    <section aria-labelledby="secret-mode" className="space-y-3">
      <div>
        <h3 id="secret-mode" className="text-sm font-semibold">
          Secret Mode
        </h3>
        <p className="mt-0.5 text-xs leading-snug text-faint">
          Advanced chess engine analysis and personal coaching, in every game mode. It runs only in this browser:
          nothing is sent to the server or to your opponent.
        </p>
      </div>

      <div className="divide-y divide-line border-y border-line">
        <Toggle label="Enable Secret Mode" checked={settings.enabled} onChange={(enabled) => update({ enabled })} />
        {SWITCHES.map(({ key, label }) => (
          <Toggle
            key={key}
            label={label}
            checked={settings[key]}
            disabled={!settings.enabled}
            onChange={(value) => update({ [key]: value })}
          />
        ))}
      </div>

      <OptionGroup<AnalysisStrength>
        legend="Analysis strength"
        columns={3}
        value={settings.strength}
        onChange={(strength) => update({ strength })}
        options={(Object.keys(STRENGTHS) as AnalysisStrength[]).map((value) => ({
          value,
          label: `${STRENGTHS[value].label} · ${STRENGTHS[value].movetimeMs / 1000}s`,
        }))}
      />

      <Link href="/analysis" className="inline-block text-sm font-medium text-accent hover:underline">
        Open the analysis board →
      </Link>
    </section>
  );
}
