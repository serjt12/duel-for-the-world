export {
  ACTOR_ZONE_COUNT,
  BACKROOM_ZONE_COUNT,
  ELECTION_TURN,
  RUNOFF_DAMAGE_MULTIPLIER,
  RUNOFF_EXTRA_TURNS,
  RUNOFF_MARGIN,
  STARTING_HAND_SIZE,
  STARTING_MANDATE,
} from "./config/DuelConfig";
export { countVotes, holdElection } from "./systems/ElectionSystem";
export type { VoteCount } from "./systems/ElectionSystem";
export { firstFreeZone, isValidZone } from "./field/zones";
export { resolveInstantEffects } from "./effects/resolveInstantEffects";
export { archiveActor } from "./field/archiveActor";
export type { DuelEvent, DuelEventBody, EmbassyReason, WinReason } from "./events/DuelEvent";

export { createDuel } from "./duel/createDuel";
export type { DuelState } from "./duel/DuelState";
export type { DuelPhase } from "./duel/DuelPhase";

export type { DuelistId } from "./duelists/DuelistId";
export type { DuelistState } from "./duelists/DuelistState";

export type {
  ActorFacing,
  ActorStance,
  FieldActor,
} from "./field/FieldActor";
export type { FieldScandal } from "./field/FieldScandal";
export type { FieldPolicy } from "./field/FieldPolicy";
export { equipPoliciesOn, equipsOf, occupiedBackroomZones, pickBackroomZone } from "./field/backroom";
export { activePassives, cardHasPassive, hasPassive, passiveOf } from "./field/passives";
export { canRetrieve, eligibleEmbassyIndices } from "./effects/resolveInstantEffects";

export { advancePhase } from "./systems/TurnSystem";
export { deployActor } from "./systems/DeploySystem";
export type {
  DeployFailureReason,
  DeployOptions,
  DeployResult,
} from "./systems/DeploySystem";

export { declareAttack } from "./systems/BattleSystem";
export type {
  AttackFailureReason,
  AttackOutcome,
  AttackResult,
} from "./systems/BattleSystem";

export { activatePolicy, activateSetPolicy, policyTarget, setPolicy } from "./systems/PolicySystem";
export type {
  PolicyActivationOptions,
  PolicyFailureReason,
  PolicyResult,
} from "./systems/PolicySystem";

export { changeStance } from "./systems/StanceSystem";
export type {
  ChangeStanceFailureReason,
  ChangeStanceResult,
} from "./systems/StanceSystem";

export { setScandal } from "./systems/ScandalSystem";
export type {
  SetScandalFailureReason,
  SetScandalResult,
} from "./systems/ScandalSystem";

export { getEffectiveStats } from "./systems/EffectiveStats";
export type { EffectiveStats } from "./systems/EffectiveStats";
