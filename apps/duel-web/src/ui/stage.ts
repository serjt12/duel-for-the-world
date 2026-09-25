// The landscape "stage" for phones (and any short, wide window): the whole
// board is laid out at one fixed logical size -- the same card and zone
// sizes as on desktop -- and scaled uniformly to fit the screen, like a
// console game. Everything inside keeps its proportions, and code that
// measures the screen (drag ghosts, field effects) just reads the
// scaled rectangles.

export const STAGE_WIDTH = 1340;
export const STAGE_HEIGHT = 604;

let forced: boolean | null = null;

/** Force the phone layout on/off (tests, or ?layout=phone|desktop). */
export function forcePhoneLayout(value: boolean | null): void {
  forced = value;
}

function fromUrl(): boolean | null {
  try {
    const layout = new URLSearchParams(window.location.search).get("layout");
    return layout === "phone" ? true : layout === "desktop" ? false : null;
  } catch {
    return null;
  }
}

/** Landscape and not tall: the stage layout. Tall desktop windows keep the scrolling layout. */
export function isPhoneLayout(): boolean {
  const override = forced ?? fromUrl();
  if (override !== null) return override;
  const { innerWidth: w, innerHeight: h } = window;
  return w >= h * 1.25 && h <= 820;
}

let currentScale = 1;

/** The stage's current on-screen scale (1 outside the phone layout). */
export function stageScale(): number {
  return isPhoneLayout() ? currentScale : 1;
}

// Room the notch and system bars leave (CSS env(), read via a probe element).
function safeInsets(): { top: number; right: number; bottom: number; left: number } {
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;visibility:hidden;pointer-events:none;" +
    "padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)";
  document.body.append(probe);
  const style = getComputedStyle(probe);
  const insets = {
    top: parseFloat(style.paddingTop) || 0,
    right: parseFloat(style.paddingRight) || 0,
    bottom: parseFloat(style.paddingBottom) || 0,
    left: parseFloat(style.paddingLeft) || 0,
  };
  probe.remove();
  return insets;
}

/** Scales and centres a stage element to fit the window. */
export function fitStage(stage: HTMLElement): void {
  const insets = safeInsets();
  const width = window.innerWidth - insets.left - insets.right;
  const height = window.innerHeight - insets.top - insets.bottom;
  const scale = Math.min(width / STAGE_WIDTH, height / STAGE_HEIGHT);
  currentScale = scale;
  const left = insets.left + (width - STAGE_WIDTH * scale) / 2;
  const top = insets.top + (height - STAGE_HEIGHT * scale) / 2;
  stage.style.transform = `translate(${left}px, ${top}px) scale(${scale})`;
  // For things outside the stage that line up with it (the side tabs).
  const root = document.documentElement.style;
  root.setProperty("--stage-scale", String(scale));
  root.setProperty("--stage-left", `${left}px`);
  root.setProperty("--stage-top", `${top}px`);
}

/** Re-fit whatever stage is on screen when the window changes (rotation, resize). */
export function installStageResize(onLayoutChange: () => void): void {
  let wasPhone = isPhoneLayout();
  const refit = () => {
    const phone = isPhoneLayout();
    if (phone !== wasPhone) {
      wasPhone = phone;
      onLayoutChange(); // switch layouts: re-render
      return;
    }
    const stage = document.querySelector<HTMLElement>(".board--phone");
    if (stage) fitStage(stage);
  };
  window.addEventListener("resize", refit);
  window.addEventListener("orientationchange", refit);
}
