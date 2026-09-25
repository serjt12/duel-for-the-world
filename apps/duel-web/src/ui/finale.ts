import type { DuelEvent, DuelistId, VoteCount } from "@project-palacio/duel-engine";
import type { GameClient } from "../net/GameClient";
import type { ClientState } from "../state/ClientState";
import { el } from "./dom";
import { flavor } from "./flavor";

// Election Night's last page: when the duel ends, a newspaper front page
// (the edition's masthead: "THE DAILY SPIN" / "EL CHISME DIARIO")
// announces the result (copy per edition: see flavor.ts).
// For an election ending, the vote count plays out like a real
// preconteo: bulletin 1, 2, 3, the bars racing up. Winners get a shower
// of ballots. From here: ask for a rematch, or close it to look at the
// final board.
//
// It lives in its own root outside #app and is only rebuilt when the
// result changes, so ordinary re-renders (toasts, the opponent's rematch
// vote) don't restart its animation.

const BULLETINS = [0.34, 0.71, 1];
const BULLETIN_MS = 900;

let root: HTMLElement | null = null;
let shownKey: string | null = null;
const timers: number[] = [];

function reducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function clear(): void {
  timers.splice(0).forEach((id) => window.clearTimeout(id));
  root?.remove();
  root = null;
  shownKey = null;
}

function lastOf<K extends DuelEvent["kind"]>(log: DuelEvent[], kind: K): Extract<DuelEvent, { kind: K }> | null {
  for (let i = log.length - 1; i >= 0; i -= 1) {
    if (log[i].kind === kind) return log[i] as Extract<DuelEvent, { kind: K }>;
  }
  return null;
}

function voteRow(label: string, votes: VoteCount, mine: boolean): { row: HTMLElement; set: (share: number, max: number) => void } {
  const fill = el("div", { className: `count-fill${mine ? " count-fill--you" : ""}` });
  const number = el("span", { className: "count-number" }, ["0"]);
  const row = el("div", { className: "count-row" }, [
    el("span", { className: "count-label" }, [label]),
    el("div", { className: "count-bar" }, [fill]),
    number,
  ]);
  return {
    row,
    set: (share, max) => {
      const shown = Math.round(votes.total * share);
      number.textContent = String(shown);
      fill.style.width = `${max > 0 ? (shown / max) * 100 : 0}%`;
    },
  };
}

function build(state: ClientState, client: GameClient, rerender: () => void): HTMLElement {
  const duel = state.duel!;
  const you = state.you as DuelistId;
  const opponent: DuelistId = you === "duelist1" ? "duelist2" : "duelist1";
  const won = duel.winnerId === you;
  const reason = lastOf(duel.log, "duel-won")?.reason ?? "mandate";
  const words = flavor();
  const copy = words.finale[reason][won ? "won" : "lost"];
  const election = reason === "election" || reason === "runoff" || reason === "tiebreak" ? lastOf(duel.log, "election-held") : null;

  const children: Array<HTMLElement | null> = [
    el("div", { className: "paper-masthead" }, [words.masthead]),
    el("div", { className: "paper-edition" }, [
      words.edition === "colombia" ? `Edición Extraordinaria · Turno ${duel.turnNumber}` : `Special Edition · Turn ${duel.turnNumber}`,
    ]),
    el("h2", { className: `paper-headline${won ? "" : " paper-headline--lost"}` }, [copy.headline]),
    el("p", { className: "paper-deck" }, [copy.deck]),
  ];

  if (election) {
    const rows = [voteRow("You", election.votes[you], true), voteRow("Opponent", election.votes[opponent], false)];
    const max = Math.max(election.votes[you].total, election.votes[opponent].total, 1);
    const status = el("div", { className: "count-status" }, [words.bulletin(1, null)]);
    const bonus = (votes: VoteCount) => (votes.bonus > 0 ? ` + ${votes.bonus} bonus` : "");
    const breakdown = el("div", { className: "count-breakdown" }, [
      `You: ${election.votes[you].mandate} Mandate + ${election.votes[you].campaign} in Campaign${bonus(election.votes[you])} · ` +
        `Opponent: ${election.votes[opponent].mandate} + ${election.votes[opponent].campaign}${bonus(election.votes[opponent])}`,
    ]);
    breakdown.style.visibility = "hidden";
    children.push(
      el("div", { className: "paper-count" }, [
        el("div", { className: "count-title" }, [election.round === "runoff" ? words.countRunoffTitle : words.countTitle]),
        status,
        ...rows.map((r) => r.row),
        breakdown,
      ]),
    );
    const steps = reducedMotion() ? [1] : BULLETINS;
    steps.forEach((share, index) => {
      timers.push(
        window.setTimeout(() => {
          rows.forEach((r) => r.set(share, max));
          status.textContent = share === 1 ? words.finalBulletin : words.bulletin(index + 1, Math.round(share * 100));
          if (share === 1) breakdown.style.visibility = "visible";
        }, 250 + index * BULLETIN_MS),
      );
    });
  } else {
    const mandate = el("div", { className: "paper-count" }, [
      el("div", { className: "count-title" }, ["Final Mandate"]),
      el("div", { className: "count-breakdown" }, [
        `You ${duel.duelists[you].mandate} · Opponent ${duel.duelists[opponent].mandate}`,
      ]),
    ]);
    children.push(mandate);
  }

  // Rematch: both players must ask.
  const votes = duel.rematchVotes ?? [];
  const youAsked = votes.includes(you);
  const theyAsked = votes.includes(opponent);
  const note = youAsked
    ? "Waiting for your opponent to accept the rematch..."
    : theyAsked
      ? "Your opponent wants a rematch!"
      : null;
  children.push(
    note ? el("p", { className: `paper-note${theyAsked && !youAsked ? " paper-note--hot" : ""}` }, [note]) : null,
    el("div", { className: "paper-actions" }, [
      el(
        "button",
        {
          className: "primary",
          disabled: youAsked,
          onclick: () => client.sendAction({ type: "rematch" }),
        },
        [theyAsked && !youAsked ? `${words.rematch} Accept` : words.rematch],
      ),
      el(
        "button",
        {
          onclick: () => {
            state.finaleDismissed = true;
            rerender();
          },
        },
        ["View the board"],
      ),
    ]),
  );

  const paper = el("div", { className: `paper${won ? " paper--won" : " paper--lost"}`, role: "dialog", ariaLabel: copy.headline }, children);
  const overlay = el("div", { className: "finale" }, [paper]);

  if (won && !reducedMotion()) {
    const confetti = el("div", { className: "ballots" });
    for (let i = 0; i < 46; i += 1) {
      const ballot = el("span", { className: `ballot ballot--${i % 3}` });
      ballot.style.left = `${Math.random() * 100}%`;
      ballot.style.animationDelay = `${Math.random() * 1.6}s`;
      ballot.style.animationDuration = `${2.6 + Math.random() * 2}s`;
      confetti.append(ballot);
    }
    overlay.prepend(confetti);
  }
  return overlay;
}

/**
 * Call after every render. Shows the results screen when the duel is over
 * (unless closed), keeping the same element (and its running animation)
 * while only the rematch votes change.
 */
export function syncFinale(state: ClientState, client: GameClient, rerender: () => void): void {
  const duel = state.duel;
  if (!duel || !duel.winnerId || state.finaleDismissed || state.you === null || state.screen !== "board") {
    clear();
    return;
  }
  const wonEvent = lastOf(duel.log, "duel-won");
  const key = `${wonEvent?.seq ?? 0}|${duel.winnerId}|${(duel.rematchVotes ?? []).join(",")}`;
  if (key === shownKey) return;

  // Only the rematch votes changed: swap the page but skip the replay.
  const sameResult = shownKey !== null && shownKey.split("|").slice(0, 2).join("|") === key.split("|").slice(0, 2).join("|");
  const previousCount = sameResult ? root?.querySelector(".paper-count")?.cloneNode(true) : null;
  clear();
  root = build(state, client, rerender);
  if (previousCount) {
    // Keep the finished count instead of replaying it.
    timers.splice(0).forEach((id) => window.clearTimeout(id));
    root.querySelector(".paper-count")?.replaceWith(previousCount);
    root.querySelector(".ballots")?.remove();
  }
  document.body.append(root);
  shownKey = key;
}
