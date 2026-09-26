import type { PlayerAction } from "@project-palacio/duel-server";
import type { ClientState } from "../state/ClientState";
import { el } from "../ui/dom";
import { isPhoneLayout } from "../ui/stage";
import { fieldInstance, GUIDE_STEPS, GUIDE_THEM } from "./script";
import type { GuideStep, GuideTarget } from "./script";

// The coach: the tip box of the guided first duel, the glow on whatever
// the tip is about, and the gate that keeps the player on the script.

const DONE_KEY = "palacio.guideDone";

/** Whether the player has finished the tutorial before (best effort). */
export function isGuideDone(): boolean {
  try {
    return window.localStorage.getItem(DONE_KEY) === "1";
  } catch {
    return false;
  }
}

function markGuideDone(): void {
  try {
    window.localStorage.setItem(DONE_KEY, "1");
  } catch {
    // ignore
  }
}

function currentStep(state: ClientState): GuideStep | null {
  return state.guide ? (GUIDE_STEPS[state.guide.step] ?? null) : null;
}

/**
 * Moves past every tip the current state already satisfies (call after
 * each state update and after "Next").
 */
export function advanceGuide(state: ClientState): void {
  const guide = state.guide;
  const view = state.duel;
  if (!guide || !view) return;
  for (;;) {
    const step = GUIDE_STEPS[guide.step];
    if (!step || (step.kind !== "do" && step.kind !== "watch") || !step.done(view)) break;
    guide.step += 1;
    guide.blocked = 0;
  }
  if (GUIDE_STEPS[guide.step]?.kind === "end") markGuideDone();
}

/** Whether the tutorial lets this move through. Blocked moves shake the tip. */
export function guideAllows(state: ClientState, action: PlayerAction): boolean {
  const step = currentStep(state);
  if (!state.guide || !step || step.kind === "end" || !state.duel) return true;
  if (step.kind === "do" && step.allow(action, state.duel)) return true;
  state.guide.blocked += 1;
  return false;
}

export interface CoachActions {
  next(): void;
  playForReal(): void;
  toMenu(): void;
}

// The entrance and the shake play once (per tip, per blocked move), not on
// every re-render.
let shownBlocks = 0;
let shownStep = -1;

export function renderCoach(state: ClientState, actions: CoachActions): HTMLElement | null {
  const step = currentStep(state);
  const duel = state.duel;
  if (!state.guide || !step || !duel || state.screen !== "board") {
    shownStep = -1;
    return null;
  }
  // The results screen has the stage while it's up.
  if (duel.winnerId !== null && !state.finaleDismissed) return null;

  const { blocked } = state.guide;
  const shake = blocked > shownBlocks;
  shownBlocks = blocked;
  const entering = state.guide.step !== shownStep;
  shownStep = state.guide.step;

  const total = GUIDE_STEPS.length;
  const buttons: HTMLElement[] = [];
  if (step.kind === "next") {
    buttons.push(el("button", { className: "primary", onclick: () => actions.next() }, [step.button ?? "Next"]));
  } else if (step.kind === "end") {
    buttons.push(
      el("button", { onclick: () => actions.toMenu() }, ["Main menu"]),
      el("button", { className: "primary", onclick: () => actions.playForReal() }, ["Play vs Computer"]),
    );
  }

  const nudge =
    blocked === 0
      ? null
      : step.kind === "next"
        ? `First tap "${step.button ?? "Next"}".`
        : step.kind === "watch"
          ? "Wait for the computer to finish."
          : "Not that one yet: follow the glowing cards.";

  const where = step.where ?? "low";
  const box = el(
    "div",
    {
      className: [
        "coach",
        isPhoneLayout() ? `coach--stage coach--${where}` : "coach--fixed",
        step.kind === "end" ? "coach--end" : "",
        shake ? "coach--shake" : entering ? "coach--enter" : "",
      ]
        .filter(Boolean)
        .join(" "),
      role: "status",
      ariaLive: "polite",
    },
    [
      el("div", { className: "coach-head" }, [
        el("span", { className: "coach-count" }, [step.kind === "end" ? "Tutorial" : `Tutorial · ${state.guide.step + 1}/${total - 1}`]),
        step.kind === "watch" ? el("span", { className: "coach-dots", ariaHidden: "true" }, ["● ● ●"]) : null,
      ]),
      el("strong", { className: "coach-title" }, [step.title]),
      el("p", { className: "coach-text" }, [step.text]),
      nudge ? el("p", { className: "coach-nudge" }, [nudge]) : null,
      buttons.length > 0 ? el("div", { className: "coach-actions" }, buttons) : null,
    ],
  );
  return box;
}

/** Puts the tip on screen: inside the phone stage (so it scales with it), or fixed. */
export function mountCoach(appRoot: HTMLElement, box: HTMLElement | null): void {
  if (!box) return;
  const stage = appRoot.querySelector<HTMLElement>(".board--phone");
  (stage ?? appRoot).append(box);
}

function elementsFor(target: GuideTarget, state: ClientState, root: HTMLElement): Element[] {
  const view = state.duel;
  if (!view) return [];
  const all = (selector: string) => [...root.querySelectorAll(selector)];
  switch (target.kind) {
    case "hand":
      return all(`.hand-slot[data-card-id="${target.cardId}"] > .card`).slice(0, 1);
    case "field": {
      const id = fieldInstance(view, target.side, target.cardId);
      const side = target.side === "you" ? ".side--yours" : ".side--opponent";
      return id === null ? [] : all(`${side} [data-instance-id="${id}"]`);
    }
    case "their-set": {
      const them = view.duelists[GUIDE_THEM];
      const ids = [...them.setScandals.map((s) => s.instanceId), ...them.backroomPolicies.filter((p) => p.faceDown).map((p) => p.instanceId)];
      return ids.flatMap((id) => all(`.side--opponent [data-instance-id="${id}"]`));
    }
    case "menu":
      return all(".hand-menu button, .zone-menu button").filter((button) => button.textContent?.startsWith(target.label));
    case "advance":
      return all(".advance-button");
    case "mandate":
      return all(`.duelist-strip--${target.side === "you" ? "you" : "opponent"} .mandate`);
    case "embassy":
      return all(target.side === "you" ? ".side--yours .pile-cell.r1 > *" : ".side--opponent .pile-cell.r2 > *");
    case "poll":
      return all(".poll");
    case "election":
      return all(".election-chip");
  }
}

/** Makes whatever the current tip is about glow (call after each render). */
export function applyCoachHighlights(state: ClientState, root: HTMLElement): void {
  const step = currentStep(state);
  if (!step?.targets || state.screen !== "board") return;
  for (const target of step.targets) {
    for (const element of elementsFor(target, state, root)) element.classList.add("coach-target");
  }
}
