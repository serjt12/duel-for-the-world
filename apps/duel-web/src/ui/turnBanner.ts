import { el } from "./dom";

// A banner that sweeps across the screen when your turn starts, with how
// close the election is. Lives outside the board (which is rebuilt on
// every render) and removes itself.

let current: HTMLElement | null = null;

function reducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function showTurnBanner(title: string, subtitle: string, tone: "you" | "them" = "you"): void {
  current?.remove();
  const banner = el("div", { className: `turn-banner turn-banner--${tone}`, ariaLive: "polite" }, [
    el("div", { className: "turn-banner-title" }, [title]),
    el("div", { className: "turn-banner-sub" }, [subtitle]),
  ]);
  document.body.append(banner);
  current = banner;
  const still = reducedMotion();
  const animation = banner.animate(
    still
      ? [{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }]
      : [
          { transform: "translate(-50%, -50%) translateX(-60vw) skewX(-12deg)", opacity: 0 },
          { transform: "translate(-50%, -50%) translateX(0) skewX(-12deg)", opacity: 1, offset: 0.18 },
          { transform: "translate(-50%, -50%) translateX(0) skewX(-12deg)", opacity: 1, offset: 0.78 },
          { transform: "translate(-50%, -50%) translateX(60vw) skewX(-12deg)", opacity: 0 },
        ],
    { duration: tone === "you" ? 1500 : 1100, easing: "cubic-bezier(0.3, 0, 0.2, 1)", fill: "forwards" },
  );
  animation.finished
    .catch(() => undefined)
    .finally(() => {
      banner.remove();
      if (current === banner) current = null;
    });
}

/** The line under "Your turn": how close Election Night is. */
export function electionLine(turnNumber: number, election: { turn: number; runoff: boolean }): string {
  const left = Math.max(0, election.turn - turnNumber + 1);
  if (election.runoff) return left <= 1 ? "Runoff: the final turn!" : `Runoff · battle damage doubled`;
  if (left <= 1) return "The votes are counted this turn!";
  if (left === 2) return "Election Night after the next turn";
  return `Election in ${left} turns`;
}
