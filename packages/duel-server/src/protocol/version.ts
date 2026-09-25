/**
 * The wire-protocol version. **Bump this whenever the shape of any
 * ClientMessage, ServerMessage or PublicDuelState changes.**
 *
 * The server reports it when a player creates or joins a room, and the
 * web client refuses to play against a server whose version differs from
 * its own. That turns "the server process is older than the client code"
 * (e.g. the server was never restarted after an update) into a clear
 * message instead of silently broken cards.
 *
 * Deliberately its own tiny module with no imports, exposed as the
 * `@project-palacio/duel-server/protocol-version` subpath: the browser
 * client can import this one runtime value without pulling in server.ts
 * and its Node-only dependencies.
 *
 * History:
 *   1 - (implicit) before this handshake existed
 *   2 - field zones (Actor + Backroom), effective stats on field Actors
 *   3 - Policies in the Backroom: set-policy / activate-set-policy actions,
 *       backroomPolicies (Set face-down + face-up Equips) in the state
 *   4 - change-stance action; hasChangedStanceThisTurn on field Actors
 *   5 - card wave 2 (new card ids, hostile equips, targeted Policies) and
 *       the public duel event log in PublicDuelState.log
 *   6 - battle events carry the fighters' instance ids (hit effects)
 *   7 - Election Night: election/polls/rematchVotes in the state,
 *       election-held/runoff-called events, the rematch action
 *   8 - editions (World / Colombia): create-room.edition, state.edition;
 *       World Edition cards, new events, vote bonus in polls
 */
export const PROTOCOL_VERSION = 8;
