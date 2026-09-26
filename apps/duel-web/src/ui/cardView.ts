import { ACTOR_CARDS, CARDS, rulesText } from "@project-palacio/duel-content";
import type { ActorCardId, CardId, PolicyCardId } from "@project-palacio/duel-content";
import { CARD_ART, CARD_BACK_ART } from "./cardArt";
import { describeCard } from "./cardInfo";
import { el } from "./dom";

export interface CardViewOptions {
  clickable?: boolean;
  selected?: boolean;
  onClick?: () => void;
  // Extra status line under the card's own text, e.g. "Campaign · just
  // deployed" for a field Actor. Omitted in the hand.
  status?: string | null;
  // Visual variants.
  resistance?: boolean;
  // The controller's own face-down card: they can see it, but it's
  // dimmed with a ribbon as a reminder the opponent can't.
  hiddenFromOpponent?: boolean;
  // Play the "just landed" animation (see noteFieldInstance/noteHand).
  entering?: boolean;
  // A field Actor's current (effective) stats from the server, which may
  // differ from the printed card when Equips are attached.
  stats?: { atk: number; def: number };
  // Equip Policies attached to this Actor, shown as small chips.
  equips?: readonly PolicyCardId[];
}

function renderEquipChips(equips: readonly PolicyCardId[] | undefined): HTMLElement | null {
  if (!equips || equips.length === 0) {
    return null;
  }
  return el(
    "div",
    { className: "card-equips" },
    equips.map((policyId) =>
      el("div", { className: "card-equip-chip", title: `Equipped: ${CARDS[policyId].name}` }, [
        artImage(CARD_ART[policyId]),
      ]),
    ),
  );
}

function statsLine(cardId: CardId, fallback: string | null, stats: CardViewOptions["stats"]): HTMLElement | null {
  // Fall back to the printed stats if the server didn't send numbers
  // (never print "ATK undefined").
  if (
    !stats ||
    typeof stats.atk !== "number" ||
    typeof stats.def !== "number" ||
    CARDS[cardId].category !== "actor"
  ) {
    return fallback ? el("div", { className: "card-stats" }, [fallback]) : null;
  }
  const base = ACTOR_CARDS[cardId as ActorCardId];
  // Equips can push stats either way (Maletin up, Campaña de Desprestigio
  // down); a net change shows as ▲ / ▼ with the printed stats on hover.
  const delta = stats.atk - base.atk + (stats.def - base.def);
  const changed = stats.atk !== base.atk || stats.def !== base.def;
  const variant = !changed ? "" : delta >= 0 ? " card-stats--boosted" : " card-stats--lowered";
  return el(
    "div",
    {
      className: `card-stats${variant}`,
      title: changed ? `Printed: ATK ${base.atk} / DEF ${base.def}` : "",
    },
    [
      el("span", { className: "stat-label" }, ["ATK "]),
      String(stats.atk),
      " / ",
      el("span", { className: "stat-label" }, ["DEF "]),
      String(stats.def),
      !changed ? "" : delta >= 0 ? " ▲" : " ▼",
    ],
  );
}

function classNames(parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

function artImage(src: string): HTMLImageElement {
  // draggable=false stops the browser's native image-drag from hijacking
  // our pointer-based card dragging (dragDrop.ts).
  return el("img", { src, alt: "", draggable: false, className: "card-art-img" });
}

export function renderCardFace(cardId: CardId, options: CardViewOptions = {}): HTMLElement {
  const display = describeCard(cardId);
  // Generated from the same effect data the engine resolves, so the text
  // on the card is always exactly what the card does.
  const rules = rulesText(cardId);
  const card = el(
    "div",
    {
      className: classNames([
        "card",
        `card--${display.category}`,
        options.resistance && "card--resistance",
        options.hiddenFromOpponent && "card--hidden-from-opponent",
        options.clickable && "clickable",
        options.selected && "selected",
        options.entering && "card-enter",
      ]),
      title: [display.name, rules, `\u201C${display.flavorText}\u201D`].filter(Boolean).join("\n"),
      onclick: options.onClick ?? null,
    },
    [
      el("div", { className: "card-art" }, [
        artImage(CARD_ART[cardId]),
        options.resistance ? el("div", { className: "card-badge" }, ["\u{1F6E1}"]) : null,
        options.hiddenFromOpponent
          ? el("div", { className: "card-ribbon" }, ["face-down"])
          : null,
        renderEquipChips(options.equips),
      ]),
      el("div", { className: "card-body" }, [
        el("div", { className: `card-name${display.name.length > 18 ? " card-name--long" : ""}` }, [display.name]),
        statsLine(cardId, display.statsLine, options.stats),
        el("div", { className: "card-tag" }, [display.tagLine]),
        rules
          ? el("div", { className: `card-rules${rules.length > 50 || display.name.length > 20 ? " card-rules--long" : ""}` }, [
              rules,
            ])
          : null,
        options.status ? el("div", { className: "card-status" }, [options.status]) : null,
      ]),
    ],
  );
  // For the long-press card inspector (inspect.ts).
  card.dataset.cardId = cardId;
  return card;
}

export function renderCardBack(label: string, options: CardViewOptions = {}): HTMLElement {
  return el(
    "div",
    {
      className: classNames([
        "card",
        "card--back",
        options.clickable && "clickable",
        options.selected && "selected",
        options.entering && "card-enter",
      ]),
      title: label,
      onclick: options.onClick ?? null,
    },
    [
      artImage(CARD_BACK_ART),
      renderEquipChips(options.equips),
      el("div", { className: "card-back-label" }, [label]),
    ],
  );
}

// --- "Just appeared" tracking -------------------------------------------
//
// The app rebuilds the whole DOM on every render, so an element can't
// "remember" it has already animated in. Instead we remember which field
// instances and how many hand cards we've already shown, and only flag
// genuinely new ones. Module-level on purpose: it has to outlive any
// single render.

const seenFieldInstances = new Set<number>();
let lastHand: readonly CardId[] = [];

/** Forget everything seen so far -- a rematch reuses instance ids. */
export function resetCardMemory(): void {
  seenFieldInstances.clear();
  lastHand = [];
}

/** True the first time a given field instanceId is rendered. */
export function noteFieldInstance(instanceId: number): boolean {
  if (seenFieldInstances.has(instanceId)) {
    return false;
  }
  seenFieldInstances.add(instanceId);
  return true;
}

/**
 * Returns, for each card in `hand`, whether it was just drawn. Draws are
 * appended to the end of the hand by the engine, so any growth since the
 * last render shows up as new cards at the tail.
 */
export function noteHand(hand: readonly CardId[]): boolean[] {
  const newCount = Math.max(0, hand.length - lastHand.length);
  lastHand = [...hand];
  return hand.map((_, index) => index >= hand.length - newCount);
}
