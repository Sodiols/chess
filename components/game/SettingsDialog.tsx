"use client";

import type { GameSettings } from "@/types";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { SettingsPanel } from "./SettingsPanel";

interface SettingsDialogProps {
  open: boolean;
  settings: GameSettings;
  onChange: (patch: Partial<GameSettings>) => void;
  onClose: () => void;
  context?: "game" | "global";
}

export function SettingsDialog({
  open,
  settings,
  onChange,
  onClose,
  context = "game",
}: SettingsDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      title="Settings"
      description="Preferences are saved on this device and never change the rules of the game."
    >
      <div className="max-h-[min(60vh,32rem)] overflow-y-auto overscroll-contain pr-1">
        <SettingsPanel settings={settings} onChange={onChange} context={context} />
      </div>
      <div className="mt-5 flex justify-end">
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      </div>
    </Dialog>
  );
}
