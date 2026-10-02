// Localization: a tiny key -> string resolver backed by per-language
// dictionaries, rather than a heavy framework -- this is a Capacitor/Vite
// SPA, not a big multi-team codebase. See
// claude/palacio_i18n_plan.md (the Project doc) for the full plan this
// implements, phase by phase.
//
// Usage: `t("menu.tutorial")` anywhere a user-facing string would
// otherwise be a literal. English is a mandatory fallback for any key
// missing from another locale, so an incomplete translation never ships a
// blank string or a raw key to a player -- see `t()` below.

import { en } from "./locales/en";
import { es } from "./locales/es";

export type Locale = "en" | "es";

export const SUPPORTED_LOCALES: ReadonlyArray<{ code: Locale; label: string }> = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
];

const DICTIONARIES: Record<Locale, Record<string, string>> = { en, es };

const STORAGE_KEY = "palacio.locale";

function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "es";
}

// The device's own language, mapped to one of our supported locales.
// Anything not explicitly Spanish defaults to English -- never guess a
// locale we have no dictionary for.
function detectDeviceLocale(): Locale {
  try {
    const raw = (navigator.languages && navigator.languages[0]) || navigator.language || "en";
    return raw.toLowerCase().startsWith("es") ? "es" : "en";
  } catch {
    return "en";
  }
}

function loadSavedLocale(): Locale | null {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return isLocale(saved) ? saved : null;
  } catch {
    return null;
  }
}

let currentLocale: Locale = loadSavedLocale() ?? detectDeviceLocale();
const listeners: Array<(locale: Locale) => void> = [];

export function locale(): Locale {
  return currentLocale;
}

// An explicit choice (the Settings language switcher) always wins over
// the device's own language from here on, for this device.
export function setLocale(next: Locale): void {
  if (next === currentLocale) return;
  currentLocale = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // ignore -- the choice just won't survive a reload
  }
  for (const listener of listeners) listener(currentLocale);
}

export function onLocaleChange(listener: (locale: Locale) => void): void {
  listeners.push(listener);
}

/**
 * Look up a UI string by key in the current locale, falling back to
 * English, and finally to the key itself -- so a missing translation
 * (or a typo'd key) is visible and debuggable instead of a blank button.
 */
export function t(key: string): string {
  return DICTIONARIES[currentLocale][key] ?? DICTIONARIES.en[key] ?? key;
}

/**
 * `t()` plus `{placeholder}` substitution, for the handful of strings
 * that interpolate a value (e.g. "Buy for {price}"). Kept as a separate
 * function rather than overloading `t()` so the common (no-args) case
 * stays a one-argument call everywhere else.
 */
export function tf(key: string, vars: Record<string, string>): string {
  return t(key).replace(/\{(\w+)\}/g, (match, name: string) => vars[name] ?? match);
}
