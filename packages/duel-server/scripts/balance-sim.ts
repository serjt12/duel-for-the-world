// Heuristic-bot balance simulation: two simple bots play thousands of
// duels straight against duel-engine (no server, no network).
//
//   pnpm --filter @duel-for-the-world/duel-server balance [edition] [games] [seed] [mode]
//
// edition: world (default) | colombia. mode: "default" plays the normal
// decks and reports first-player advantage, win reasons and Leader win
// rates; "random" builds each deck from a random half of the pool and
// reports every card's marginal strength (win rate with it in the deck
// minus without, in points) -- the number to keep within about +/-5.
// TWEAKS=file.json overrides card fields for a what-if run, e.g.
//   { "protester": { "atk": 5 } }
// The bots are deliberately simple (no bluffing, no reading of hidden
// cards), so treat the output as a guide for outliers, not gospel.
import { ACTOR_CARDS, CARDS, POLICY_CARDS, SCANDAL_CARDS, embassyChoiceIn } from "@duel-for-the-world/duel-content";
import type { ActorCardId, CardId, Edition, InstantEffect, PolicyCardId, ScandalCardId } from "@duel-for-the-world/duel-content";
import {
  activatePolicy,
  advancePhase,
  canRetrieve,
  changeStance,
  createDuel,
  declareAttack,
  deployActor,
  eligibleEmbassyIndices,
  getEffectiveStats,
  hasPassive,
  setScandal,
} from "@duel-for-the-world/duel-engine";
import type { DuelState, DuelistId, FieldActor } from "@duel-for-the-world/duel-engine";
import { buildDefaultDeck } from "../src/rooms/DuelRoom";

import { readFileSync } from "node:fs";
// TWEAKS=path.json: { "<card-id>": { ...fields to overwrite } } applied before play.
if (process.env.TWEAKS) {
  const tweaks = JSON.parse(readFileSync(process.env.TWEAKS, "utf8")) as Record<string, Record<string, unknown>>;
  for (const [id, fields] of Object.entries(tweaks)) {
    const card = CARDS[id as CardId] as unknown as Record<string, unknown>;
    if (!card) throw new Error("unknown card " + id);
    Object.assign(card, fields);
    for (const table of [ACTOR_CARDS, POLICY_CARDS, SCANDAL_CARDS] as unknown as Record<string, Record<string, unknown>>[]) {
      if (table[id] && table[id] !== card) Object.assign(table[id], fields);
    }
  }
}
const edition = (process.argv[2] ?? "world") as Edition;
const GAMES = Number(process.argv[3] ?? 4000);
let seed = Number(process.argv[4] ?? 7);
// mulberry32 (Math.imul keeps it exact; a float LCG collapses into a short cycle).
const rnd = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const other = (id: DuelistId): DuelistId => (id === "duelist1" ? "duelist2" : "duelist1");

// --- Card valuation -----------------------------------------------------------
function actorValue(id: ActorCardId): number {
  const c = ACTOR_CARDS[id];
  let v = c.atk + c.def * 0.6;
  if (c.tier === "leader") v += 4;
  if (c.onDeploy || c.onFlip || c.onTurnStart || c.onSentToEmbassy || c.passives) v += 1;
  return v;
}
function cardValue(id: CardId): number {
  const c = CARDS[id];
  return c.category === "actor" ? actorValue(id as ActorCardId) : 4;
}
function bestPick(state: DuelState, me: DuelistId, effects: readonly InstantEffect[] | undefined, exclude?: number): number | undefined {
  const choice = embassyChoiceIn(effects);
  if (!choice) return undefined;
  const src = state.duelists[choice.from === "yours" ? me : other(me)].archive;
  const idx = eligibleEmbassyIndices(src, choice.filter, exclude);
  if (idx.length === 0) return undefined;
  return idx.reduce((best, i) => (cardValue(src[i]) > cardValue(src[best]) ? i : best));
}

const eff = (s: DuelState, a: FieldActor) => getEffectiveStats(a, s);
function threat(s: DuelState, me: DuelistId): number {
  // The strongest ATK the opponent can swing with next turn (face-up only: no cheating).
  return Math.max(0, ...s.duelists[other(me)].field.filter((a) => a.facing === "face-up").map((a) => eff(s, a).atk));
}

// --- Stats -----------------------------------------------------------------------
type Played = Record<DuelistId, Set<CardId>>;
const played: Record<string, { games: number; wins: number }> = {};
const inDeck: Record<string, { games: number; wins: number }> = {};
const reasons: Record<string, number> = {};
let firstWins = 0, decided = 0, turnsTotal = 0, runoffs = 0;
const bump = (m: Record<string, { games: number; wins: number }>, k: string, win: boolean) => {
  m[k] ??= { games: 0, wins: 0 };
  m[k].games++;
  if (win) m[k].wins++;
};

// --- Bot turn --------------------------------------------------------------------
function playPolicies(s: DuelState, me: DuelistId, p: Played): void {
  const d = s.duelists[me];
  const opp = s.duelists[other(me)];
  for (const id of [...d.hand]) {
    if (s.winnerId) return;
    const c = CARDS[id];
    if (c.category !== "policy") continue;
    const pc = POLICY_CARDS[id as PolicyCardId];
    let options: { targetInstanceId?: number; embassyPick?: number } | null = null;
    if (pc.kind === "equip") {
      const pool = pc.attachTo === "your-actor" ? d.field.filter((a) => a.stance === "campaign") : opp.field.filter((a) => a.facing === "face-up");
      if (pool.length === 0) continue;
      const t = pool.reduce((b, a) => (eff(s, a).atk > eff(s, b).atk ? a : b));
      if (pc.attachTo === "opponent-actor" && eff(s, t).atk < 3) continue;
      options = { targetInstanceId: t.instanceId };
    } else if (pc.target) {
      const pool = opp.field.filter((a) => !hasPassive(a, "immune-to-effects") && (pc.targetMaxAtk === undefined || eff(s, a).atk <= pc.targetMaxAtk));
      if (pool.length === 0) continue;
      const t = pool.reduce((b, a) => (actorValue(a.cardId) > actorValue(b.cardId) ? a : b));
      options = { targetInstanceId: t.instanceId };
    } else {
      const draws = pc.onActivate.some((e) => e.kind === "draw-cards" && e.recipient === "you");
      if (draws && d.hand.length > 6) continue;
      const retrieval = embassyChoiceIn(pc.onActivate);
      if (retrieval && !canRetrieve(s, me, retrieval)) continue;
      options = { embassyPick: bestPick(s, me, pc.onActivate) };
    }
    if (activatePolicy(s, id as PolicyCardId, options).ok) p[me].add(id);
  }
}

function flipUseful(s: DuelState, me: DuelistId): void {
  const d = s.duelists[me];
  const t = threat(s, me);
  for (const a of [...d.field]) {
    if (s.winnerId) return;
    if (a.facing !== "face-down" || a.turnDeployed === s.turnNumber) continue;
    const c = ACTOR_CARDS[a.cardId];
    const retrieval = embassyChoiceIn(c.onFlip);
    const worth = (c.onFlip && (!retrieval || canRetrieve(s, me, retrieval))) || c.atk > t;
    if (worth) changeStance(s, a.instanceId, { embassyPick: bestPick(s, me, c.onFlip) });
  }
}

function deployBest(s: DuelState, me: DuelistId, p: Played): void {
  const d = s.duelists[me];
  if (d.hasNormalDeployedThisTurn) return;
  const t = threat(s, me);
  const leaderInOffice = d.field.some((a) => ACTOR_CARDS[a.cardId].tier === "leader");
  let best: { id: ActorCardId; tribute?: FieldActor; score: number } | null = null;
  const weakest = d.field.length ? d.field.reduce((b, a) => (actorValue(a.cardId) < actorValue(b.cardId) ? a : b)) : undefined;
  for (const id of new Set(d.hand)) {
    if (CARDS[id].category !== "actor") continue;
    const c = ACTOR_CARDS[id as ActorCardId];
    if (c.tier === "grassroots") {
      if (d.field.length >= 5) continue;
      const score = actorValue(c.id);
      if (!best || score > best.score) best = { id: c.id, score };
    } else {
      if (!weakest) continue;
      if (c.tier === "leader" && leaderInOffice) continue;
      const score = actorValue(c.id) - actorValue(weakest.cardId);
      if (score < 2) continue;
      if (!best || score + 3 > best.score) best = { id: c.id, tribute: weakest, score: score + 3 };
    }
  }
  if (!best) return;
  const c = ACTOR_CARDS[best.id];
  const campaignOnly = c.passives?.some((x) => x.kind === "campaign-only");
  let stance: "campaign" | "resistance" = "campaign";
  let facing: "face-up" | "face-down" = "face-up";
  const atk = c.atk;
  if (!campaignOnly) {
    if (c.onFlip) { stance = "resistance"; facing = "face-down"; }
    else if (atk < t && c.def > atk) { stance = "resistance"; facing = c.onDeploy || c.passives ? "face-up" : "face-down"; }
    else if (atk < 3 && !c.onDeploy) { stance = "resistance"; facing = "face-down"; }
    else if (atk < 3) { stance = "resistance"; }
  }
  const r = deployActor(s, best.id, {
    stance,
    facing,
    tributeInstanceId: best.tribute?.instanceId,
    embassyPick: bestPick(s, me, c.onDeploy),
  });
  if (r.ok) p[me].add(best.id);
}

function setScandals(s: DuelState, me: DuelistId): void {
  const d = s.duelists[me];
  if (d.hasSetScandalThisTurn) return;
  const sc = d.hand.find((id) => CARDS[id].category === "scandal");
  if (sc) setScandal(s, sc as ScandalCardId);
}

function attack(s: DuelState, me: DuelistId): void {
  const d = s.duelists[me];
  const opp = s.duelists[other(me)];
  const attackers = d.field
    .filter((a) => a.stance === "campaign" && a.turnDeployed !== s.turnNumber && !a.hasAttackedThisTurn)
    .sort((a, b) => eff(s, b).atk - eff(s, a).atk);
  for (const a of attackers) {
    if (s.winnerId || !d.field.includes(a)) continue;
    const myAtk = eff(s, a).atk;
    if (opp.field.length === 0) {
      declareAttack(s, a.instanceId);
      continue;
    }
    let bestT: FieldActor | null = null;
    let bestGain = 0;
    for (const t of opp.field) {
      let gain = 0;
      if (t.facing === "face-down") {
        gain = myAtk > 4 ? 3 : 0;
      } else if (t.stance === "campaign") {
        const ta = eff(s, t).atk;
        if (myAtk > ta) gain = actorValue(t.cardId) + (myAtk - ta);
        else if (myAtk === ta) gain = actorValue(t.cardId) - actorValue(a.cardId);
      } else if (myAtk > eff(s, t).def) gain = actorValue(t.cardId);
      if (gain > bestGain) { bestGain = gain; bestT = t; }
    }
    if (bestT) declareAttack(s, a.instanceId, bestT.instanceId);
  }
}

function defend(s: DuelState, me: DuelistId): void {
  const d = s.duelists[me];
  const t = threat(s, me);
  const nearElection = s.turnNumber >= s.election.turn - 1;
  for (const a of [...d.field]) {
    if (a.hasAttackedThisTurn || a.hasChangedStanceThisTurn || a.turnDeployed === s.turnNumber) continue;
    const st = eff(s, a);
    if (a.stance === "campaign" && st.atk < t && st.def > st.atk && !nearElection) changeStance(s, a.instanceId);
    else if (a.stance === "resistance" && a.facing === "face-up" && (st.atk >= t || nearElection)) changeStance(s, a.instanceId);
  }
}

function playTurn(s: DuelState, p: Played): void {
  const me = s.activeDuelistId;
  advancePhase(s); // agenda -> campaign-1
  if (s.winnerId) return;
  playPolicies(s, me, p);
  flipUseful(s, me);
  deployBest(s, me, p);
  setScandals(s, me);
  playPolicies(s, me, p);
  if (s.winnerId) return;
  advancePhase(s); // -> confrontation
  attack(s, me);
  if (s.winnerId) return;
  advancePhase(s); // -> campaign-2
  deployBest(s, me, p);
  playPolicies(s, me, p);
  defend(s, me);
  if (s.winnerId) return;
  advancePhase(s); // -> recess
  advancePhase(s); // -> next turn (agenda)
}

// --- Run ---------------------------------------------------------------------------
// "random" mode: each distinct non-Leader card is in a deck with p=0.5 (with
// its usual copies), so in-deck vs. not-in-deck win rates estimate each
// card's marginal strength against the average card.
const MODE = process.argv[5] ?? "default";
const presence: Record<string, { inG: number; inW: number; outG: number; outW: number }> = {};
function randomDeck(): CardId[] {
  const full = buildDefaultDeck(edition, rnd);
  const ids = [...new Set(full)];
  const keep = new Set(ids.filter((id) => {
    const c = CARDS[id];
    return (c.category === "actor" && c.tier === "leader") || rnd() < 0.5;
  }));
  return full.filter((id) => keep.has(id));
}
const POOL = [...new Set(buildDefaultDeck(edition, () => 0.5))];
const LEADERS_ALL = Object.values(ACTOR_CARDS).filter((c) => c.edition === edition && c.tier === "leader").map((c) => c.id);

for (let g = 0; g < GAMES; g++) {
  const deck1 = shuffle(MODE === "random" ? randomDeck() : buildDefaultDeck(edition, rnd));
  const deck2 = shuffle(MODE === "random" ? randomDeck() : buildDefaultDeck(edition, rnd));
  const s = createDuel(deck1, deck2);
  s.duelists.duelist1.bonusVotes = Number(process.env.BONUS1 ?? 0);
  const p: Played = { duelist1: new Set(), duelist2: new Set() };
  for (let turn = 0; turn < 60 && !s.winnerId; turn++) playTurn(s, p);
  if (!s.winnerId) { reasons["unfinished"] = (reasons["unfinished"] ?? 0) + 1; continue; }
  decided++;
  turnsTotal += s.turnNumber;
  if (s.winnerId === "duelist1") firstWins++;
  const won = s.log.find((e) => e.kind === "duel-won") as { reason?: string };
  reasons[won.reason ?? "?"] = (reasons[won.reason ?? "?"] ?? 0) + 1;
  if (s.log.some((e) => e.kind === "runoff-called")) runoffs++;
  for (const e of s.log) if (e.kind === "scandal-triggered") p[e.duelistId].add(e.cardId);
  for (const id of ["duelist1", "duelist2"] as const) {
    const win = s.winnerId === id;
    for (const c of p[id]) bump(played, c, win);
    const deck = id === "duelist1" ? deck1 : deck2;
    const has = new Set(deck);
    for (const c of [...new Set([...POOL, ...LEADERS_ALL])]) {
      presence[c] ??= { inG: 0, inW: 0, outG: 0, outW: 0 };
      if (has.has(c)) { presence[c].inG++; if (win) presence[c].inW++; }
      else { presence[c].outG++; if (win) presence[c].outW++; }
    }
    for (const c of new Set(deck)) {
      const card = CARDS[c];
      if (card.category === "actor" && card.tier === "leader") bump(inDeck, c, win);
    }
  }
}

const pct = (x: number) => (100 * x).toFixed(1);
console.log(`edition=${edition} games=${GAMES} decided=${decided} avgTurns=${(turnsTotal / decided).toFixed(1)} firstPlayerWR=${pct(firstWins / decided)}% runoffs=${pct(runoffs / decided)}%`);
console.log("win reasons:", reasons);
const table = (title: string, m: Record<string, { games: number; wins: number }>) => {
  console.log(`\n${title}`);
  const rows = Object.entries(m).sort((a, b) => b[1].wins / b[1].games - a[1].wins / a[1].games);
  for (const [k, v] of rows) console.log(`  ${k.padEnd(28)} ${pct(v.wins / v.games).padStart(5)}%  n=${v.games}`);
};
table("Leader win rate when in deck (random 2 of 8 per deck)", inDeck);
table("Win rate when played (deployed / activated / Scandal fired)", played);
if (MODE === "random") {
  console.log("\nMarginal strength: WR with card in deck minus WR without (pp)");
  const rows = Object.entries(presence).map(([k, v]) => [k, 100 * (v.inW / v.inG - v.outW / v.outG), v.inG] as const).sort((a, b) => b[1] - a[1]);
  for (const [k, d, n] of rows) console.log(`  ${k.padEnd(28)} ${(d >= 0 ? "+" : "") + d.toFixed(1)}  n=${n}`);
}
