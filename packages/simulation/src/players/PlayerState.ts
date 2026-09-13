import type { CardId } from "@project-palacio/content";

export type PlayerId = "player1" | "player2";

export interface PlayerState {
  id: PlayerId;
  capital: number;
  mandato: number;
  capitalRegenElapsedMs: number;
  cardCooldowns: Record<CardId, number>;
}

export function createInitialCardCooldowns(): Record<CardId, number> {
  return {
    militant: 0,
    enforcer: 0,
    orator: 0,
    operator: 0,
  };
}