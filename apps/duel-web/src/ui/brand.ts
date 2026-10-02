// The game's name and emblem, in one place (the Android app name lives in
// capacitor.config.json and android/app/src/main/res/values/strings.xml).
//
// GAME_NAME is the game's title -- a brand name, kept as-is in every locale
// (like most game titles). The tagline underneath it is ordinary
// descriptive copy, so it's a function that resolves through i18n instead
// of a constant.

import { t } from "../i18n";

export const GAME_NAME = "Duel for the World";
export function gameTagline(): string {
  return t("brand.tagline");
}

// The app icon's emblem: a globe and two rival cards.
export const EMBLEM_URL = new URL("../assets/brand/emblem.svg", import.meta.url).href;
