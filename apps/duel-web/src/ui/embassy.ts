import { CARDS } from "@duel-for-the-world/duel-content";
import type { PlayerSlot, PublicDuelistView } from "@duel-for-the-world/duel-server";
import type { ClientState } from "../state/ClientState";
import { t, tf } from "../i18n";
import { localizedCardName } from "../i18n/cardText";
import { renderCardBack, renderCardFace } from "./cardView";
import { el } from "./dom";
import { isEmbassyAwaiting } from "./fieldFx";
import { flavor } from "./flavor";

// La Embajada: each duelist's discard pile (Yu-Gi-Oh's graveyard), where
// destroyed, tributed and spent cards are "sent off as ambassador". It's
// public, so both piles can be opened and browsed by either player. The
// deck pile sits beside it, like on a real mat.

/** The pile on the mat: the most recent card on top, with a count. */
export function renderEmbassyPile(view: PublicDuelistView, onOpen: () => void): HTMLElement {
  const top = view.archive.length > 0 ? view.archive[view.archive.length - 1] : null;
  // While a card is still flying here (fieldFx.ts), keep the new top card
  // hidden so it doesn't land before it arrives.
  const awaiting = isEmbassyAwaiting(view.id);
  const pile = el(
    "button",
    {
      className: `pile pile--embassy${top ? "" : " pile--empty"}${awaiting ? " pile--awaiting" : ""}`,
      title:
        view.archive.length === 1
          ? tf("embassy.tooltip.one", { embassy: flavor().embassy })
          : tf("embassy.tooltip.many", { embassy: flavor().embassy, count: String(view.archive.length) }),
      onclick: (event: MouseEvent) => {
        event.stopPropagation();
        onOpen();
      },
    },
    [
      top ? el("div", { className: "pile-card" }, [renderCardFace(top)]) : null,
      el("div", { className: "pile-label" }, [flavor().embassy]),
      el("div", { className: "pile-count" }, [String(view.archive.length)]),
    ],
  );
  pile.dataset.owner = view.id;
  return pile;
}

/** The deck: a face-down stack with the number of cards left. */
export function renderDeckPile(view: PublicDuelistView): HTMLElement {
  return el(
    "div",
    { className: `pile pile--deck${view.deckCount === 0 ? " pile--empty" : ""}`, title: tf("embassy.deck.tooltip", { count: String(view.deckCount) }) },
    [
      view.deckCount > 0 ? el("div", { className: "pile-card" }, [renderCardBack(t("embassy.deck.label"))]) : null,
      el("div", { className: "pile-label" }, [t("embassy.deck.label")]),
      el("div", { className: "pile-count" }, [String(view.deckCount)]),
    ],
  );
}

function closeViewer(state: ClientState, rerender: () => void): void {
  state.viewingEmbassy = null;
  rerender();
}

/** The open Embajada, newest card first -- or null when none is open. */
export function renderEmbassyViewer(state: ClientState, rerender: () => void): HTMLElement | null {
  const owner: PlayerSlot | null = state.viewingEmbassy;
  if (!state.duel || owner === null) {
    return null;
  }
  const view = state.duel.duelists[owner];
  const title =
    owner === state.you
      ? tf("embassy.viewer.titleYours", { embassy: flavor().embassyWord })
      : tf("embassy.viewer.titleTheirs", { embassy: flavor().embassyWord });
  const cards = [...view.archive].reverse();

  return el("div", { className: "viewer-backdrop", onclick: () => closeViewer(state, rerender) }, [
    el(
      "div",
      {
        className: "viewer",
        role: "dialog",
        ariaLabel: title,
        onclick: (event: MouseEvent) => event.stopPropagation(),
      },
      [
        el("div", { className: "viewer-header" }, [
          el("h2", {}, [title]),
          el("span", { className: "viewer-count" }, [
            cards.length === 1 ? t("embassy.viewer.count.one") : tf("embassy.viewer.count.many", { count: String(cards.length) }),
          ]),
          el("button", { className: "tutorial-close", onclick: () => closeViewer(state, rerender) }, ["×"]),
        ]),
        cards.length === 0
          ? el("p", { className: "viewer-empty" }, [t("embassy.viewer.empty")])
          : el(
              "div",
              { className: "viewer-grid" },
              cards.map((cardId) => el("div", { className: "viewer-card", title: localizedCardName(cardId, CARDS[cardId].name) }, [renderCardFace(cardId)])),
            ),
      ],
    ),
  ]);
}
