"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import type { AssistanceMode } from "@/types";
import { MODE_DETAILS, MODE_ORDER } from "@/constants/assistance";
import { STORAGE_KEYS } from "@/lib/storage";
import { createPersistentStore } from "@/lib/persistentStore";
import { Dialog } from "@/components/ui/Dialog";
import { ModeSelector } from "./ModeSelector";

const onboardingStore = createPersistentStore(STORAGE_KEYS.onboarded, { done: false });

/**
 * Mode cards on the landing page, plus the one-time prompt that asks how much
 * help the players want before they reach the setup screen.
 */
export function ModeChooser() {
  const router = useRouter();
  const { done } = useSyncExternalStore(
    onboardingStore.subscribe,
    onboardingStore.getSnapshot,
    onboardingStore.getServerSnapshot,
  );
  const [dismissed, setDismissed] = useState(false);
  const onboarding = !done && !dismissed;

  const dismissOnboarding = () => {
    setDismissed(true);
    onboardingStore.update({ done: true });
  };

  const start = (mode: AssistanceMode) => {
    onboardingStore.update({ done: true });
    router.push(`/play/local?mode=${mode}`);
  };

  return (
    <>
      <ModeSelector onSelect={start} />

      <Dialog
        open={onboarding}
        onClose={dismissOnboarding}
        title="Choose how much help you want"
        description="You can change this at any time. Every mode plays the exact same legal chess."
      >
        <ul className="space-y-2">
          {MODE_ORDER.map((mode) => (
            <li key={mode}>
              <button
                type="button"
                onClick={() => start(mode)}
                className="flex w-full items-baseline justify-between gap-3 rounded-lg border border-line bg-raised px-3.5 py-3 text-left transition-colors hover:border-accent hover:bg-accent-soft"
              >
                <span className="text-sm font-semibold">{MODE_DETAILS[mode].name}</span>
                <span className="text-xs text-muted">{MODE_DETAILS[mode].summary}</span>
              </button>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={dismissOnboarding}
          className="mt-4 w-full text-center text-xs text-faint transition-colors hover:text-muted"
        >
          Skip — I’ll look around first
        </button>
      </Dialog>
    </>
  );
}
