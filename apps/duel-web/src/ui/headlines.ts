import type { DuelEvent } from "@project-palacio/duel-engine";
import type { PublicDuelState } from "@project-palacio/duel-server";
import type { ClientState } from "../state/ClientState";
import { el } from "./dom";
import { describeEvent } from "./eventText";
import type { Headline } from "./eventText";
import { flavor } from "./flavor";

// "Titulares": the battle report. Every state update carries the recent
// duel log (see duel-engine's DuelEvent); the events this client hasn't
// shown yet pop up as a short toast over the middle of the board, and the
// whole log is one click away in a side panel. It exists so nothing
// happens silently -- e.g. a Scandal destroying your attacker.

// Your own routine plays aren't news to you on their own; their
// consequences are (and then the whole batch is shown, for context).
const ALWAYS_NEWS = new Set<DuelEvent["kind"]>([
  "turn-started",
  "election-held",
  "runoff-called",
  "battle",
  "scandal-triggered",
  "sent-to-embassy",
  "mandate-changed",
  "actor-effect",
  "cards-drawn",
  "returned-to-hand",
  "duel-won",
]);

const TOAST_BASE_MS = 5000;
const TOAST_PER_LINE_MS = 1200;
const TOAST_MAX_MS = 11000;
const TOAST_MAX_LINES = 6;

let toastTimer: ReturnType<typeof setTimeout> | null = null;

function isNews(event: DuelEvent, viewer: string): boolean {
  return event.duelistId !== viewer || ALWAYS_NEWS.has(event.kind);
}

/**
 * Call with every new state from the server (before rendering). Queues a
 * toast for events not seen yet and schedules it to disappear. The very
 * first state only records where the log is -- joining mid-duel doesn't
 * replay history as a toast.
 */
export function noteNewEvents(state: ClientState, duel: PublicDuelState, rerender: () => void): void {
  const log = duel.log ?? [];
  const lastSeq = log.length > 0 ? log[log.length - 1].seq : 0;

  if (state.lastSeenSeq === null || state.you === null) {
    state.lastSeenSeq = lastSeq;
    return;
  }

  const viewer = state.you;
  const fresh = log.filter((event) => event.seq > (state.lastSeenSeq as number));
  state.lastSeenSeq = Math.max(state.lastSeenSeq, lastSeq);
  // Nothing but your own routine plays: no toast. Anything newsworthy:
  // show the whole batch, so e.g. your attack line gives context to the
  // Scandal that answered it.
  if (!fresh.some((event) => isNews(event, viewer))) {
    return;
  }

  state.headlines = fresh.map((event) => describeEvent(event, viewer)).slice(-TOAST_MAX_LINES);

  if (toastTimer !== null) clearTimeout(toastTimer);
  const shownFor = Math.min(TOAST_MAX_MS, TOAST_BASE_MS + TOAST_PER_LINE_MS * (state.headlines.length - 1));
  toastTimer = setTimeout(() => {
    toastTimer = null;
    state.headlines = [];
    rerender();
  }, shownFor);
}

function headlineLine(headline: Headline): HTMLElement {
  return el("div", { className: `headline headline--${headline.tone}` }, [headline.text]);
}

/** The toast over the middle banner, or null when there's nothing new. */
export function renderHeadlineToast(state: ClientState): HTMLElement | null {
  if (state.headlines.length === 0) {
    return null;
  }
  return el("div", { className: "headline-toast", role: "status", ariaLive: "polite" }, [
    el("div", { className: "headline-toast-title" }, [flavor().headlines]),
    ...state.headlines.map(headlineLine),
  ]);
}

function toggleLog(state: ClientState, rerender: () => void): void {
  state.logOpen = !state.logOpen;
  // One side panel at a time.
  if (state.logOpen) state.tutorialOpen = false;
  rerender();
}

/** The "Titulares" tab and, when open, the full log panel (newest first). */
export function renderLogPanel(state: ClientState, rerender: () => void): HTMLElement[] {
  if (!state.duel || state.you === null) {
    return [];
  }
  const tab = el("button", { className: "log-tab", onclick: () => toggleLog(state, rerender) }, [
    state.logOpen ? `Hide ${flavor().headlines} ×` : flavor().headlines,
  ]);
  if (!state.logOpen) {
    return [tab];
  }

  const viewer = state.you;
  const lines = [...(state.duel.log ?? [])].reverse().map((event) => headlineLine(describeEvent(event, viewer)));

  const panel = el("aside", { className: "log-panel" }, [
    el("div", { className: "tutorial-header" }, [
      el("h2", {}, [flavor().headlines]),
      el("button", { className: "tutorial-close", onclick: () => toggleLog(state, rerender) }, ["×"]),
    ]),
    el("p", { className: "log-panel-hint" }, ["Everything that happened in the duel, newest first."]),
    el("div", { className: "log-lines" }, lines.length > 0 ? lines : [el("p", {}, ["Nothing yet."])]),
  ]);
  return [tab, panel];
}
