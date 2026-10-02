import { useSyncExternalStore } from "react";

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
  );
}

/** Below Tailwind's `md` breakpoint: ships are shown as cards. */
export const PHONE_QUERY = "(max-width: 767px)";
/** Below Tailwind's `lg` breakpoint: list and map are separate tabs. */
export const TABBED_QUERY = "(max-width: 1023px)";
