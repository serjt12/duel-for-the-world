import type { Edition } from "@duel-for-the-world/duel-content";
import {
  adsAreRemoved,
  buyEdition,
  buyRemoveAds,
  editionListing,
  paidEditions,
  purchasesState,
  restorePurchases,
} from "../store/purchases";
import type { ClientState } from "../state/ClientState";
import { t } from "../i18n";
import { el } from "./dom";
import { flavorOf } from "./flavor";

// The Store: "Remove Ads" plus whatever paid editions exist to sell
// (currently none -- see store/purchases.ts's PAID_EDITIONS). Opens over
// the menu (renderMenu.ts's "Store" button). Same modal chrome as
// ui/settingsPanel.ts.

function priceLabel(price: string | null): string {
  return price ?? "…"; // an ellipsis while the real price is still loading
}

function storeRow(
  title: string,
  blurb: string,
  owned: boolean,
  price: string | null,
  busy: boolean,
  onBuy: () => void,
): HTMLElement {
  return el("div", { className: "store-item" }, [
    el("div", { className: "store-item-info" }, [
      el("span", { className: "store-item-title" }, [title]),
      el("span", { className: "store-item-blurb" }, [blurb]),
    ]),
    owned
      ? el("span", { className: "store-owned-badge" }, [t("store.owned")])
      : el(
          "button",
          { className: "primary store-item-button", disabled: busy, onclick: onBuy },
          [priceLabel(price)],
        ),
  ]);
}

export function renderStore(state: ClientState, rerender: () => void): HTMLElement | null {
  if (!state.storeOpen) return null;
  const purchases = purchasesState();
  const close = () => {
    state.storeOpen = false;
    state.storeError = null;
    rerender();
  };

  const handleResult = async (attempt: () => ReturnType<typeof buyRemoveAds>) => {
    state.storeError = null;
    const result = await attempt();
    if (!result.ok && !result.cancelled) state.storeError = result.error ?? t("store.purchaseFailed");
    rerender();
  };

  const rows: HTMLElement[] = [
    storeRow(
      t("menu.removeAds"),
      t("store.removeAds.blurb"),
      adsAreRemoved(),
      purchases.removeAdsPrice,
      purchases.busy,
      () => void handleResult(buyRemoveAds),
    ),
    ...paidEditions().map((edition: Edition) => {
      const listing = editionListing(edition);
      const owned = purchases.unlockedEditions.has(edition);
      return storeRow(
        listing?.label ?? flavorOf(edition).editionName,
        t("store.edition.blurb"),
        owned,
        purchases.editionPrices[edition] ?? null,
        purchases.busy,
        () => void handleResult(() => buyEdition(edition)),
      );
    }),
  ];

  const note = !purchases.available
    ? el("p", { className: "store-note" }, [purchases.ready ? t("store.notAvailable") : t("store.loading")])
    : null;

  const errorNote = state.storeError ? el("p", { className: "store-note store-note--error" }, [state.storeError]) : null;

  const panel = el(
    "div",
    { className: "settings-panel", role: "dialog", ariaLabel: t("menu.store"), onclick: (event: MouseEvent) => event.stopPropagation() },
    [
      el("h2", { className: "menu-heading" }, [t("menu.store")]),
      ...rows,
      note,
      errorNote,
      purchases.available
        ? el(
            "button",
            {
              className: "store-restore",
              disabled: purchases.busy,
              onclick: () => void handleResult(restorePurchases),
            },
            [t("store.restorePurchases")],
          )
        : null,
      el("div", { className: "menu-actions" }, [el("span", {}), el("button", { className: "primary", onclick: close }, [t("common.done")])]),
    ].filter((node): node is HTMLElement => node !== null),
  );
  return el("div", { className: "settings-backdrop", onclick: close }, [panel]);
}
