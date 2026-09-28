import type {
  ActorCardId,
  Edition,
  PolicyCardId,
  ScandalCardId,
} from "@duel-for-the-world/duel-content";
import type {
  DeployOptions,
  PolicyActivationOptions,
} from "@duel-for-the-world/duel-engine";
import type { PlayerSlot } from "../rooms/DuelRoom";
import type { PublicDuelState } from "./PublicDuelState";

// The only things a client is ever allowed to ask for: every one of these
// maps to exactly one duel-engine call inside DuelRoom.applyAction. There
// is deliberately no client-side rules logic -- the server is the only
// place an action can succeed or fail.
export type PlayerAction =
  | { type: "advance-phase" }
  | { type: "deploy-actor"; actorCardId: ActorCardId; options: DeployOptions }
  | { type: "declare-attack"; attackerInstanceId: number; targetInstanceId?: number }
  | { type: "activate-policy"; policyCardId: PolicyCardId; options?: PolicyActivationOptions }
  | { type: "set-policy"; policyCardId: PolicyCardId; zone?: number }
  | { type: "activate-set-policy"; instanceId: number; options?: PolicyActivationOptions }
  | { type: "set-scandal"; scandalCardId: ScandalCardId; zone?: number }
  // options.embassyPick: for a flip effect that picks from an Embassy.
  | { type: "change-stance"; instanceId: number; options?: { embassyPick?: number } }
  // After the duel ends: ask for a rematch. When both players have asked,
  // a fresh duel starts in the same room.
  | { type: "rematch" };

export type ClientMessage =
  // `edition`: which set the room plays (default: the World Edition).
  | { type: "create-room"; edition?: Edition }
  | { type: "join-room"; roomCode: string }
  // Reclaims a slot after a dropped connection (a network blip, the app
  // backgrounded, a reload). `token` is the reconnectToken this same slot
  // was given when it first joined -- see room-created/joined-room.
  | { type: "rejoin"; roomCode: string; token: string }
  // No room code needed: wait to be paired with the next other player who
  // also asks for this edition. See match-found below, and
  // rooms/MatchmakingQueue.ts.
  | { type: "quick-match"; edition?: Edition }
  // Stop waiting (the player backed out, or picked something else) before
  // a match was found. A no-op if a match was already found or this
  // socket was never waiting.
  | { type: "cancel-quick-match" }
  | { type: "player-action"; action: PlayerAction };

export type ServerMessage =
  // protocolVersion: see protocol/version.ts -- lets a client detect a
  // server running different (e.g. not-restarted, older) code.
  // reconnectToken: hang onto this (e.g. sessionStorage) -- it's what lets
  // a dropped connection rejoin the same slot instead of losing the seat.
  | { type: "room-created"; roomCode: string; you: PlayerSlot; protocolVersion: number; reconnectToken: string }
  | { type: "joined-room"; roomCode: string; you: PlayerSlot; protocolVersion: number; reconnectToken: string }
  | { type: "rejoined-room"; roomCode: string; you: PlayerSlot; protocolVersion: number }
  | { type: "opponent-joined" }
  // The opponent's socket dropped, but their reconnect grace period hasn't
  // expired yet -- they may still come back.
  | { type: "opponent-disconnected" }
  | { type: "opponent-reconnected" }
  // The opponent's grace period ran out without them rejoining: the room
  // is being torn down.
  | { type: "opponent-left" }
  // Acknowledges a quick-match request: nobody else was waiting for this
  // edition yet, so this socket is now the one other players get paired
  // with.
  | { type: "quick-match-waiting" }
  // Paired with another quick-match request into a brand-new room. Same
  // fields as room-created/joined-room (and the same meaning), just sent
  // to both sides at once instead of one creating and one joining by code.
  | { type: "match-found"; roomCode: string; you: PlayerSlot; protocolVersion: number; reconnectToken: string }
  | { type: "state"; state: PublicDuelState }
  | { type: "action-rejected"; reason: string }
  | { type: "error"; reason: string };
