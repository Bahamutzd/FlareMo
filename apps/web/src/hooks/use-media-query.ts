import { useCallback, useSyncExternalStore } from "react";

/** Tailwind's `lg` breakpoint: the width where the workspace goes three-pane. */
export const WIDE_WORKSPACE_QUERY = "(min-width: 1024px)";

/** Live `matchMedia` result; false where `matchMedia` is unavailable (tests, SSR). */
export function useMediaQuery(query: string) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () =>
      typeof window !== "undefined" && window.matchMedia
        ? window.matchMedia(query).matches
        : false,
    () => false,
  );
}
