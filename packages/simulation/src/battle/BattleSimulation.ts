import type { BattleCommand } from "../commands/BattleCommand";
import { STARTING_CAPITAL } from "../config/EconomyConfig";
import { SIMULATION_TICK_MS } from "../config/SimulationTime";
import { updateCapitalRegeneration } from "../systems/CapitalRegenerationSystem";
import type { BattleState } from "./BattleState";
import { processBattleCommand } from "../systems/CommandProcessingSystem";
import { updateCardCooldowns } from "../systems/CardCooldownSystem";
import { createInitialZones } from "../zones/createInitialZones";
import { updateZoneControl } from "../systems/ZoneControlSystem";
import { updateCombat } from "../systems/CombatSystem";
import { updateMandateGeneration } from "../systems/MandateSystem";

export class BattleSimulation {
  private readonly state: BattleState;
  private readonly pendingCommands: BattleCommand[] = [];

  constructor() {
    this.state = {
      tick: 0,
      elapsedMs: 0,
      phase: "normal",
      units: [],
      nextUnitId: 1,
      zones: createInitialZones(),
      players: {
        player1: {
          id: "player1",
          cardCooldowns: {
            militant: 0,
            enforcer: 0,
            orator: 0,
            operator: 0,
          },
          capital: STARTING_CAPITAL,
          mandato: 0,
          capitalRegenElapsedMs: 0,
        },
        player2: {
          id: "player2",
          cardCooldowns: {
            militant: 0,
            enforcer: 0,
            orator: 0,
            operator: 0,
          },
          capital: STARTING_CAPITAL,
          mandato: 0,
          capitalRegenElapsedMs: 0,
        },
      },
    };
  }

  submitCommand(command: BattleCommand): void {
    this.pendingCommands.push(command);
  }

  tick(): void {
    if (this.state.phase === "finished") {
      return;
    }

    this.state.tick += 1;
    this.state.elapsedMs += SIMULATION_TICK_MS;

    updateCardCooldowns(this.state.players.player1);
    updateCardCooldowns(this.state.players.player2);

    while (this.pendingCommands.length > 0) {
      const command = this.pendingCommands.shift();

      if (command) {
        processBattleCommand(this.state, command);
      }
    }


    updateCombat(this.state.units, SIMULATION_TICK_MS);

    updateCapitalRegeneration(this.state.players.player1);
    updateCapitalRegeneration(this.state.players.player2);

    for (const zone of Object.values(this.state.zones)) {
      updateZoneControl(
        zone,
        this.state.units,
        SIMULATION_TICK_MS,
      );
    }

    updateMandateGeneration(
      Object.values(this.state.zones),
      this.state.players,
      SIMULATION_TICK_MS,
    );
  }

  getPendingCommandCount(): number {
    return this.pendingCommands.length;
  }

  getState(): Readonly<BattleState> {
    return this.state;
  }
}

