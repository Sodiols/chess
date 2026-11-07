"use client";

import { OptionGroup } from "@/components/ui/OptionGroup";
import { ONLINE_TIME_CONTROLS } from "@/lib/multiplayer/timeControls";

export function TimeControlPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  return (
    <OptionGroup
      legend="Time control"
      columns={4}
      value={value}
      onChange={onChange}
      options={ONLINE_TIME_CONTROLS.map((entry) => ({
        value: entry.id,
        label: entry.label,
        visual: <span className="text-xs text-faint">{entry.group}</span>,
      }))}
    />
  );
}
