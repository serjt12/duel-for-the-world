import {
  CARDS,
  cardsOfEdition,
  hasUnlocks,
  nextUnlock,
  unlockOrderOfEdition,
  unlockedCardsOfEdition,
} from "@duel-for-the-world/duel-content";
import type { ActorRole, CardId } from "@duel-for-the-world/duel-content";
import type { ClientState } from "../state/ClientState";
import { progress } from "../state/progress";
import { CARD_ART } from "./cardArt";
import { renderCardFace } from "./cardView";
import { el } from "./dom";
import { flavorOf } from "./flavor";

// The Card Shop, framed as a Pokedex-style "Field Guide": every card in
// the currently-picked "Play vs Computer" edition is a numbered entry --
// a "type" (an Actor's role, or Policy/Scandal) you can filter by, a
// small dex grid to browse, and a big spotlight for whichever entry is
// selected. Not-yet-unlocked entries are "unidentified": a dark, hard to
// make out silhouette and a "???" name, with how many more offline wins
// reveal them. Opens over the menu (renderMenu.ts's "Field Guide"
// button). Online duels always use the whole edition -- this only ever
// affects offline decks (see net/LocalDuel.ts's cardPool, wired in
// app.ts's startVsComputer).

type ShopFilter = "all" | ActorRole | "policy" | "scandal";

const TYPES: Array<{ key: ShopFilter; label: string; icon: string }> = [
  { key: "all", label: "All", icon: "\u{1F5C2}️" }, // 🗂️
  { key: "militant", label: "Militant", icon: "✊" }, // ✊
  { key: "enforcer", label: "Enforcer", icon: "\u{1F6E1}️" }, // 🛡️
  { key: "orator", label: "Orator", icon: "\u{1F3A4}" }, // 🎤
  { key: "operator", label: "Operator", icon: "\u{1F454}" }, // 👔
  { key: "policy", label: "Policy", icon: "\u{1F4DC}" }, // 📜
  { key: "scandal", label: "Scandal", icon: "\u{1F4F0}" }, // 📰
];

function typeOf(cardId: CardId): Exclude<ShopFilter, "all"> {
  const card = CARDS[cardId];
  return card.category === "actor" ? card.role : card.category;
}

function classNames(parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

function dexLabel(n: number): string {
  return `#${String(n).padStart(3, "0")}`;
}

// A grid entry: a small thumbnail plus its dex number. Locked ones get a
// dark, hard-to-read treatment (no true silhouette -- the art has no
// transparency to cut around -- and a "?" badge) instead of a name.
function renderTile(cardId: CardId, dexNumber: number, unlocked: boolean, selected: boolean, onClick: () => void): HTMLElement {
  return el(
    "button",
    {
      type: "button",
      className: classNames(["dex-tile", unlocked ? "dex-tile--unlocked" : "dex-tile--locked", selected && "dex-tile--selected"]),
      title: unlocked ? CARDS[cardId].name : "???",
      onclick: onClick,
    },
    [
      el("div", { className: "dex-tile-art" }, [
        el("img", { src: CARD_ART[cardId], alt: "", draggable: false, className: "dex-tile-img" }),
        unlocked ? null : el("div", { className: "dex-tile-mystery" }, ["?"]),
      ]),
      el("div", { className: "dex-tile-number" }, [dexLabel(dexNumber)]),
    ],
  );
}

// The spotlight: the selected entry, large. A real card face once
// unlocked (with its flavor text spelled out, not just in the tooltip);
// a mystery card -- same size and frame, dark art, "???" -- until then.
function renderSpotlight(cardId: CardId, dexNumber: number, unlocked: boolean, toGo: number): HTMLElement {
  const card = CARDS[cardId];
  const type = TYPES.find((t) => t.key === typeOf(cardId))!;
  const face = unlocked
    ? renderCardFace(cardId, {})
    : el("div", { className: `card card--${card.category} dex-mystery-card` }, [
        el("div", { className: "card-art" }, [
          el("img", { src: CARD_ART[cardId], alt: "", draggable: false, className: "card-art-img dex-mystery-img" }),
          el("div", { className: "dex-tile-mystery dex-tile-mystery--big" }, ["?"]),
        ]),
        el("div", { className: "card-body" }, [
          el("div", { className: "card-name" }, ["???"]),
          el("div", { className: "card-tag" }, ["Not yet identified"]),
        ]),
      ]);

  const infoLines: Array<HTMLElement | null> = [
    el("div", { className: "dex-spotlight-header" }, [
      el("span", { className: "dex-spotlight-number" }, [dexLabel(dexNumber)]),
      el("span", { className: "dex-spotlight-type" }, [`${type.icon} ${type.label}`]),
    ]),
  ];

  if (unlocked) {
    infoLines.push(el("p", { className: "dex-spotlight-flavor" }, [`“${card.flavorText}”`]));
  } else {
    infoLines.push(
      el("p", { className: "dex-spotlight-flavor dex-spotlight-flavor--locked" }, [
        `\u{1F512} Win ${toGo} more offline match${toGo === 1 ? "" : "es"} to identify this politician.`,
      ]),
    );
  }

  return el("div", { className: "dex-spotlight" }, [face, el("div", { className: "dex-spotlight-info" }, infoLines)]);
}

export function renderShop(state: ClientState, rerender: () => void): HTMLElement | null {
  if (!state.shopOpen) return null;
  const close = () => {
    state.shopOpen = false;
    rerender();
  };

  const edition = state.aiEdition;
  const editionName = flavorOf(edition).editionName;
  const wins = progress().offlineWins;
  const all = cardsOfEdition(edition);
  const unlocked = new Set(unlockedCardsOfEdition(edition, wins));
  const order = unlockOrderOfEdition(edition);
  const requirement = new Map(order.map((step) => [step.id, step.winsRequired]));
  const upcoming = nextUnlock(edition, wins);
  const gated = hasUnlocks(edition);
  const dexNumber = new Map(all.map((id, i) => [id, i + 1]));

  const selectedId: CardId = state.shopSelected && all.includes(state.shopSelected) ? state.shopSelected : (upcoming?.id ?? all[0]);
  const selectFilter = (key: ShopFilter) => () => {
    state.shopFilter = key;
    rerender();
  };
  const select = (id: CardId) => () => {
    state.shopSelected = id;
    rerender();
  };

  const shown = state.shopFilter === "all" ? all : all.filter((id) => typeOf(id) === state.shopFilter);

  const progressFill = el("div", { className: "shop-progress-fill" });
  progressFill.style.width = `${gated ? Math.round((unlocked.size / all.length) * 100) : 100}%`;

  const spotlightToGo = requirement.has(selectedId) ? Math.max(0, requirement.get(selectedId)! - wins) : 0;

  const header: Array<HTMLElement | null> = [
    el("h2", { className: "menu-heading" }, ["Field Guide"]),
    el("p", { className: "settings-note" }, [
      gated
        ? `${unlocked.size} / ${all.length} types of ${editionName} politicians identified. Online always uses every card.`
        : `All ${all.length} ${editionName} politicians are already identified -- this edition doesn't gate any of them yet.`,
    ]),
  ];
  if (gated) {
    header.push(
      el("div", { className: "shop-progress-bar" }, [progressFill]),
      upcoming
        ? el("p", { className: "shop-next-line" }, [
            `⭐ Next up, in ${upcoming.winsRequired - wins} more offline win${upcoming.winsRequired - wins === 1 ? "" : "s"} (${wins} so far).`,
          ])
        : el("p", { className: "shop-next-line shop-next-line--done" }, ["\u{1F3C6} Every politician in this edition is identified!"]),
    );
  }

  const filterRow = el(
    "div",
    { className: "dex-filters", role: "tablist", ariaLabel: "Filter by type" },
    TYPES.map((t) =>
      el(
        "button",
        {
          type: "button",
          className: classNames(["dex-chip", state.shopFilter === t.key && "dex-chip--active"]),
          role: "tab",
          ariaSelected: String(state.shopFilter === t.key),
          onclick: selectFilter(t.key),
        },
        [`${t.icon} ${t.label}`],
      ),
    ),
  );

  const grid = el(
    "div",
    { className: "dex-grid" },
    shown.map((id) => renderTile(id, dexNumber.get(id)!, unlocked.has(id), id === selectedId, select(id))),
  );

  const panel = el(
    "div",
    { className: "settings-panel shop-panel", role: "dialog", ariaLabel: "Field Guide", onclick: (event: MouseEvent) => event.stopPropagation() },
    [
      ...header,
      renderSpotlight(selectedId, dexNumber.get(selectedId)!, unlocked.has(selectedId), spotlightToGo),
      filterRow,
      grid,
      el("div", { className: "menu-actions" }, [el("span", {}), el("button", { className: "primary", onclick: close }, ["Done"])]),
    ],
  );
  return el("div", { className: "settings-backdrop", onclick: close }, [panel]);
}
