import { useCallback, useState } from "react";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * A user-resizable column width, persisted per device like the sidebar's
 * collapsed state. `setWidth` only moves the column; `saveWidth` records it,
 * so a drag writes storage once when it ends rather than on every frame.
 */
export function usePaneWidth(
  storageKey: string,
  defaultWidth: number,
  min: number,
  max: number,
) {
  const [width, setWidthState] = useState(() => {
    try {
      const stored = Number(localStorage.getItem(storageKey));
      return stored > 0 ? clamp(stored, min, max) : defaultWidth;
    } catch {
      return defaultWidth;
    }
  });
  const setWidth = useCallback(
    (next: number) => setWidthState(clamp(Math.round(next), min, max)),
    [min, max],
  );
  const saveWidth = useCallback(
    (next: number) => {
      try {
        if (next === defaultWidth) localStorage.removeItem(storageKey);
        else localStorage.setItem(storageKey, String(Math.round(next)));
      } catch {
        // Persistence is best-effort; the in-memory width still applies.
      }
    },
    [storageKey, defaultWidth],
  );
  return { width, setWidth, saveWidth, defaultWidth, min, max };
}
