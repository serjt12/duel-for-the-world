import { ACTOR_CARDS, CARDS, POLICY_CARDS } from "@duel-for-the-world/duel-content";
import type { ActorCardId, CardId, PolicyCardId, ScandalCardId } from "@duel-for-the-world/duel-content";
import {
  ACTOR_ZONE_COUNT,
  BACKROOM_ZONE_COUNT,
  policyTarget,
  RUNOFF_DAMAGE_MULTIPLIER,
  RUNOFF_MARGIN,
} from "@duel-for-the-world/duel-engine";
import type { ActorFacing, ActorStance, DeployOptions } from "@duel-for-the-world/duel-engine";
import type { ActorTarget } from "@duel-for-the-world/duel-content";
import type {
  PlayerSlot,
  PublicDuelistView,
  PublicFieldActor,
  PublicFieldPolicy,
  PublicFieldScandal,
} from "@duel-for-the-world/duel-server";
import type { ClientState, Interaction } from "../state/ClientState";
import type { GameClient } from "../net/GameClient";
import { noteFieldInstance, noteHand, renderCardBack, renderCardFace } from "./cardView";
import { el } from "./dom";
import { makeDraggable, makeDropTarget } from "./dragDrop";
import { renderDeckPile, renderEmbassyPile } from "./embassy";
import { effectsOfPlay, retrievalBlock, withEmbassyPick } from "./embassyPicker";
import { renderHeadlineToast } from "./headlines";
import { PHASE_LABELS } from "./phaseInfo";
import { GAME_NAME } from "./brand";
import { flavor } from "./flavor";
import { fitStage, isPhoneLayout, STAGE_HEIGHT } from "./stage";

// The scales cards are drawn at inside field zones (keep in sync with
// .slot-card in style.css). Dropped cards land at this size so they
// visibly settle into the zone.
const SLOT_CARD_SCALE = 0.72;
const BACKROOM_CARD_SCALE = 0.5;

// The three ways to put an Actor on the field, Yu-Gi-Oh style.
const ACTOR_PLAYS: Array<{ label: string; stance: ActorStance; facing: ActorFacing; primary?: boolean }> = [
  { label: "Deploy -- Campaign", stance: "campaign", facing: "face-up", primary: true },
  { label: "Deploy -- Resistance", stance: "resistance", facing: "face-up" },
  { label: "Set face-down", stance: "resistance", facing: "face-down" },
];

// Each field Actor's stance as of the last render, so a stance change can
// animate the card turning in its zone (once, on the render that first
// shows the new stance).
const lastStance = new Map<number, ActorStance>();

/** Forget remembered stances -- a rematch reuses instance ids. */
export function resetBoardMemory(): void {
  lastStance.clear();
}

function noteStanceTurn(actor: PublicFieldActor): StanceTurn {
  const previous = lastStance.get(actor.instanceId);
  lastStance.set(actor.instanceId, actor.stance);
  if (previous === undefined || previous === actor.stance) {
    return null;
  }
  return actor.stance === "resistance" ? "to-sideways" : "to-upright";
}

type StanceTurn = "to-sideways" | "to-upright" | null;

function otherSlot(slot: PlayerSlot): PlayerSlot {
  return slot === "duelist1" ? "duelist2" : "duelist1";
}

function setInteraction(state: ClientState, interaction: Interaction, rerender: () => void): void {
  state.interaction = interaction;
  rerender();
}

function range(count: number): number[] {
  return Array.from({ length: count }, (_, i) => i);
}

function byZone<T extends { zone: number }>(cards: readonly T[]): Map<number, T> {
  return new Map(cards.map((card) => [card.zone, card]));
}

function isActor(cardId: CardId): cardId is ActorCardId {
  return CARDS[cardId].category === "actor";
}

// Establishment and Leaders both need a tribute.
function isEstablishment(cardId: CardId): boolean {
  return isActor(cardId) && ACTOR_CARDS[cardId].tier !== "grassroots";
}

function isLeader(cardId: CardId | null): boolean {
  return cardId !== null && isActor(cardId) && ACTOR_CARDS[cardId].tier === "leader";
}

function isCampaignOnly(cardId: CardId): boolean {
  return isActor(cardId) && (ACTOR_CARDS[cardId].passives ?? []).some((passive) => passive.kind === "campaign-only");
}

// How an Actor can be deployed (a campaign-only one can't go into Resistance).
function playsFor(cardId: CardId): typeof ACTOR_PLAYS {
  return isCampaignOnly(cardId) ? ACTOR_PLAYS.filter((play) => play.stance === "campaign") : ACTOR_PLAYS;
}

function isPolicy(cardId: CardId): cardId is PolicyCardId {
  return CARDS[cardId].category === "policy";
}

/** Which Actors a Policy must be aimed at when activated, or null. */
function targetSideOf(cardId: PolicyCardId): ActorTarget | null {
  return policyTarget(POLICY_CARDS[cardId]);
}

function isEquip(cardId: CardId): boolean {
  return isPolicy(cardId) && POLICY_CARDS[cardId].kind === "equip";
}

function isScandal(cardId: CardId): cardId is ScandalCardId {
  return CARDS[cardId].category === "scandal";
}

function renderDuelistStrip(
  view: PublicDuelistView,
  isActive: boolean,
  label: string,
  side: "you" | "opponent",
  action: HTMLElement | null = null,
): HTMLElement {
  const strip = el("div", { className: `duelist-strip duelist-strip--${side}${isActive ? " active" : ""}` }, [
    el("div", { className: "duelist-info" }, [
      el("strong", {}, [label]),
      el("span", { className: "tag" }, [
        `Hand ${view.handCount} · Deck ${view.deckCount} · ${flavor().embassy} ${view.archive.length}`,
      ]),
    ]),
    el("div", { className: "duelist-right" }, [action, el("div", { className: "mandate" }, [`${view.mandate} Mandate`])]),
  ]);
  strip.dataset.duelist = view.id;
  return strip;
}

// --- Field cards ---------------------------------------------------------

interface ActorCardOptions {
  clickable?: boolean;
  onClick?: () => void;
  // The current turnNumber, to flag an Actor deployed this turn (it can't
  // attack yet). Only passed for your own Actors.
  currentTurn?: number;
}

// Field cards carry their instance id so effects (fieldFx.ts) can find
// them across re-renders.
function tagInstance<T extends HTMLElement>(card: T, instanceId: number): T {
  card.dataset.instanceId = String(instanceId);
  return card;
}

function renderActorCard(actor: PublicFieldActor, options: ActorCardOptions = {}): HTMLElement {
  return tagInstance(renderActorCardFace(actor, options), actor.instanceId);
}

function renderActorCardFace(actor: PublicFieldActor, options: ActorCardOptions): HTMLElement {
  const entering = noteFieldInstance(actor.instanceId);

  if (actor.cardId === null) {
    return renderCardBack("Face-down", { entering, equips: actor.equippedPolicyIds });
  }

  const status = [
    actor.stance === "campaign" ? "Campaign" : "Resistance",
    actor.hasAttackedThisTurn ? "attacked" : null,
    actor.hasChangedStanceThisTurn ? "stance changed" : null,
    options.currentTurn !== undefined && actor.turnDeployed === options.currentTurn ? "just deployed" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return renderCardFace(actor.cardId, {
    clickable: options.clickable,
    onClick: options.onClick,
    status,
    resistance: actor.stance === "resistance",
    hiddenFromOpponent: actor.facing === "face-down",
    entering,
    stats: { atk: actor.atk, def: actor.def },
    equips: actor.equippedPolicyIds,
  });
}

function renderScandalCard(scandal: PublicFieldScandal): HTMLElement {
  const entering = noteFieldInstance(scandal.instanceId);
  return tagInstance(
    scandal.cardId === null
      ? renderCardBack("Set", { entering })
      : renderCardFace(scandal.cardId, { hiddenFromOpponent: true, entering }),
    scandal.instanceId,
  );
}

/** A Policy in the Backroom: Set face-down, or a face-up Equip on an Actor. */
function renderPolicyCard(
  policy: PublicFieldPolicy,
  allActors: readonly PublicFieldActor[],
  you: PlayerSlot,
  options: { clickable?: boolean; onClick?: () => void } = {},
): HTMLElement {
  return tagInstance(renderPolicyCardFace(policy, allActors, you, options), policy.instanceId);
}

function renderPolicyCardFace(
  policy: PublicFieldPolicy,
  allActors: readonly PublicFieldActor[],
  you: PlayerSlot,
  options: { clickable?: boolean; onClick?: () => void },
): HTMLElement {
  const entering = noteFieldInstance(policy.instanceId);
  if (policy.cardId === null) {
    return renderCardBack("Set", { entering });
  }
  if (policy.faceDown) {
    return renderCardFace(policy.cardId, {
      hiddenFromOpponent: true,
      entering,
      clickable: options.clickable,
      onClick: options.onClick,
    });
  }
  const equipped = allActors.find((actor) => actor.instanceId === policy.equippedToInstanceId);
  const name = equipped?.cardId ? CARDS[equipped.cardId].name : "a face-down Actor";
  // A hostile equip sits in one player's Backroom but on the other
  // player's Actor: say whose.
  const whose =
    equipped && equipped.controllerId !== policy.controllerId
      ? equipped.controllerId === you
        ? "your "
        : "their "
      : "";
  return renderCardFace(policy.cardId, { entering, status: `Equipped to ${whose}${name}` });
}

/**
 * One field zone. Empty zones show a faint label; occupied ones hold the
 * card, drawn smaller -- and turned sideways for Resistance Stance, like
 * a defense-position card. `extra` (e.g. a choice menu) sits on top.
 */
function renderSlot(
  kind: "actor" | "backroom",
  card: HTMLElement | null,
  options: { sideways?: boolean; turn?: StanceTurn; placing?: boolean; extra?: HTMLElement | null } = {},
): HTMLElement {
  const classes = ["slot", `slot--${kind}`, card ? "" : "slot--empty", options.placing ? "slot--placing" : ""];
  const cardClasses = [
    "slot-card",
    options.sideways ? "slot-card--sideways" : "",
    options.turn ? `slot-card--turn-${options.turn}` : "",
  ];
  return el("div", { className: classes.filter(Boolean).join(" ") }, [
    card
      ? el("div", { className: cardClasses.filter(Boolean).join(" ") }, [card])
      : el("div", { className: "slot-label" }, [kind === "actor" ? "Actor" : "Backroom"]),
    options.extra ?? null,
  ]);
}

// Marks a zone as a valid pick during a "choose a target" step.
function makeSelectable(target: HTMLElement, onPick: () => void): void {
  target.classList.add("selectable");
  target.addEventListener("click", (event) => {
    event.stopPropagation();
    onPick();
  });
}

// What an attack on this Actor would do, shown on each target while you
// pick one (the same rules BattleSystem applies; a hidden Scandal can
// still change the story).
function renderAttackOdds(atk: number, target: PublicFieldActor, runoff: boolean): HTMLElement {
  const multiplier = runoff ? RUNOFF_DAMAGE_MULTIPLIER : 1;
  let kind: "win" | "lose" | "even" | "unknown";
  let text: string;
  if (target.cardId === null) {
    kind = "unknown";
    text = "Face-down: ?";
  } else if (target.stance === "campaign") {
    const diff = atk - target.atk;
    kind = diff > 0 ? "win" : diff < 0 ? "lose" : "even";
    text = diff > 0 ? `Wins · ${diff * multiplier} damage` : diff < 0 ? "You lose it" : "Both fall";
  } else {
    const diff = atk - target.def;
    kind = diff > 0 ? "win" : diff < 0 ? "lose" : "even";
    text = diff > 0 ? "Wins · no damage" : diff < 0 ? "You lose it" : "Nothing happens";
  }
  return el("div", { className: `attack-odds attack-odds--${kind}` }, [text]);
}

// --- Menus -----------------------------------------------------------------

function menuButton(
  label: string,
  onClick: () => void,
  options: { primary?: boolean; disabled?: boolean } = {},
): HTMLButtonElement {
  return el(
    "button",
    {
      className: options.primary ? "primary" : "",
      disabled: options.disabled ?? false,
      onclick: (event: MouseEvent) => {
        event.stopPropagation();
        onClick();
      },
    },
    [label],
  );
}

function renderMenu(
  className: "hand-menu" | "zone-menu",
  title: string,
  note: string | null,
  buttons: HTMLElement[],
  onCancel: () => void,
): HTMLElement {
  return el("div", { className, onclick: (event: MouseEvent) => event.stopPropagation() }, [
    el("div", { className: "menu-title" }, [title]),
    note ? el("div", { className: "menu-note" }, [note]) : null,
    ...buttons,
    menuButton("Cancel", onCancel),
  ]);
}

// --- Election Night: countdown and live poll ------------------------------

// How many turns are left before the votes are counted (counting this one).
function renderElectionChip(turnNumber: number, election: { turn: number; runoff: boolean }): HTMLElement {
  const left = Math.max(0, election.turn - turnNumber + 1);
  const text = election.runoff
    ? `${flavor().runoff} · damage ×${RUNOFF_DAMAGE_MULTIPLIER} · ${left === 1 ? "final turn" : `${left} turns`}`
    : left === 1
      ? "🗳 Votes counted this turn!"
      : `🗳 Election in ${left} turns`;
  return el(
    "span",
    {
      className: `election-chip${election.runoff ? " election-chip--runoff" : ""}${left <= 2 ? " election-chip--close" : ""}`,
      title:
        `When turn ${election.turn} ends, votes are counted: Mandate + ATK of your Campaign Actors + bonus votes. ` +
        `A lead of more than ${RUNOFF_MARGIN} wins; closer than that goes to a runoff.`,
    },
    [text],
  );
}

// The live poll: votes if the election were held right now.
function renderPoll(
  polls: Record<PlayerSlot, { mandate: number; campaign: number; bonus?: number; total: number }>,
  you: PlayerSlot,
  opponent: PlayerSlot,
): HTMLElement {
  const mine = polls[you];
  const theirs = polls[opponent];
  const total = Math.max(1, mine.total + theirs.total);
  const share = Math.round((mine.total / total) * 100);
  const fill = el("span", { className: "poll-fill" });
  fill.style.width = `${share}%`;
  return el(
    "span",
    {
      className: "poll",
      title:
        `Live poll -- votes if the election were held now (Mandate + ATK in Campaign + bonus votes).\n` +
        `You: ${mine.mandate} + ${mine.campaign} + ${mine.bonus ?? 0} = ${mine.total}\n` +
        `Opponent: ${theirs.mandate} + ${theirs.campaign} + ${theirs.bonus ?? 0} = ${theirs.total}`,
    },
    [
      el("span", { className: "poll-num poll-num--you" }, [String(mine.total)]),
      el("span", { className: "poll-bar" }, [fill]),
      el("span", { className: "poll-num poll-num--them" }, [String(theirs.total)]),
    ],
  );
}

// Leaving a duel takes two taps, so a stray one doesn't throw the game away.
let confirmingLeave = false;
function renderLeaveButton(state: ClientState, rerender: () => void, actions: { backToMenu(): void }): HTMLElement {
  const over = state.duel?.winnerId !== null && state.duel?.winnerId !== undefined;
  if (confirmingLeave && !over) {
    return el("span", { className: "leave-confirm" }, [
      "Leave this duel?",
      el("button", { className: "danger", onclick: () => { confirmingLeave = false; actions.backToMenu(); } }, ["Leave"]),
      el("button", { onclick: () => { confirmingLeave = false; rerender(); } }, ["Stay"]),
    ]);
  }
  return el(
    "button",
    {
      className: "leave-button",
      ariaLabel: "Back to the main menu",
      onclick: () => {
        if (over) {
          actions.backToMenu();
          return;
        }
        confirmingLeave = true;
        rerender();
      },
    },
    ["☰ Menu"],
  );
}

// --- Board -----------------------------------------------------------------

export function renderBoard(
  state: ClientState,
  client: GameClient,
  rerender: () => void,
  actions: { backToMenu(): void },
): HTMLElement {
  if (!state.duel) {
    return el("div", {}, [
      el("h1", { className: "brand-name" }, [GAME_NAME]),
      el("p", { className: "subtitle" }, [flavor().editionName]),
      el("div", { className: "lobby-panel" }, [
        state.roomCode ? el("p", {}, [`Room code: ${state.roomCode}`]) : null,
        el("p", { className: "subtitle" }, [state.mode === "online" ? "Waiting for an opponent to join..." : "Dealing the cards..."]),
        el("button", { className: "lobby-back", onclick: () => actions.backToMenu() }, ["Back to menu"]),
      ]),
    ]);
  }

  const duel = state.duel;
  const you = state.you as PlayerSlot;
  const opponent = otherSlot(you);
  const interaction = state.interaction;
  const isYourTurn = duel.activeDuelistId === you;
  const gameOver = duel.winnerId !== null;
  const canAct = !gameOver && isYourTurn && interaction.mode === "idle";
  const inCampaign = duel.phase === "campaign-1" || duel.phase === "campaign-2";
  const inConfrontation = duel.phase === "confrontation";

  const yourView = duel.duelists[you];
  const opponentView = duel.duelists[opponent];

  const canDeployNow = !yourView.hasNormalDeployedThisTurn;
  const canSetScandalNow = !yourView.hasSetScandalThisTurn;

  const idle = () => setInteraction(state, { mode: "idle" }, rerender);

  const attack = (attackerInstanceId: number, targetInstanceId?: number) => {
    client.sendAction({ type: "declare-attack", attackerInstanceId, targetInstanceId });
  };

  const canAttackWith = (actor: PublicFieldActor): boolean =>
    canAct &&
    inConfrontation &&
    actor.stance === "campaign" &&
    actor.turnDeployed !== duel.turnNumber &&
    !actor.hasAttackedThisTurn;

  // Change stance (Yu-Gi-Oh's "change battle position"): why it's not
  // allowed right now, or null. The server enforces the same rules.
  const stanceChangeBlock = (actor: PublicFieldActor): string | null =>
    actor.turnDeployed === duel.turnNumber
      ? "Deployed this turn -- it can change stance from your next turn."
      : actor.hasAttackedThisTurn
        ? "It already attacked this turn."
        : actor.hasChangedStanceThisTurn
          ? "It already changed stance this turn."
          : null;

  // A card dropped onto one of your zones (or an equip being aimed after
  // being dropped) is drawn sitting in that zone and hidden from the hand.
  const placing = interaction.mode === "placing" ? interaction : null;
  const choosingPolicy = interaction.mode === "choosing-policy-target" ? interaction : null;
  const choosingSide = choosingPolicy ? targetSideOf(choosingPolicy.cardId) : null;
  const placedEquip =
    interaction.mode === "choosing-policy-target" &&
    interaction.source.kind === "hand" &&
    interaction.source.zone !== undefined
      ? { zone: interaction.source.zone, cardId: interaction.cardId as CardId, handIndex: interaction.source.handIndex }
      : null;
  const pendingIn = (kind: "actor" | "backroom", zone: number): CardId | null => {
    if (placing && placing.zoneKind === kind && placing.zone === zone) return placing.cardId;
    if (placedEquip && kind === "backroom" && placedEquip.zone === zone) return placedEquip.cardId;
    return null;
  };
  const hiddenHandIndex = placing?.handIndex ?? placedEquip?.handIndex ?? null;

  // --- Playing a Policy that needs a target --------------------------------

  const targetsOn = (side: ActorTarget): readonly PublicFieldActor[] =>
    side === "your-actor" ? yourView.field : opponentView.field;

  const activateLabel = (cardId: PolicyCardId): string => {
    const side = targetSideOf(cardId);
    return side === null ? "Activate" : side === "your-actor" ? "Activate -- pick your Actor" : "Activate -- pick an opposing Actor";
  };

  // Why a Policy can't be activated right now for lack of targets, or null.
  const noTargetNote = (cardId: PolicyCardId): string | null => {
    const side = targetSideOf(cardId);
    // A retrieval Policy needs something in the Embassy to bring back.
    if (side === null) return retrievalBlock(duel, you, cardId);
    if (targetsOn(side).length > 0) return null;
    return side === "your-actor"
      ? "You have no Actors to target -- you can still Set it for later."
      : "Your opponent has no Actors to target -- you can still Set it for later.";
  };

  type PolicySource = { kind: "hand"; handIndex: number; zone?: number } | { kind: "set"; instanceId: number };

  // Activate: straight away if it needs no target, otherwise ask for one.
  const startPolicy = (cardId: PolicyCardId, source: PolicySource, onSent: () => void): void => {
    if (targetSideOf(cardId) !== null) {
      setInteraction(state, { mode: "choosing-policy-target", cardId, source }, rerender);
      return;
    }
    withEmbassyPick(state, rerender, cardId, effectsOfPlay(cardId, "activate"), (embassyPick) => {
      if (source.kind === "set") {
        client.sendAction({ type: "activate-set-policy", instanceId: source.instanceId, options: { embassyPick } });
      } else {
        client.sendAction({ type: "activate-policy", policyCardId: cardId, options: { zone: source.zone, embassyPick } });
      }
      onSent();
    });
  };

  // Deploy an Actor -- first asking which card to bring back, if its
  // on-deploy effect retrieves from an Embassy (only when face-up).
  const deploy = (cardId: ActorCardId, options: DeployOptions, after: () => void): void => {
    const effects = effectsOfPlay(cardId, options.facing === "face-up" ? "deploy-face-up" : "deploy-face-down");
    withEmbassyPick(state, rerender, cardId, effects, (embassyPick) => {
      client.sendAction({ type: "deploy-actor", actorCardId: cardId, options: { ...options, embassyPick } });
      after();
    });
  };

  // A Leader can only enter office by replacing the one already there.
  const leaderInOffice = yourView.field.find((actor) => isLeader(actor.cardId)) ?? null;

  const pickPolicyTarget = (target: PublicFieldActor): void => {
    if (!choosingPolicy) return;
    const { cardId, source } = choosingPolicy;
    if (source.kind === "set") {
      client.sendAction({
        type: "activate-set-policy",
        instanceId: source.instanceId,
        options: { targetInstanceId: target.instanceId },
      });
      idle();
      return;
    }
    client.sendAction({
      type: "activate-policy",
      policyCardId: cardId,
      options: { targetInstanceId: target.instanceId, zone: source.zone },
    });
    // Keep a card that was dropped into a zone drawn there until the
    // server's answer replaces it.
    if (source.zone !== undefined) {
      setInteraction(
        state,
        { mode: "placing", handIndex: source.handIndex, cardId, zoneKind: "backroom", zone: source.zone, committed: true },
        rerender,
      );
    } else {
      idle();
    }
  };

  // --- The choice menu for a card waiting in a zone ------------------------

  const renderPlacingMenu = (): HTMLElement | null => {
    if (!placing || placing.committed) return null;
    const { cardId, zone, handIndex } = placing;
    const commit = () => setInteraction(state, { ...placing, committed: true }, rerender);

    if (placing.zoneKind === "actor" && isActor(cardId)) {
      const tribute = yourView.field.find((actor) => actor.instanceId === placing.tributeInstanceId);
      // Warn that anything equipped to the tributed Actor leaves with it.
      const lost = tribute ? tribute.equippedPolicyIds.map((id) => CARDS[id].name) : [];
      const note = tribute
        ? `Tributes ${tribute.cardId ? CARDS[tribute.cardId].name : "your face-down Actor"}.` +
          (lost.length > 0 ? ` ${lost.join(" and ")} goes to ${flavor().embassyThe} with it.` : "")
        : null;
      return renderMenu(
        "zone-menu",
        CARDS[cardId].name,
        note,
        playsFor(cardId).map((play) =>
          menuButton(
            play.label,
            () => deploy(cardId, { stance: play.stance, facing: play.facing, zone, tributeInstanceId: placing.tributeInstanceId }, commit),
            { primary: play.primary },
          ),
        ),
        idle,
      );
    }

    if (isPolicy(cardId)) {
      const blocked = noTargetNote(cardId);
      return renderMenu(
        "zone-menu",
        CARDS[cardId].name,
        blocked,
        [
          menuButton(
            activateLabel(cardId),
            () => startPolicy(cardId, { kind: "hand", handIndex, zone }, commit),
            { primary: true, disabled: blocked !== null },
          ),
          menuButton("Set face-down", () => {
            client.sendAction({ type: "set-policy", policyCardId: cardId, zone });
            commit();
          }),
        ],
        idle,
      );
    }
    return null;
  };

  // --- Opponent's side (Backroom row on the outside, Actors facing you) ---

  const opponentActors = byZone(opponentView.field);
  const opponentScandals = byZone(opponentView.setScandals);
  const opponentPolicies = byZone(opponentView.backroomPolicies);
  const choosingAttack = interaction.mode === "choosing-attack-target" ? interaction : null;

  const opponentActorRow = el(
    "div",
    { className: "field-row" },
    range(ACTOR_ZONE_COUNT).map((zone) => {
      const actor = opponentActors.get(zone);
      const slot = renderSlot("actor", actor ? renderActorCard(actor) : null, {
        sideways: actor?.stance === "resistance",
        turn: actor ? noteStanceTurn(actor) : null,
      });
      if (actor) {
        if (canAct && inConfrontation) {
          makeDropTarget(slot, {
            accepts: (payload) => payload.kind === "field-actor",
            label: () => "Attack!",
            landScale: SLOT_CARD_SCALE,
            onDrop: (payload) => {
              if (payload.kind === "field-actor") attack(payload.instanceId, actor.instanceId);
            },
          });
        }
        if (choosingAttack) {
          makeSelectable(slot, () => {
            attack(choosingAttack.attackerInstanceId, actor.instanceId);
            idle();
          });
          const attacker = yourView.field.find((mine) => mine.instanceId === choosingAttack.attackerInstanceId);
          if (attacker?.cardId) slot.append(renderAttackOdds(attacker.atk, actor, duel.election.runoff));
        }
        if (choosingSide === "opponent-actor") {
          makeSelectable(slot, () => pickPolicyTarget(actor));
        }
      }
      return slot;
    }),
  );

  const openEmbassy = (owner: PlayerSlot) => () => {
    state.viewingEmbassy = owner;
    rerender();
  };
  // Piles sit beside the zones, mirrored like a real mat: yours on the
  // right, your opponent's on their right (your left).
  const pileCell = (pile: HTMLElement, side: "left" | "right", row: 1 | 2): HTMLElement =>
    el("div", { className: `pile-cell pile-cell--${side} r${row}` }, [pile]);
  opponentActorRow.classList.add("r2");

  const opponentSide = el("div", { className: "side side--opponent" }, [
    pileCell(renderDeckPile(opponentView), "left", 1),
    pileCell(renderEmbassyPile(opponentView, openEmbassy(opponent)), "left", 2),
    el(
      "div",
      { className: "field-row field-row--backroom r1" },
      range(BACKROOM_ZONE_COUNT).map((zone) => {
        const scandal = opponentScandals.get(zone);
        const policy = opponentPolicies.get(zone);
        const card = scandal
          ? renderScandalCard(scandal)
          : policy
            ? renderPolicyCard(policy, [...yourView.field, ...opponentView.field], you)
            : null;
        return renderSlot("backroom", card);
      }),
    ),
    opponentActorRow,
  ]);

  // Direct attacks: only legal when the opponent has no Actors to block.
  if (opponentView.field.length === 0) {
    if (canAct && inConfrontation) {
      makeDropTarget(opponentSide, {
        accepts: (payload) => payload.kind === "field-actor",
        label: () => "Direct attack!",
        onDrop: (payload) => {
          if (payload.kind === "field-actor") attack(payload.instanceId);
        },
      });
    }
    if (choosingAttack) {
      makeSelectable(opponentSide, () => {
        attack(choosingAttack.attackerInstanceId);
        idle();
      });
    }
  }

  // --- Your side (Actors facing the opponent, Backroom row behind) ---------

  const yourActors = byZone(yourView.field);
  const yourScandals = byZone(yourView.setScandals);
  const yourPolicies = byZone(yourView.backroomPolicies);
  const choosingTribute = interaction.mode === "choosing-tribute" ? interaction : null;
  const setMenuFor = interaction.mode === "set-menu" ? interaction.instanceId : null;
  const actorMenuFor = interaction.mode === "actor-menu" ? interaction.instanceId : null;

  const yourActorRow = el(
    "div",
    { className: "field-row" },
    range(ACTOR_ZONE_COUNT).map((zone) => {
      const actor = yourActors.get(zone);
      const pending = pendingIn("actor", zone);

      // A card waiting here for you to choose how to play it.
      if (pending) {
        return renderSlot("actor", renderCardFace(pending), { placing: true, extra: renderPlacingMenu() });
      }

      if (!actor) {
        const slot = renderSlot("actor", null);
        if (canAct && inCampaign) {
          makeDropTarget(slot, {
            accepts: (payload) =>
              payload.kind === "hand-card" &&
              canDeployNow &&
              isActor(payload.cardId) &&
              !isEstablishment(payload.cardId),
            label: () => "Deploy",
            landScale: SLOT_CARD_SCALE,
            onDrop: (payload) => {
              if (payload.kind !== "hand-card") return;
              setInteraction(
                state,
                {
                  mode: "placing",
                  handIndex: payload.handIndex,
                  cardId: payload.cardId,
                  zoneKind: "actor",
                  zone,
                  committed: false,
                },
                rerender,
              );
            },
          });
        }
        return slot;
      }

      const attackable = canAttackWith(actor);
      // In a Campaign Phase, clicking one of your Actors opens its menu.
      const opensMenu = canAct && inCampaign;
      const card = renderActorCard(actor, {
        clickable: attackable || opensMenu,
        currentTurn: duel.turnNumber,
        onClick: attackable
          ? () =>
              setInteraction(state, { mode: "choosing-attack-target", attackerInstanceId: actor.instanceId }, rerender)
          : opensMenu
            ? () => setInteraction(state, { mode: "actor-menu", instanceId: actor.instanceId }, rerender)
            : undefined,
      });
      if (attackable) {
        makeDraggable(card, { kind: "field-actor", instanceId: actor.instanceId });
      }

      let actorMenu: HTMLElement | null = null;
      if (actorMenuFor === actor.instanceId && actor.cardId !== null) {
        const blocked =
          actor.stance === "campaign" && isCampaignOnly(actor.cardId)
            ? "This Leader never retreats: it can't go into Resistance."
            : stanceChangeBlock(actor);
        // Campaign Phase 1 is followed by Confrontation; Campaign Phase 2 isn't.
        const attackWhen = duel.phase === "campaign-1" ? "this turn" : "from your next turn";
        const [label, hint] =
          actor.stance === "campaign"
            ? ["Switch to Resistance", `Turns sideways: defends with DEF ${actor.def} and can't attack.`]
            : actor.facing === "face-down"
              ? ["Flip face-up -- Campaign", `Reveals it to your opponent. It can attack ${attackWhen}.`]
              : ["Switch to Campaign", `Stands up: can attack with ATK ${actor.atk} ${attackWhen}.`];
        actorMenu = renderMenu(
          "zone-menu",
          CARDS[actor.cardId].name,
          blocked ?? hint,
          [
            menuButton(
              label,
              () => {
                const cardId = actor.cardId as ActorCardId;
                const effects = actor.facing === "face-down" ? effectsOfPlay(cardId, "flip") : undefined;
                withEmbassyPick(state, rerender, cardId, effects, (embassyPick) => {
                  client.sendAction({ type: "change-stance", instanceId: actor.instanceId, options: { embassyPick } });
                  idle();
                });
              },
              { primary: true, disabled: blocked !== null },
            ),
          ],
          idle,
        );
      }

      const slot = renderSlot("actor", card, {
        sideways: actor.stance === "resistance",
        turn: noteStanceTurn(actor),
        extra: actorMenu,
      });
      // In Confrontation, the Actors that can still attack stand out.
      if (attackable && !choosingAttack) slot.classList.add("slot--ready");
      if (choosingAttack?.attackerInstanceId === actor.instanceId) slot.classList.add("slot--attacking");

      if (canAct && inCampaign) {
        // An Establishment Actor dropped onto one of yours tributes it and
        // takes its zone -- after you choose how to deploy it.
        makeDropTarget(slot, {
          accepts: (payload) =>
            payload.kind === "hand-card" &&
            canDeployNow &&
            isEstablishment(payload.cardId) &&
            !(isLeader(payload.cardId) && leaderInOffice !== null && leaderInOffice !== actor),
          label: () => "Tribute",
          landScale: SLOT_CARD_SCALE,
          onDrop: (payload) => {
            if (payload.kind !== "hand-card") return;
            setInteraction(
              state,
              {
                mode: "placing",
                handIndex: payload.handIndex,
                cardId: payload.cardId,
                zoneKind: "actor",
                zone: actor.zone,
                tributeInstanceId: actor.instanceId,
                committed: false,
              },
              rerender,
            );
          },
        });
      }

      if (choosingTribute) {
        makeSelectable(slot, () =>
          deploy(
            choosingTribute.cardId,
            {
              stance: choosingTribute.stance,
              facing: choosingTribute.facing,
              tributeInstanceId: actor.instanceId,
              zone: actor.zone,
            },
            idle,
          ),
        );
      }

      if (choosingSide === "your-actor") {
        makeSelectable(slot, () => pickPolicyTarget(actor));
      }

      return slot;
    }),
  );

  const yourBackroomRow = el(
    "div",
    { className: "field-row field-row--backroom" },
    range(BACKROOM_ZONE_COUNT).map((zone) => {
      const pending = pendingIn("backroom", zone);
      if (pending) {
        return renderSlot("backroom", renderCardFace(pending), { placing: true, extra: renderPlacingMenu() });
      }

      const scandal = yourScandals.get(zone);
      if (scandal) {
        return renderSlot("backroom", renderScandalCard(scandal));
      }

      const policy = yourPolicies.get(zone);
      if (policy) {
        // Your own Set Policy can be activated during a Campaign Phase.
        const activatable = canAct && inCampaign && policy.faceDown && policy.cardId !== null;
        const card = renderPolicyCard(policy, [...yourView.field, ...opponentView.field], you, {
          clickable: activatable,
          onClick: activatable
            ? () => setInteraction(state, { mode: "set-menu", instanceId: policy.instanceId }, rerender)
            : undefined,
        });
        let menu: HTMLElement | null = null;
        if (setMenuFor === policy.instanceId && policy.cardId !== null && isPolicy(policy.cardId)) {
          const policyCardId = policy.cardId;
          const blocked = noTargetNote(policyCardId);
          menu = renderMenu(
            "zone-menu",
            CARDS[policyCardId].name,
            blocked,
            [
              menuButton(
                activateLabel(policyCardId),
                () => startPolicy(policyCardId, { kind: "set", instanceId: policy.instanceId }, idle),
                { primary: true, disabled: blocked !== null },
              ),
            ],
            idle,
          );
        }
        return renderSlot("backroom", card, { extra: menu });
      }

      const slot = renderSlot("backroom", null);
      if (canAct && inCampaign) {
        // Scandals can only ever be Set, so they go straight in. Policies
        // stop in the zone and ask: Activate, or Set face-down?
        makeDropTarget(slot, {
          accepts: (payload) =>
            payload.kind === "hand-card" && ((isScandal(payload.cardId) && canSetScandalNow) || isPolicy(payload.cardId)),
          label: (payload) => (payload.kind === "hand-card" && isScandal(payload.cardId) ? "Set face-down" : "Play here"),
          landScale: BACKROOM_CARD_SCALE,
          onDrop: (payload) => {
            if (payload.kind !== "hand-card") return;
            if (isScandal(payload.cardId)) {
              client.sendAction({ type: "set-scandal", scandalCardId: payload.cardId, zone });
              return;
            }
            setInteraction(
              state,
              {
                mode: "placing",
                handIndex: payload.handIndex,
                cardId: payload.cardId,
                zoneKind: "backroom",
                zone,
                committed: false,
              },
              rerender,
            );
          },
        });
      }
      return slot;
    }),
  );

  yourActorRow.classList.add("r1");
  yourBackroomRow.classList.add("r2");
  const yourSide = el("div", { className: "side side--yours" }, [
    yourActorRow,
    pileCell(renderEmbassyPile(yourView, openEmbassy(you)), "right", 1),
    yourBackroomRow,
    pileCell(renderDeckPile(yourView), "right", 2),
  ]);

  // --- Middle banner: phase, or what you're being asked to pick -----------

  const selectionPrompt = choosingTribute
    ? `Choose one of your Actors to tribute for ${CARDS[choosingTribute.cardId].name}.`
    : choosingPolicy
      ? choosingSide === "opponent-actor"
        ? `Choose an opposing Actor for ${CARDS[choosingPolicy.cardId].name}.`
        : `Choose one of your Actors for ${CARDS[choosingPolicy.cardId].name}.`
      : choosingAttack
        ? opponentView.field.length === 0
          ? "Click the opponent's side of the field to attack directly."
          : "Choose an opposing Actor to attack."
        : null;

  const middle = selectionPrompt
    ? el("div", { className: "selection-banner" }, [
        el("span", {}, [selectionPrompt]),
        el("button", { className: "danger", onclick: idle }, ["Cancel"]),
      ])
    : el("div", { className: "phase-banner" }, [
        renderElectionChip(duel.turnNumber, duel.election),
        el("span", { className: "phase-text" }, [
          `Turn ${duel.turnNumber} · ${PHASE_LABELS[duel.phase]} · ${isYourTurn ? "Your turn" : "Opponent's turn"}`,
        ]),
        renderPoll(duel.polls, you, opponent),
      ]);

  // --- Hand ----------------------------------------------------------------

  const hand = yourView.hand ?? [];
  const justDrawn = noteHand(hand);
  const menuIndex = interaction.mode === "hand-menu" ? interaction.handIndex : null;
  const aimingFromHand =
    interaction.mode === "choosing-policy-target" && interaction.source.kind === "hand" && interaction.source.zone === undefined
      ? interaction.source.handIndex
      : null;
  const playable = canAct && inCampaign;

  const renderHandMenu = (cardId: CardId, handIndex: number): HTMLElement => {
    const buttons: HTMLElement[] = [];
    let note: string | null = null;

    if (isActor(cardId)) {
      const establishment = isEstablishment(cardId);
      if (!canDeployNow) {
        note = "You already deployed an Actor this turn.";
      } else if (establishment && yourView.field.length === 0) {
        note = "Needs one of your Actors to tribute.";
      } else if (!establishment && yourView.field.length >= ACTOR_ZONE_COUNT) {
        note = "All your Actor zones are full.";
      }
      // Only one Leader in office: a new one must tribute the old one.
      const replacing = isLeader(cardId) && leaderInOffice !== null;
      for (const play of playsFor(cardId)) {
        buttons.push(
          menuButton(
            play.label,
            () => {
              if (replacing && leaderInOffice) {
                // No choice to make: the Leader in office is the tribute.
                deploy(cardId, { stance: play.stance, facing: play.facing, tributeInstanceId: leaderInOffice.instanceId, zone: leaderInOffice.zone }, idle);
              } else if (establishment) {
                setInteraction(state, { mode: "choosing-tribute", cardId, stance: play.stance, facing: play.facing }, rerender);
              } else {
                deploy(cardId, { stance: play.stance, facing: play.facing }, idle);
              }
            },
            { primary: play.primary, disabled: note !== null },
          ),
        );
      }
    } else if (isPolicy(cardId)) {
      const backroomFull = yourView.setScandals.length + yourView.backroomPolicies.length >= BACKROOM_ZONE_COUNT;
      const blocked = noTargetNote(cardId);
      note = blocked;
      buttons.push(
        menuButton(
          activateLabel(cardId),
          () => startPolicy(cardId, { kind: "hand", handIndex }, idle),
          // An Equip needs a free Backroom zone to stay in.
          { primary: true, disabled: blocked !== null || (isEquip(cardId) && backroomFull) },
        ),
        menuButton(
          "Set face-down",
          () => {
            client.sendAction({ type: "set-policy", policyCardId: cardId });
            idle();
          },
          { disabled: backroomFull },
        ),
      );
      if (backroomFull) note = "All your Backroom zones are full.";
    } else if (isScandal(cardId)) {
      if (!canSetScandalNow) {
        note = "You already Set a Scandal this turn.";
      } else if (yourView.setScandals.length + yourView.backroomPolicies.length >= BACKROOM_ZONE_COUNT) {
        note = "All your Backroom zones are full.";
      }
      buttons.push(
        menuButton(
          "Set face-down",
          () => {
            client.sendAction({ type: "set-scandal", scandalCardId: cardId });
            idle();
          },
          { primary: true, disabled: note !== null },
        ),
      );
    }

    if (note === null && isActor(cardId) && isLeader(cardId) && leaderInOffice?.cardId) {
      note = `Replaces ${CARDS[leaderInOffice.cardId].name} (only one Leader in office).`;
    }
    return renderMenu("hand-menu", CARDS[cardId].name, note, buttons, idle);
  };

  const handRow = el(
    "div",
    { className: "hand-row" },
    hand.map((cardId, index) => {
      if (index === hiddenHandIndex) {
        return null; // it's sitting in a zone right now
      }
      const card = renderCardFace(cardId, {
        clickable: playable,
        entering: justDrawn[index],
        onClick: playable ? () => setInteraction(state, { mode: "hand-menu", handIndex: index }, rerender) : undefined,
      });
      if (justDrawn[index]) {
        card.classList.add("card-draw");
      }
      if (playable) {
        makeDraggable(card, { kind: "hand-card", cardId, handIndex: index });
      }
      const open = menuIndex === index || aimingFromHand === index;
      const slot = el("div", { className: `hand-slot${open ? " hand-slot--open" : ""}` }, [
        card,
        menuIndex === index ? renderHandMenu(cardId, index) : null,
      ]);
      slot.dataset.cardId = cardId;
      return slot;
    }),
  );

  const handHint = canAct
    ? inCampaign
      ? "Drag a card onto a zone (then choose how to play it), or click it for its options."
      : inConfrontation
        ? "Drag one of your Campaign Actors onto an opposing Actor to attack (or click it)."
        : "Cards can be played during a Campaign Phase."
    : null;

  const winnerBanner = gameOver
    ? el("div", { className: "winner-banner" }, [
        duel.winnerId === you ? "You win the duel!" : "Your opponent wins the duel.",
        el(
          "button",
          {
            className: "primary",
            onclick: () => {
              state.finaleDismissed = false;
              rerender();
            },
          },
          ["Results & rematch"],
        ),
      ])
    : null;

  // Compact on purpose: the whole field plus your hand should fit on one
  // screen, so a card can be dragged from the hand to any zone without
  // scrolling.
  const advanceButton = canAct
    ? el("button", { className: "primary advance-button", onclick: () => client.sendAction({ type: "advance-phase" }) }, [
        "Advance Phase",
      ])
    : null;

  // An open menu closes when you click anywhere else.
  const menuOpen =
    interaction.mode === "hand-menu" ||
    interaction.mode === "set-menu" ||
    interaction.mode === "actor-menu" ||
    (interaction.mode === "placing" && !interaction.committed);

  // Phones (landscape): the whole board is one fixed-size stage scaled to
  // fit the screen (stage.ts), with the hand in its own column.
  const phone = isPhoneLayout();
  if (phone) {
    // Hand cards overlap in two columns so the whole hand fits the column.
    const rows = Math.ceil(hand.length / 2);
    const room = STAGE_HEIGHT - 37 - 182 - 12; // the hand's area (below its label) minus one full card
    const pitch = rows <= 1 ? 190 : Math.min(190, Math.floor(room / (rows - 1)));
    handRow.style.setProperty("--hand-pitch", `${pitch}px`);
  }

  const board = el("div", { className: `board${phone ? " board--phone" : ""}` }, [
    el("div", { className: "board-header" }, [
      renderLeaveButton(state, rerender, actions),
      el(
        "button",
        {
          className: "settings-button",
          ariaLabel: "Settings",
          title: "Settings",
          onclick: () => {
            state.settingsOpen = true;
            rerender();
          },
        },
        ["⚙"],
      ),
      el("h1", { className: "brand-name" }, [GAME_NAME]),
      el("span", { className: "edition-tag" }, [flavor().editionName]),
      el("span", { className: "status-line" }, [
        state.aiThinking && !gameOver
          ? "The computer is thinking..."
          : (state.statusLine ?? (state.roomCode ? `Room ${state.roomCode}` : "")),
      ]),
    ]),
    winnerBanner,
    renderDuelistStrip(opponentView, !isYourTurn, state.opponentName, "opponent"),
    opponentSide,
    // The Headlines toast floats over the middle banner (see headlines.ts).
    el("div", { className: "middle" }, [middle, renderHeadlineToast(state)]),
    yourSide,
    renderDuelistStrip(yourView, isYourTurn, "You", "you", advanceButton),
    el("div", { className: "section-label" }, [
      "Your Hand",
      handHint ? el("span", { className: "hand-hint" }, [handHint]) : null,
    ]),
    handRow,
    menuOpen ? el("div", { className: "board-menu-backdrop", onclick: idle }) : null,
  ]);
  if (phone) fitStage(board);
  return board;
}
