import { CARDS } from "@project-palacio/duel-content";
import type { CardId } from "@project-palacio/duel-content";
import type { DuelEvent, DuelistId } from "@project-palacio/duel-engine";
import type { PublicDuelState } from "@project-palacio/duel-server";
import { renderCardFace } from "./cardView";
import { el } from "./dom";
import { flavor } from "./flavor";

// Field effects: when a card is hit and leaves the field, it doesn't just
// vanish -- it shakes (with a comic-style burst saying why), then flies in
// an arc into its owner's Embajada pile. Surviving fighters jolt, and
// Mandate changes float up from the player's bar.
//
// The board is rebuilt from scratch on every render, so a departing card
// has to be captured BEFORE the render that removes it:
//
//   const play = prepareFieldFx(oldDuel, newDuel, lastSeenSeq); // old DOM
//   ...render the new state...
//   play();                                                      // new DOM
//
// The clones live in a fixed overlay outside #app, so later re-renders
// can't cut them short. Nothing here affects the game; it only reads the
// public state and the duel log. Turned off entirely for reduced motion.

type Why = "battle" | "scandal" | "effect" | "tribute" | "spent-scandal" | "spent-policy" | "unknown";

interface FieldCardInfo {
  owner: DuelistId;
  cardId: CardId | null;
  kind: "actor" | "backroom";
}

interface Departure {
  owner: DuelistId;
  cardId: CardId | null;
  kind: "actor" | "backroom";
  why: Why;
  slotRect: DOMRect;
  slotSize: { width: number; height: number };
  wrapper: HTMLElement;
  // A face-down card whose identity the log revealed as it left.
  reveal: boolean;
  sideways: boolean;
}

// The burst words come from the edition (flavor.ts): BAM! / ¡ZAS!...
function burstFor(why: Why): string | undefined {
  const bursts: Partial<Record<Why, string>> = flavor().bursts;
  return bursts[why];
}

// Scale of a card inside the pile vs inside a zone (keep in sync with
// .pile-card / .slot-card in style.css).
const PILE_CARD_SCALE = 0.52;
const ZONE_CARD_SCALE = { actor: 0.72, backroom: 0.5 } as const;

const HIT_MS = 380;
const FLY_MS = 650;
const EQUIP_STAGGER_MS = 120;

// Cards still in the air, per Embajada: that pile keeps its new top card
// hidden until they land (see renderEmbassyPile).
const inFlight = new Map<DuelistId, number>();

export function isEmbassyAwaiting(owner: DuelistId): boolean {
  return (inFlight.get(owner) ?? 0) > 0;
}

function reducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function fieldCards(duel: PublicDuelState): Map<number, FieldCardInfo> {
  const cards = new Map<number, FieldCardInfo>();
  for (const view of Object.values(duel.duelists)) {
    for (const actor of view.field) {
      cards.set(actor.instanceId, { owner: view.id, cardId: actor.cardId, kind: "actor" });
    }
    for (const card of [...view.setScandals, ...view.backroomPolicies]) {
      cards.set(card.instanceId, { owner: view.id, cardId: card.cardId, kind: "backroom" });
    }
  }
  return cards;
}

function fitsKind(cardId: CardId, kind: "actor" | "backroom"): boolean {
  return (CARDS[cardId].category === "actor") === (kind === "actor");
}

// Strip classes that would replay entrance/turn animations on the clone.
function quietClone(wrapper: HTMLElement): HTMLElement {
  const clone = wrapper.cloneNode(true) as HTMLElement;
  clone.classList.remove("slot-card--turn-to-sideways", "slot-card--turn-to-upright");
  for (const node of [clone, ...Array.from(clone.querySelectorAll<HTMLElement>("*"))]) {
    node.classList.remove("card-enter", "card-draw", "clickable", "selectable", "draggable");
  }
  return clone;
}

function layer(): HTMLElement {
  let found = document.querySelector<HTMLElement>(".fx-layer");
  if (!found) {
    found = el("div", { className: "fx-layer" });
    document.body.append(found);
  }
  return found;
}

function center(rect: DOMRect): { x: number; y: number } {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/**
 * Call with the state about to be shown, BEFORE rendering it (the old
 * board must still be on screen). Returns the function to call right
 * after rendering, which plays the effects.
 */
export function prepareFieldFx(
  prev: PublicDuelState | null,
  next: PublicDuelState,
  lastSeenSeq: number | null,
): () => void {
  const noop = () => {};
  if (!prev || lastSeenSeq === null || typeof document === "undefined" || reducedMotion()) {
    return noop;
  }
  const fresh: DuelEvent[] = (next.log ?? []).filter((event) => event.seq > lastSeenSeq);
  if (fresh.length === 0) {
    return noop;
  }

  // Why each card left, from the log -- specific reasons first.
  const reasons: Array<{ owner: DuelistId; cardId: CardId; why: Why; used: boolean }> = [];
  for (const event of fresh) {
    if (event.kind === "sent-to-embassy") {
      reasons.push({ owner: event.duelistId, cardId: event.cardId, why: event.reason, used: false });
    }
  }
  for (const event of fresh) {
    if (event.kind === "scandal-triggered") {
      reasons.push({ owner: event.duelistId, cardId: event.cardId, why: "spent-scandal", used: false });
    } else if (event.kind === "policy-activated") {
      reasons.push({ owner: event.duelistId, cardId: event.cardId, why: "spent-policy", used: false });
    }
  }

  const before = fieldCards(prev);
  const after = fieldCards(next);
  const departures: Departure[] = [];

  for (const [instanceId, info] of before) {
    if (after.has(instanceId)) continue;
    const card = document.querySelector<HTMLElement>(`[data-instance-id="${instanceId}"]`);
    const wrapper = card?.parentElement;
    const slot = wrapper?.parentElement;
    if (!card || !wrapper || !slot) continue;

    const match = reasons.find(
      (reason) =>
        !reason.used &&
        reason.owner === info.owner &&
        (info.cardId !== null ? reason.cardId === info.cardId : fitsKind(reason.cardId, info.kind)),
    );
    if (match) match.used = true;
    const cardId = info.cardId ?? match?.cardId ?? null;

    departures.push({
      owner: info.owner,
      cardId,
      kind: info.kind,
      why: match?.why ?? "unknown",
      slotRect: slot.getBoundingClientRect(),
      // On the phone stage the board is scaled: remember its natural size.
      slotSize: { width: slot.offsetWidth, height: slot.offsetHeight },
      wrapper: quietClone(wrapper),
      reveal: info.cardId === null && cardId !== null,
      sideways: wrapper.classList.contains("slot-card--sideways"),
    });
    // Hold the pile's new top card back until this one lands.
    inFlight.set(info.owner, (inFlight.get(info.owner) ?? 0) + 1);
  }

  // Fighters that survived a battle get a jolt; Mandate changes float up.
  const survivors: number[] = [];
  const mandate: Array<{ duelistId: DuelistId; amount: number }> = [];
  for (const event of fresh) {
    if (event.kind === "battle") {
      if (!event.attackerDestroyed) survivors.push(event.attackerInstanceId);
      if (event.target && !event.defenderDestroyed) survivors.push(event.target.instanceId);
      if (event.mandateDamage > 0) {
        mandate.push({ duelistId: event.duelistId === "duelist1" ? "duelist2" : "duelist1", amount: -event.mandateDamage });
      }
    } else if (event.kind === "mandate-changed") {
      mandate.push({ duelistId: event.duelistId, amount: event.amount });
    }
  }

  return () => {
    // An Actor and the equips that fall with it: the Actor first.
    let equipIndex = 0;
    for (const departure of departures) {
      const delay = departure.kind === "backroom" && departure.why !== "spent-scandal" && departure.why !== "spent-policy"
        ? EQUIP_STAGGER_MS * ++equipIndex
        : 0;
      playDeparture(departure, delay);
    }
    for (const instanceId of survivors) {
      jolt(document.querySelector<HTMLElement>(`[data-instance-id="${instanceId}"]`));
    }
    mandate.forEach((change, index) => floatMandate(change.duelistId, change.amount, 220 + index * 180));
  };
}

function landed(owner: DuelistId): void {
  const left = Math.max(0, (inFlight.get(owner) ?? 0) - 1);
  inFlight.set(owner, left);
  const pile = document.querySelector<HTMLElement>(`.pile--embassy[data-owner="${owner}"]`);
  if (!pile) return;
  if (left === 0) pile.classList.remove("pile--awaiting");
  pile.animate(
    [
      { transform: "scale(1)", boxShadow: "0 0 0 0 rgba(201, 162, 39, 0)" },
      { transform: "scale(1.08)", boxShadow: "0 0 0 6px rgba(201, 162, 39, 0.45)" },
      { transform: "scale(1)", boxShadow: "0 0 0 0 rgba(201, 162, 39, 0)" },
    ],
    { duration: 420, easing: "ease-out" },
  );
}

function playDeparture(departure: Departure, delay: number): void {
  const { slotRect } = departure;
  const holder = el("div", { className: "fx-card" });
  Object.assign(holder.style, {
    left: `${slotRect.left}px`,
    top: `${slotRect.top}px`,
    width: `${slotRect.width}px`,
    height: `${slotRect.height}px`,
  });

  // A face-down card revealed on its way out shows its face.
  if (departure.reveal && departure.cardId) {
    departure.wrapper.replaceChildren(renderCardFace(departure.cardId));
  }
  // The flying card is drawn at the board's natural size, scaled like the
  // board (1 on desktop; the stage scale on phones).
  const { width: naturalWidth, height: naturalHeight } = departure.slotSize;
  const boardScale = naturalWidth > 0 ? slotRect.width / naturalWidth : 1;
  const scaler = el("div", { className: "fx-scaler" });
  Object.assign(scaler.style, {
    width: `${naturalWidth}px`,
    height: `${naturalHeight}px`,
    transform: `scale(${boardScale})`,
  });
  scaler.append(departure.wrapper);
  holder.append(scaler);

  const hit = departure.why === "battle" || departure.why === "scandal" || departure.why === "effect" || departure.why === "spent-scandal";
  if (hit) holder.classList.add("fx-card--hit");
  if (departure.why === "tribute") holder.classList.add("fx-card--tribute");

  const burstText = departure.kind === "actor" || departure.why === "spent-scandal" ? burstFor(departure.why) : undefined;
  if (burstText) {
    scaler.append(el("div", { className: `fx-burst${departure.why === "spent-scandal" ? " fx-burst--scandal" : ""}` }, [burstText]));
  }

  // Keep the card safe from being stranded if anything goes wrong.
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    holder.remove();
    landed(departure.owner);
  };
  window.setTimeout(finish, delay + HIT_MS + FLY_MS + 800);

  window.setTimeout(() => {
    layer().append(holder);
    const burst = holder.querySelector<HTMLElement>(".fx-burst");
    burst?.animate(
      [
        { transform: "translate(-50%, -50%) rotate(-8deg) scale(0.2)", opacity: 0 },
        { transform: "translate(-50%, -50%) rotate(-8deg) scale(1.15)", opacity: 1, offset: 0.35 },
        { transform: "translate(-50%, -50%) rotate(-8deg) scale(1)", opacity: 1 },
      ],
      { duration: HIT_MS, easing: "ease-out", fill: "forwards" },
    );

    const shake = hit
      ? holder.animate(
          [
            { transform: "translate(0, 0)" },
            { transform: "translate(-7px, 2px) rotate(-2deg)" },
            { transform: "translate(6px, -2px) rotate(2deg)" },
            { transform: "translate(-4px, 1px) rotate(-1deg)" },
            { transform: "translate(3px, 0)" },
            { transform: "translate(0, 0)" },
          ],
          { duration: HIT_MS, easing: "ease-out" },
        )
      : holder.animate([{ opacity: 1 }, { opacity: 1 }], { duration: 160 });

    shake.finished
      .then(() => {
        burst?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: "forwards" });
        const pile = document.querySelector<HTMLElement>(`.pile--embassy[data-owner="${departure.owner}"]`);
        if (!pile) {
          return holder.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: "forwards" }).finished;
        }
        const from = center(slotRect);
        const to = center(pile.getBoundingClientRect());
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const scale = PILE_CARD_SCALE / ZONE_CARD_SCALE[departure.kind];
        // Sideways (Resistance) cards straighten up on the way.
        const turn = departure.sideways ? -90 : 0;
        const tilt = dx >= 0 ? 12 : -12;
        return holder.animate(
          [
            { transform: "translate(0, 0) scale(1) rotate(0deg)" },
            {
              transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 70}px) scale(${(1 + scale) / 2}) rotate(${turn / 2 + tilt}deg)`,
              offset: 0.5,
            },
            { transform: `translate(${dx}px, ${dy}px) scale(${scale}) rotate(${turn}deg)` },
          ],
          { duration: FLY_MS, easing: "cubic-bezier(0.45, 0, 0.3, 1)", fill: "forwards" },
        ).finished;
      })
      .catch(() => undefined)
      .finally(finish);
  }, delay);
}

// A quick shake and flash on a card that took a hit and survived.
function jolt(card: HTMLElement | null): void {
  card?.animate(
    [
      { transform: "translate(0, 0)", filter: "brightness(1)" },
      { transform: "translate(-5px, 0)", filter: "brightness(1.6)" },
      { transform: "translate(5px, 0)", filter: "brightness(1.3)" },
      { transform: "translate(-3px, 0)", filter: "brightness(1.1)" },
      { transform: "translate(0, 0)", filter: "brightness(1)" },
    ],
    { duration: 380, easing: "ease-out" },
  );
}

// "−7" / "+5" rising from a player's Mandate.
function floatMandate(duelistId: DuelistId, amount: number, delay: number): void {
  window.setTimeout(() => {
    const strip = document.querySelector<HTMLElement>(`.duelist-strip[data-duelist="${duelistId}"]`);
    const mandate = strip?.querySelector<HTMLElement>(".mandate");
    if (!strip || !mandate) return;
    const rect = mandate.getBoundingClientRect();
    const loss = amount < 0;
    const float = el("div", { className: `fx-float ${loss ? "fx-float--loss" : "fx-float--gain"}` }, [
      `${loss ? "−" : "+"}${Math.abs(amount)}`,
    ]);
    Object.assign(float.style, { left: `${rect.left + rect.width / 2}px`, top: `${rect.top}px` });
    layer().append(float);
    float
      .animate(
        [
          { transform: "translate(-50%, 0) scale(0.6)", opacity: 0 },
          { transform: "translate(-50%, -14px) scale(1.2)", opacity: 1, offset: 0.2 },
          { transform: "translate(-50%, -40px) scale(1)", opacity: 0 },
        ],
        { duration: 1300, easing: "ease-out", fill: "forwards" },
      )
      .finished.catch(() => undefined)
      .finally(() => float.remove());
    if (loss) {
      strip.animate(
        [
          { transform: "translate(0, 0)" },
          { transform: "translate(-4px, 0)" },
          { transform: "translate(4px, 0)" },
          { transform: "translate(0, 0)" },
        ],
        { duration: 300, easing: "ease-out" },
      );
    }
  }, delay);
}
