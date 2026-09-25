import { CARDS } from "@project-palacio/duel-content";
import type { PlayerSlot, PublicDuelistView } from "@project-palacio/duel-server";
import type { ClientState } from "../state/ClientState";
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
      title: `${flavor().embassy}: ${view.archive.length} card${view.archive.length === 1 ? "" : "s"} -- click to look inside`,
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
  return el("div", { className: `pile pile--deck${view.deckCount === 0 ? " pile--empty" : ""}`, title: `Deck: ${view.deckCount} cards left` }, [
    view.deckCount > 0 ? el("div", { className: "pile-card" }, [renderCardBack("Deck")]) : null,
    el("div", { className: "pile-label" }, ["Deck"]),
    el("div", { className: "pile-count" }, [String(view.deckCount)]),
  ]);
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
  const whose = owner === state.you ? "Your" : "Your opponent's";
  const cards = [...view.archive].reverse();

  return el("div", { className: "viewer-backdrop", onclick: () => closeViewer(state, rerender) }, [
    el(
      "div",
      {
        className: "viewer",
        role: "dialog",
        ariaLabel: `${whose} ${flavor().embassyWord}`,
        onclick: (event: MouseEvent) => event.stopPropagation(),
      },
      [
        el("div", { className: "viewer-header" }, [
          el("h2", {}, [`${whose} ${flavor().embassyWord}`]),
          el("span", { className: "viewer-count" }, [`${cards.length} card${cards.length === 1 ? "" : "s"}, newest first`]),
          el("button", { className: "tutorial-close", onclick: () => closeViewer(state, rerender) }, ["×"]),
        ]),
        cards.length === 0
          ? el("p", { className: "viewer-empty" }, ["Nobody has been sent abroad yet."])
          : el(
              "div",
              { className: "viewer-grid" },
              cards.map((cardId) => el("div", { className: "viewer-card", title: CARDS[cardId].name }, [renderCardFace(cardId)])),
            ),
      ],
    ),
  ]);
}
