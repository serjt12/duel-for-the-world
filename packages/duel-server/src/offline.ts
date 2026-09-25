// Everything needed to run a duel entirely on the device (vs the
// computer), with no network: the same room, redaction and rules the
// online server uses. Browser-safe: nothing here touches Node or sockets.
export { DuelRoom, buildDefaultDeck } from "./rooms/DuelRoom";
export type { ActionResult, PlayerSlot } from "./rooms/DuelRoom";
export { redactStateFor } from "./protocol/redact";
export { AiPlayer, chooseAiAction } from "./ai/index";
export type { AiLevel } from "./ai/index";
