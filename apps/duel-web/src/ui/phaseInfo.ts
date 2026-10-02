import type { DuelPhase } from "@duel-for-the-world/duel-engine";
import { locale, t, tf } from "../i18n";
import { flavor } from "./flavor";

// Single source of truth for phase display text, shared between the phase
// banner (renderBoard.ts) and the tutorial panel (renderTutorial.ts) so
// the two never drift apart. A function (not a static Record) so it
// re-resolves live on a language switch, same as everything else here.
const PHASE_LABEL_KEYS: Record<DuelPhase, string> = {
  agenda: "phase.label.agenda",
  "campaign-1": "phase.label.campaign1",
  confrontation: "phase.label.confrontation",
  "campaign-2": "phase.label.campaign2",
  recess: "phase.label.recess",
};
export const PHASE_LABELS: Record<DuelPhase, string> = new Proxy({} as Record<DuelPhase, string>, {
  get: (_target, phase: string) => t(PHASE_LABEL_KEYS[phase as DuelPhase]),
});

export interface PhaseGuideEntry {
  label: string;
  summary: string;
  bullets: string[];
}

// Kept in the same order the engine actually advances through them
// (TurnSystem.ts's PHASE_ORDER), so the tutorial panel can just map over
// this and always match the real turn structure.
export const PHASE_ORDER: DuelPhase[] = [
  "agenda",
  "campaign-1",
  "confrontation",
  "campaign-2",
  "recess",
];

// A function, not a constant: the examples and names depend on the
// edition being played (flavor.ts).
export function phaseGuide(): Record<DuelPhase, PhaseGuideEntry> {
  const f = flavor();
  const world = f.edition === "world";
  return {
  agenda: {
    label: PHASE_LABELS.agenda,
    summary: t("phase.agenda.summary"),
    bullets: [t("phase.agenda.bullet1")],
  },
  "campaign-1": {
    label: PHASE_LABELS["campaign-1"],
    summary: t("phase.campaign1.summary"),
    bullets: [
      world ? t("phase.campaign1.bullet1.world") : t("phase.campaign1.bullet1.colombia"),
      t("phase.campaign1.bullet2"),
      world ? t("phase.campaign1.bullet3.world") : t("phase.campaign1.bullet3.colombia"),
      t("phase.campaign1.bullet4"),
      t("phase.campaign1.bullet5"),
      t("phase.campaign1.bullet6"),
    ],
  },
  confrontation: {
    label: PHASE_LABELS.confrontation,
    summary: t("phase.confrontation.summary"),
    bullets: [
      t("phase.confrontation.bullet1"),
      t("phase.confrontation.bullet2"),
      t("phase.confrontation.bullet3"),
      t("phase.confrontation.bullet4"),
      world ? tf("phase.confrontation.bullet5.world", { headlines: f.headlines }) : t("phase.confrontation.bullet5.colombia"),
    ],
  },
  "campaign-2": {
    label: PHASE_LABELS["campaign-2"],
    summary: t("phase.campaign2.summary"),
    bullets: [t("phase.campaign2.bullet1"), t("phase.campaign2.bullet2"), t("phase.campaign2.bullet3")],
  },
  recess: {
    label: PHASE_LABELS.recess,
    summary: t("phase.recess.summary"),
    bullets: [t("phase.recess.bullet1")],
  },
  };
}

export function generalGuide(): string[] {
  const f = flavor();
  const world = f.edition === "world";
  // English keeps the edition's own ternary here (World said "The Embassy"
  // regardless of UI language, historically); Spanish always uses the
  // live flavor noun, which is correct for both editions once World gets
  // its own Spanish flavor text (see ui/flavor.ts).
  const embassyLabel = world && locale() === "en" ? "The Embassy" : f.embassy;
  return [
  t("phase.general.zones"),
  t("phase.general.tapCard"),
  t("phase.general.longPress"),
  t("phase.general.policies"),
  t("phase.general.handOptions"),
  t("phase.general.attackDrag"),
  t("phase.general.winCondition"),
  t("phase.general.electionNight"),
  world ? t("phase.general.bonusVotes.world") : null,
  tf("phase.general.marginWins", { runoff: f.runoff, embassyThe: f.embassyThe }),
  tf("phase.general.embassyExplain", { embassy: embassyLabel }),
  world ? t("phase.general.embassyNotEnd.world") : t("phase.general.embassyNotEnd.colombia"),
  tf("phase.general.headlinesExplain", { headlines: f.headlines }),
  t("phase.general.stanceExplain"),
  world ? t("phase.general.tiers.world") : t("phase.general.tiers.colombia"),
  world ? t("phase.general.policyTypes.world") : t("phase.general.policyTypes.colombia"),
  world ? t("phase.general.scandalTiming.world") : t("phase.general.scandalTiming.colombia"),
  world ? t("phase.general.fieldGuideHint.world") : null,
  ].filter((line): line is string => line !== null);
}
