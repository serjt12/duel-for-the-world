import { rulesText } from "@duel-for-the-world/duel-content";
import type { CardId } from "@duel-for-the-world/duel-content";
import { locale, t } from "../i18n";
import { describeCard } from "./cardInfo";
import { renderCardFace } from "./cardView";
import { el } from "./dom";

// The card inspector: on a phone the cards on the board are small, so a
// long press on any face-up card (hand, field, piles, viewers) shows it
// big, with its full rules and flavor text. Right-click does the same on
// desktop. Tap anywhere to close.

const HOLD_MS = 420;
const MOVE_TOLERANCE_PX = 10;

let overlay: HTMLElement | null = null;
let swallowClick = false;

export function closeCardInspector(): void {
  overlay?.remove();
  overlay = null;
}

export function openCardInspector(cardId: CardId): void {
  closeCardInspector();
  const info = describeCard(cardId);
  const rules = rulesText(cardId, locale());
  const big = el("div", { className: "inspect-card" }, [renderCardFace(cardId)]);
  const panel = el("div", { className: "inspect-text" }, [
    el("h2", {}, [info.name]),
    el("div", { className: "inspect-tag" }, [info.tagLine]),
    info.statsLine ? el("div", { className: "inspect-stats" }, [info.statsLine]) : null,
    rules ? el("p", { className: "inspect-rules" }, [rules]) : null,
    el("p", { className: "inspect-flavor" }, [`“${info.flavorText}”`]),
    el("div", { className: "inspect-close" }, [t("inspect.closeHint")]),
  ]);
  overlay = el(
    "div",
    { className: "inspect-backdrop", role: "dialog", ariaLabel: info.name, onclick: () => closeCardInspector() },
    [el("div", { className: "inspect-box" }, [big, panel])],
  );
  document.body.append(overlay);
}

/** Long-press (touch or mouse) and right-click open the inspector. */
export function installCardInspector(): void {
  let timer: number | null = null;
  let start = { x: 0, y: 0 };

  const cancel = () => {
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
  };

  document.addEventListener(
    "pointerdown",
    (event) => {
      const card = (event.target as Element | null)?.closest<HTMLElement>(".card[data-card-id]");
      if (!card || overlay) return;
      cancel();
      start = { x: event.clientX, y: event.clientY };
      const cardId = card.dataset.cardId as CardId;
      timer = window.setTimeout(() => {
        timer = null;
        // Don't also treat the release as a tap on the card.
        swallowClick = true;
        window.setTimeout(() => (swallowClick = false), 700);
        openCardInspector(cardId);
      }, HOLD_MS);
    },
    true,
  );
  document.addEventListener(
    "pointermove",
    (event) => {
      if (timer === null) return;
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > MOVE_TOLERANCE_PX) cancel(); // it's a drag
    },
    true,
  );
  document.addEventListener("pointerup", cancel, true);
  document.addEventListener("pointercancel", cancel, true);
  document.addEventListener(
    "click",
    (event) => {
      // The finger lifting after a long press lands on the inspector itself:
      // that release must not close it (or tap whatever is underneath).
      if (swallowClick) {
        swallowClick = false;
        event.stopPropagation();
        event.preventDefault();
      }
    },
    true,
  );
  document.addEventListener("contextmenu", (event) => {
    const card = (event.target as Element | null)?.closest<HTMLElement>(".card[data-card-id]");
    if (!card) return;
    event.preventDefault();
    openCardInspector(card.dataset.cardId as CardId);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && overlay) {
      event.stopImmediatePropagation();
      closeCardInspector();
    }
  }, true);
}
