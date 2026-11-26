/** A media query as React state, so the shell can switch shape without CSS hacks. */

import { useEffect, useState } from "react";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(query);
    const listen = (): void => setMatches(media.matches);
    listen();
    media.addEventListener("change", listen);
    return () => media.removeEventListener("change", listen);
  }, [query]);

  return matches;
}
