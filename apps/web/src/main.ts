import Phaser from "phaser";
import {
  SIMULATION_TICK_MS,
  SIMULATION_TICKS_PER_SECOND,
} from "@project-palacio/simulation";

class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  create() {
    this.cameras.main.setBackgroundColor("#111827");

    this.add
      .text(400, 220, "PROJECT PALACIO", {
        fontFamily: "Arial",
        fontSize: "42px",
        color: "#ffffff",
      })
      .setOrigin(0.5);

    this.add
      .text(
        400,
        300,
        `Simulation: ${SIMULATION_TICKS_PER_SECOND} ticks/sec\nTick duration: ${SIMULATION_TICK_MS} ms`,
        {
          fontFamily: "Arial",
          fontSize: "22px",
          color: "#d1d5db",
          align: "center",
        },
      )
      .setOrigin(0.5);
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  width: 800,
  height: 500,
  parent: "app",
  scene: BootScene,
});
