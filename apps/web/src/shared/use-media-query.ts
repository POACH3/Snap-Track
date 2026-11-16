import { useSyncExternalStore } from "react";

/** Whether a CSS media query matches now, updating when it changes. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => {
        list.removeEventListener("change", onChange);
      };
    },
    () => window.matchMedia(query).matches,
  );
}

/** Desktop layout from 1024px (docs/DESIGN.md, "Spacing and layout"). */
export const WIDE = "(min-width: 1024px)";
