import type { ActorCardDefinition } from "./ActorCard";
import type { PolicyCardDefinition } from "./PolicyCard";
import type { ScandalCardDefinition } from "./ScandalCard";

export type CardDefinition =
  | ActorCardDefinition
  | PolicyCardDefinition
  | ScandalCardDefinition;
