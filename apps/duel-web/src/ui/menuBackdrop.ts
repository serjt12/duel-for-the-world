import { CARD_ART } from "./cardArt";
import { EMBLEM_URL } from "./brand";
import { el } from "./dom";

// The main menu's backdrop: a world worth fighting over. Rather than
// depicting real people, this leans on cards the game already has --
// three of the World Edition's power-hungry Leader archetypes (see
// WorldCards.ts: "Term limits are more of a suggestion," "Policy
// announced at 3 a.m. Policy reversed at 3:05," "The uniform comes off
// for no one") looming behind the menu, with the game's own gold-globe
// emblem between them as the prize they're all after. Purely decorative:
// aria-hidden, no pointer events, dimmed well under the menu's own text
// and buttons (which sit above it via z-index -- see style.css).
const FIGURES: Array<{ cardId: "tweeting-tycoon" | "eternal-incumbent" | "lifelong-generalissimo"; className: string }> = [
  { cardId: "tweeting-tycoon", className: "menu-backdrop-figure menu-backdrop-figure--left" },
  { cardId: "eternal-incumbent", className: "menu-backdrop-figure menu-backdrop-figure--right" },
  { cardId: "lifelong-generalissimo", className: "menu-backdrop-figure menu-backdrop-figure--center" },
];

export function renderMenuBackdrop(): HTMLElement {
  return el("div", { className: "menu-backdrop", ariaHidden: "true" }, [
    el("img", { className: "menu-backdrop-globe", src: EMBLEM_URL, alt: "", draggable: false }),
    ...FIGURES.map((figure) =>
      el("div", { className: figure.className }, [el("img", { src: CARD_ART[figure.cardId], alt: "", draggable: false })]),
    ),
    el("div", { className: "menu-backdrop-fade" }),
  ]);
}
