import { ACTOR_CARDS, CARDS, POLICY_CARDS, embassyChoiceIn } from "@duel-for-the-world/duel-content";
import type { CardId, InstantEffect } from "@duel-for-the-world/duel-content";
import { ACTOR_ZONE_COUNT, eligibleEmbassyIndices } from "@duel-for-the-world/duel-engine";
import { t, tf } from "../i18n";
import { localizedCardName } from "../i18n/cardText";
import type { PlayerSlot, PublicDuelState } from "@duel-for-the-world/duel-server";
import type { ClientState } from "../state/ClientState";
import { renderCardFace } from "./cardView";
import { el } from "./dom";
import { flavor } from "./flavor";

// Cards that bring something back from an Embassy (Presidential Pardon,
// the Lobbyist, the Defector...) let their player pick WHICH card. The
// Embassies are public, so the client can list the eligible cards itself
// (with the engine's own eligibility rule); the server re-checks the pick
// and falls back to the most recent eligible card if it's no good.

type Retrieval = Extract<InstantEffect, { kind: "retrieve-from-embassy" }>;

export interface EmbassyChoice {
  effect: Retrieval;
  owner: PlayerSlot; // whose Embassy it reads from
  indices: number[]; // eligible archive indices, oldest first
}

const other = (slot: PlayerSlot): PlayerSlot => (slot === "duelist1" ? "duelist2" : "duelist1");

/** The retrieval in `effects` (if any) and what it could pick right now. */
export function embassyChoice(duel: PublicDuelState, you: PlayerSlot, effects: readonly InstantEffect[] | undefined): EmbassyChoice | null {
  const effect = embassyChoiceIn(effects);
  if (!effect) return null;
  const owner = effect.from === "yours" ? you : other(you);
  return { effect, owner, indices: eligibleEmbassyIndices(duel.duelists[owner].archive, effect.filter) };
}

/** The effects a play will resolve, so we know whether to ask for a pick. */
export function effectsOfPlay(
  cardId: CardId,
  play: "deploy-face-up" | "deploy-face-down" | "flip" | "activate",
): readonly InstantEffect[] | undefined {
  const card = CARDS[cardId];
  if (card.category === "actor") {
    if (play === "deploy-face-up") return ACTOR_CARDS[card.id].onDeploy;
    if (play === "flip") return ACTOR_CARDS[card.id].onFlip;
    return undefined;
  }
  if (card.category === "policy" && play === "activate") {
    const policy = POLICY_CARDS[card.id];
    return policy.kind === "normal" ? policy.onActivate : undefined;
  }
  return undefined;
}

/**
 * Why a retrieval Policy can't be activated right now (the server rejects
 * it too: "nothing-to-retrieve"), or null.
 */
export function retrievalBlock(duel: PublicDuelState, you: PlayerSlot, cardId: CardId): string | null {
  const choice = embassyChoice(duel, you, effectsOfPlay(cardId, "activate"));
  if (!choice) return null;
  if (choice.indices.length === 0) {
    const key = choice.owner === you ? "embassyPicker.blockedEmpty.yours" : "embassyPicker.blockedEmpty.theirs";
    return tf(key, { embassy: flavor().embassyWord });
  }
  if (choice.effect.to === "field" && duel.duelists[you].field.length >= ACTOR_ZONE_COUNT) {
    return t("embassyPicker.blockedFull");
  }
  return null;
}

/**
 * Runs `send` with the player's pick: straight away when there's no
 * choice to make (nothing or only one eligible card), otherwise after the
 * picker. `onCancel` restores whatever the player was doing before.
 */
export function withEmbassyPick(
  state: ClientState,
  rerender: () => void,
  cardId: CardId,
  effects: readonly InstantEffect[] | undefined,
  send: (embassyPick: number | undefined) => void,
): void {
  const duel = state.duel;
  const you = state.you;
  const choice = duel && you ? embassyChoice(duel, you, effects) : null;
  if (!choice || choice.indices.length <= 1) {
    send(choice?.indices[0]);
    return;
  }
  state.embassyPick = { cardId, choice, send };
  rerender();
}

function describeWhat(choice: EmbassyChoice, you: PlayerSlot): string {
  const { filter, to } = choice.effect;
  const kind = filter.category === "actor" ? t("embassyPicker.kind.actor") : filter.category === "policy" ? t("embassyPicker.kind.policy") : t("embassyPicker.kind.card");
  const limit = filter.maxAtk !== undefined ? tf("embassyPicker.limit", { n: String(filter.maxAtk) }) : "";
  const where = to === "field" ? t("embassyPicker.where.field") : t("embassyPicker.where.hand");
  const key = choice.owner === you ? "embassyPicker.describe.yours" : "embassyPicker.describe.theirs";
  return tf(key, { kind, limit, embassy: flavor().embassyWord, where });
}

/** The picker overlay, or null when no pick is pending. */
export function renderEmbassyPicker(state: ClientState, rerender: () => void): HTMLElement | null {
  const pending = state.embassyPick;
  if (!pending || !state.duel || !state.you) return null;
  const { choice, cardId, send } = pending;
  const archive = state.duel.duelists[choice.owner].archive;
  const cancel = () => {
    state.embassyPick = null;
    state.interaction = { mode: "idle" };
    rerender();
  };
  const pick = (index: number) => {
    state.embassyPick = null;
    send(index);
    rerender();
  };

  // Newest first, like the Embassy viewer.
  const options = [...choice.indices].reverse();
  return el("div", { className: "viewer-backdrop", onclick: cancel }, [
    el(
      "div",
      {
        className: "viewer viewer--picker",
        role: "dialog",
        ariaLabel: tf("embassyPicker.chooseTitle", { name: localizedCardName(cardId, CARDS[cardId].name) }),
        onclick: (event: MouseEvent) => event.stopPropagation(),
      },
      [
        el("div", { className: "viewer-header" }, [
          el("h2", {}, [localizedCardName(cardId, CARDS[cardId].name)]),
          el("span", { className: "viewer-count" }, [describeWhat(choice, state.you)]),
          el("button", { className: "tutorial-close", title: t("common.cancel"), onclick: cancel }, ["×"]),
        ]),
        el(
          "div",
          { className: "viewer-grid" },
          options.map((index) =>
            el(
              "button",
              {
                className: "viewer-card viewer-card--pickable",
                title: tf("embassyPicker.choose", { name: localizedCardName(archive[index], CARDS[archive[index]].name) }),
                onclick: () => pick(index),
              },
              [renderCardFace(archive[index])],
            ),
          ),
        ),
      ],
    ),
  ]);
}
