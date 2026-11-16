/**
 * The Dark / Light / System choice (docs/DESIGN.md, "Theme tokens"). The choice is remembered on
 * this device; the resolved theme is set as `data-theme` on the root element, which theme.css
 * reads. index.html sets the same attribute before first paint; keep its script in step with this
 * file (the storage key and the rule in `resolveTheme`).
 */
export type ThemeChoice = "dark" | "light" | "system";
export type Theme = "dark" | "light";

export const THEME_CHOICES: readonly ThemeChoice[] = ["dark", "light", "system"];

const STORAGE_KEY = "snaptrack.theme";
const DEVICE_LIGHT = "(prefers-color-scheme: light)";

/** Anything not a saved Dark or Light (nothing saved, or an unknown value) means System. */
export function parseThemeChoice(stored: string | null): ThemeChoice {
  return stored === "dark" || stored === "light" ? stored : "system";
}

export function resolveTheme(choice: ThemeChoice, deviceIsLight: boolean): Theme {
  if (choice === "system") return deviceIsLight ? "light" : "dark";
  return choice;
}

export function readThemeChoice(): ThemeChoice {
  try {
    return parseThemeChoice(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    // Storage can be blocked (private browsing); the app then follows the device.
    return "system";
  }
}

/** Shows the theme for a choice, and matches the browser's own chrome to the page background. */
export function applyThemeChoice(choice: ThemeChoice): void {
  const root = document.documentElement;
  root.dataset.theme = resolveTheme(choice, window.matchMedia(DEVICE_LIGHT).matches);
  const page = getComputedStyle(root).getPropertyValue("--bg-page").trim();
  if (page !== "") document.querySelector('meta[name="theme-color"]')?.setAttribute("content", page);
}

/** Remembers the choice on this device and shows it now. */
export function saveThemeChoice(choice: ThemeChoice): void {
  try {
    if (choice === "system") window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Not remembered when storage is blocked; the choice still applies until the page reloads.
  }
  applyThemeChoice(choice);
}

/** Shows the saved choice and keeps following the device while the choice is System. */
export function startTheme(): void {
  applyThemeChoice(readThemeChoice());
  window.matchMedia(DEVICE_LIGHT).addEventListener("change", () => {
    applyThemeChoice(readThemeChoice());
  });
}
