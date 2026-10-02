import {
  CARDS,
  cardsOfEdition,
  hasUnlocks,
  nextUnlock,
  unlockOrderOfEdition,
  unlockedCardsOfEdition,
} from "@duel-for-the-world/duel-content";
import type { ActorRole, CardId } from "@duel-for-the-world/duel-content";
import { rewardedAdAvailable, showRewardedAd } from "../ads/ads";
import { t, tf } from "../i18n";
import { localizedCardFlavor, localizedCardName } from "../i18n/cardText";
import type { ClientState } from "../state/ClientState";
import { addDonation, canAffordUnlock, donations, spendOnUnlock, UNLOCK_COST } from "../state/donations";
import { effectiveOfflineWins, grantBonusUnlockWin } from "../state/progress";
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

// Labels are resolved live (t()) rather than baked in, so the Field Guide
// relabels itself instantly on a language switch.
const TYPES: Array<{ key: ShopFilter; labelKey: string; icon: string }> = [
  { key: "all", labelKey: "shop.type.all", icon: "\u{1F5C2}️" }, // 🗂️
  { key: "militant", labelKey: "role.militant", icon: "✊" }, // ✊
  { key: "enforcer", labelKey: "role.enforcer", icon: "\u{1F6E1}️" }, // 🛡️
  { key: "orator", labelKey: "role.orator", icon: "\u{1F3A4}" }, // 🎤
  { key: "operator", labelKey: "role.operator", icon: "\u{1F454}" }, // 👔
  { key: "policy", labelKey: "cardInfo.category.policy", icon: "\u{1F4DC}" }, // 📜
  { key: "scandal", labelKey: "cardInfo.category.scandal", icon: "\u{1F4F0}" }, // 📰
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
      title: unlocked ? localizedCardName(cardId, CARDS[cardId].name) : "???",
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
  const type = TYPES.find((ty) => ty.key === typeOf(cardId))!;
  const face = unlocked
    ? renderCardFace(cardId, {})
    : el("div", { className: `card card--${card.category} dex-mystery-card` }, [
        el("div", { className: "card-art" }, [
          el("img", { src: CARD_ART[cardId], alt: "", draggable: false, className: "card-art-img dex-mystery-img" }),
          el("div", { className: "dex-tile-mystery dex-tile-mystery--big" }, ["?"]),
        ]),
        el("div", { className: "card-body" }, [
          el("div", { className: "card-name" }, ["???"]),
          el("div", { className: "card-tag" }, [t("shop.notIdentified")]),
        ]),
      ]);

  const infoLines: Array<HTMLElement | null> = [
    el("div", { className: "dex-spotlight-header" }, [
      el("span", { className: "dex-spotlight-number" }, [dexLabel(dexNumber)]),
      el("span", { className: "dex-spotlight-type" }, [`${type.icon} ${t(type.labelKey)}`]),
    ]),
  ];

  if (unlocked) {
    infoLines.push(el("p", { className: "dex-spotlight-flavor" }, [`“${localizedCardFlavor(cardId, card.flavorText)}”`]));
  } else {
    infoLines.push(
      el("p", { className: "dex-spotlight-flavor dex-spotlight-flavor--locked" }, [
        toGo === 1 ? t("shop.spotlightLocked.one") : tf("shop.spotlightLocked.many", { n: String(toGo) }),
      ]),
    );
  }

  return el("div", { className: "dex-spotlight" }, [face, el("div", { className: "dex-spotlight-info" }, infoLines)]);
}

// Whether a rewarded ad is currently playing -- module-level rather than
// ClientState since it's purely a local "don't double-tap" UI guard, not
// state anything else needs to read.
let watchingAd = false;

export function renderShop(state: ClientState, rerender: () => void): HTMLElement | null {
  if (!state.shopOpen) return null;
  const close = () => {
    state.shopOpen = false;
    watchingAd = false;
    rerender();
  };

  const edition = state.aiEdition;
  const editionName = flavorOf(edition).editionName;
  const wins = effectiveOfflineWins();
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
    el("h2", { className: "menu-heading" }, [t("menu.fieldGuide.label")]),
    el("p", { className: "settings-note" }, [
      gated
        ? tf("shop.progress.gated", { unlocked: String(unlocked.size), total: String(all.length), edition: editionName })
        : tf("shop.progress.ungated", { total: String(all.length), edition: editionName }),
    ]),
  ];
  if (gated) {
    header.push(
      el("div", { className: "shop-progress-bar" }, [progressFill]),
      upcoming
        ? el("p", { className: "shop-next-line" }, [
            upcoming.winsRequired - wins === 1
              ? tf("shop.next.one", { wins: String(wins) })
              : tf("shop.next.many", { n: String(upcoming.winsRequired - wins), wins: String(wins) }),
          ])
        : el("p", { className: "shop-next-line shop-next-line--done" }, [t("shop.next.done")]),
    );
  }

  // Donations: watch a rewarded ad for one, spend UNLOCK_COST of them to
  // unlock whichever card is next early, instead of grinding more wins.
  if (gated && upcoming) {
    const balance = donations().balance;
    const adReady = rewardedAdAvailable();
    const watchAd = async () => {
      if (watchingAd || !adReady) return;
      watchingAd = true;
      rerender();
      const result = await showRewardedAd();
      watchingAd = false;
      if (result.rewarded) addDonation();
      rerender();
    };
    const buyUnlock = () => {
      if (!spendOnUnlock()) return;
      grantBonusUnlockWin();
      rerender();
    };
    header.push(
      el("div", { className: "dex-donations" }, [
        el("span", { className: "dex-donations-balance" }, [
          balance === 1 ? t("shop.donations.balance.one") : tf("shop.donations.balance.many", { n: String(balance) }),
        ]),
        el(
          "button",
          { type: "button", className: "dex-donations-btn", disabled: watchingAd || !adReady, onclick: () => void watchAd() },
          [watchingAd ? t("shop.donations.watching") : t("shop.donations.watchAd")],
        ),
        el(
          "button",
          { type: "button", className: "dex-donations-btn primary", disabled: !canAffordUnlock(), onclick: buyUnlock },
          [tf("shop.donations.unlockNow", { cost: String(UNLOCK_COST) })],
        ),
      ]),
      adReady ? null : el("p", { className: "dex-donations-note" }, [t("shop.donations.adsNote")]),
    );
  }

  const filterRow = el(
    "div",
    { className: "dex-filters", role: "tablist", ariaLabel: t("shop.filterByType") },
    TYPES.map((type) =>
      el(
        "button",
        {
          type: "button",
          className: classNames(["dex-chip", state.shopFilter === type.key && "dex-chip--active"]),
          role: "tab",
          ariaSelected: String(state.shopFilter === type.key),
          onclick: selectFilter(type.key),
        },
        [`${type.icon} ${t(type.labelKey)}`],
      ),
    ),
  );

  const grid = el(
    "div",
    { className: "dex-grid" },
    shown.map((id) => renderTile(id, dexNumber.get(id)!, unlocked.has(id), id === selectedId, select(id))),
  );

  // The Pokedex-style two-pane body: a fixed spotlight pane (the
  // selected entry, large) beside a browse pane (filter chips + the
  // numbered grid, which scrolls on its own). Wrapped in dedicated
  // containers -- rather than leaving spotlight/filters/grid as flat
  // siblings of the panel -- so the panel can give each region a fixed,
  // non-overlapping box instead of relying on scroll position or stray
  // "order" tricks to keep things apart (see style.css's .dex-main /
  // .dex-main-spotlight / .dex-main-browse).
  const main = el("div", { className: "dex-main" }, [
    el("div", { className: "dex-main-spotlight" }, [
      renderSpotlight(selectedId, dexNumber.get(selectedId)!, unlocked.has(selectedId), spotlightToGo),
    ]),
    el("div", { className: "dex-main-browse" }, [filterRow, grid]),
  ]);

  const panel = el(
    "div",
    { className: "settings-panel shop-panel", role: "dialog", ariaLabel: t("menu.fieldGuide.label"), onclick: (event: MouseEvent) => event.stopPropagation() },
    [
      ...header,
      main,
      el("div", { className: "menu-actions" }, [el("span", {}), el("button", { className: "primary", onclick: close }, [t("common.done")])]),
    ],
  );
  return el("div", { className: "settings-backdrop", onclick: close }, [panel]);
}
