import { createPersistentStore } from "@/lib/persistentStore";
import { STORAGE_KEYS } from "@/lib/storage";
import { DEFAULT_ONLINE_TIME_CONTROL, ONLINE_TIME_CONTROLS } from "./timeControls";

/** The last online time control picked, remembered per browser. */
export const onlinePreferences = createPersistentStore(
  STORAGE_KEYS.online,
  { timeControl: DEFAULT_ONLINE_TIME_CONTROL },
  (value) =>
    ONLINE_TIME_CONTROLS.some((entry) => entry.id === value.timeControl)
      ? value
      : { timeControl: DEFAULT_ONLINE_TIME_CONTROL },
);
