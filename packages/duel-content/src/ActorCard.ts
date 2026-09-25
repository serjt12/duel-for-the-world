import type { ActorCardId } from "./CardId";
import type { Edition } from "./Edition";
import type { InstantEffect, Passive } from "./Effects";

// Four flavor archetypes (militant/enforcer/orator/operator), shown on
// the card's tag line. They don't affect the rules yet; they may become a
// rules hook later (e.g. role-specific Policy/Scandal synergies).
export type ActorRole = "militant" | "enforcer" | "orator" | "operator";

// Grassroots deploys freely (one Normal Deploy per turn, no cost beyond
// that). Establishment requires tributing 1 Actor you control -- a
// simplified two-tier stand-in for a Level/Rank scale. A Leader also
// costs a tribute, and there can be only one Leader in office: you can't
// deploy one while you control another.
export type ActorTier = "grassroots" | "establishment" | "leader";

// How many copies go in an edition's default deck (World Edition).
export type Rarity = "common" | "uncommon";

export interface ActorCardDefinition {
  id: ActorCardId;
  category: "actor";
  edition: Edition;
  rarity?: Rarity;
  name: string;
  role: ActorRole;
  tier: ActorTier;
  atk: number;
  def: number;
  flavorText: string;
  // Resolves when the Actor is deployed face-up (either stance). Setting
  // it face-down doesn't trigger it. Must not use targeted effects.
  onDeploy?: InstantEffect[];
  // Resolves when the Actor turns face-up from face-down: by changing
  // stance, or by being attacked (after the battle, even if it was
  // destroyed -- like a Yu-Gi-Oh flip effect). Must not use targeted
  // effects.
  onFlip?: InstantEffect[];
  // Resolves at the start of each of its controller's turns (after the
  // draw) while it's face-up on the field.
  onTurnStart?: InstantEffect[];
  // Resolves when it leaves the field for the Embassy, for any reason.
  onSentToEmbassy?: InstantEffect[];
  // Always-on abilities while face-up (see Passive).
  passives?: Passive[];
}
