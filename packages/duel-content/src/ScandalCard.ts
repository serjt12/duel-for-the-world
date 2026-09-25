import type { ScandalCardId } from "./CardId";
import type { Edition } from "./Edition";
import type { ScandalTrigger } from "./Effects";

// "Continuous" Scandals are a parked v2 idea -- v1 only has one-shot
// reactive Scandals, so this union has a single member for now.
export type ScandalKind = "normal";

export interface ScandalCardDefinition {
  id: ScandalCardId;
  category: "scandal";
  edition: Edition;
  name: string;
  kind: ScandalKind;
  // Set face-down; fires (and is spent) the first time its event happens.
  trigger: ScandalTrigger;
  flavorText: string;
}
