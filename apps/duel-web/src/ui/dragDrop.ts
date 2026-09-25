import type { CardId } from "@project-palacio/duel-content";

// Pointer-based card dragging (mouse, pen, and touch), with a floating
// "ghost" card that lifts, tilts with movement, glows over a valid
// target, flies into the target on a valid drop, and springs back home
// on a miss.
//
// Why not the native HTML5 drag-and-drop API: it doesn't work on touch
// screens, and it renders its own fixed, semi-transparent drag image we
// can't animate. Pointer events give full control over both.
//
// Built to survive this app's render model: every state change rebuilds
// the whole DOM from scratch, possibly in the middle of a drag (e.g. the
// opponent's action arrives). So:
//   - the ghost lives on document.body, outside #app, and is never
//     touched by a re-render;
//   - drop targets are found by hit-testing at the pointer's position at
//     the moment they're needed, never cached, so a target rebuilt
//     mid-drag still works;
//   - candidate highlighting is re-applied after each render via
//     refreshDragHighlights().

export type DragPayload =
  | { kind: "hand-card"; cardId: CardId; handIndex: number }
  | { kind: "field-actor"; instanceId: number };

export interface DropTargetSpec {
  accepts(payload: DragPayload): boolean;
  onDrop(payload: DragPayload): void;
  // Short verb shown on the ghost while hovering this target, e.g.
  // "Deploy" or "Attack!". Can depend on what's being dragged.
  label?: (payload: DragPayload) => string;
  // The on-screen scale the card settles at when dropped here (e.g. the
  // size cards are shown at inside a field zone), so it visibly lands in
  // place. Defaults to shrinking away.
  landScale?: number;
}

const DRAG_THRESHOLD_PX = 6;
const MAX_TILT_DEG = 14;
const LIFT_SCALE = 1.08;

const dropTargets = new WeakMap<Element, DropTargetSpec>();

interface ActiveDrag {
  payload: DragPayload;
  source: HTMLElement;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  originRect: DOMRect;
  // Ghost geometry: the source's untransformed size, the scale it's shown
  // at on screen (field cards are drawn scaled down inside their zone),
  // the grab point in untransformed coordinates, and where the ghost box
  // is placed so that it starts exactly over the source.
  naturalWidth: number;
  naturalHeight: number;
  baseScale: number;
  grabX: number;
  grabY: number;
  left: number;
  top: number;
  started: boolean;
  ghost: HTMLElement | null;
  hint: HTMLElement | null;
  tilt: number;
  velocityX: number;
  lastMoveTime: number;
  hovered: HTMLElement | null;
  frame: number | null;
}

let active: ActiveDrag | null = null;

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

// --- public API --------------------------------------------------------

export function makeDropTarget(element: HTMLElement, spec: DropTargetSpec): void {
  dropTargets.set(element, spec);
  element.classList.add("drop-target");
}

export function makeDraggable(element: HTMLElement, payload: DragPayload): void {
  element.classList.add("draggable");
  element.addEventListener("pointerdown", (event) => onPointerDown(event, element, payload));
}

/** Call after every render so candidate targets stay lit mid-drag. */
export function refreshDragHighlights(): void {
  if (active?.started) {
    highlightCandidates(active.payload);
    updateHover();
  }
}

export function isDragging(): boolean {
  return active?.started ?? false;
}

// --- internals ---------------------------------------------------------

function onPointerDown(event: PointerEvent, source: HTMLElement, payload: DragPayload): void {
  if (active || event.button !== 0 || !event.isPrimary) {
    return;
  }
  // Stops text selection and the browser's own image-drag; a plain click
  // (no movement past the threshold) still fires normally afterwards.
  event.preventDefault();

  active = {
    payload,
    source,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    x: event.clientX,
    y: event.clientY,
    originRect: source.getBoundingClientRect(),
    naturalWidth: 0,
    naturalHeight: 0,
    baseScale: 1,
    grabX: 0,
    grabY: 0,
    left: 0,
    top: 0,
    started: false,
    ghost: null,
    hint: null,
    tilt: 0,
    velocityX: 0,
    lastMoveTime: performance.now(),
    hovered: null,
    frame: null,
  };

  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerCancel);
  window.addEventListener("keydown", onKeyDown);
}

function onPointerMove(event: PointerEvent): void {
  if (!active || event.pointerId !== active.pointerId) {
    return;
  }

  const now = performance.now();
  const dt = Math.max(1, now - active.lastMoveTime);
  active.velocityX = (event.clientX - active.x) / dt;
  active.lastMoveTime = now;
  active.x = event.clientX;
  active.y = event.clientY;

  if (!active.started) {
    const distance = Math.hypot(active.x - active.startX, active.y - active.startY);
    if (distance < DRAG_THRESHOLD_PX) {
      return;
    }
    startDrag(active);
  }

  updateHover();
}

function startDrag(drag: ActiveDrag): void {
  drag.started = true;
  // Re-measure: the source may have moved since pointerdown (scroll).
  if (drag.source.isConnected) {
    drag.originRect = drag.source.getBoundingClientRect();
  }

  // Build the ghost at the source's natural (untransformed) size and scale
  // it to match what's on screen, pivoting on the grab point so the card
  // stays pinned under the pointer.
  const rect = drag.originRect;
  drag.naturalWidth = drag.source.offsetWidth || rect.width;
  drag.naturalHeight = drag.source.offsetHeight || rect.height;
  drag.baseScale = rect.width / drag.naturalWidth || 1;
  drag.grabX = (drag.startX - rect.left) / drag.baseScale;
  drag.grabY = (drag.startY - rect.top) / drag.baseScale;
  drag.left = rect.left - drag.grabX * (1 - drag.baseScale);
  drag.top = rect.top - drag.grabY * (1 - drag.baseScale);

  const ghost = drag.source.cloneNode(true) as HTMLElement;
  ghost.classList.remove("card-enter", "clickable", "selected", "drop-target", "draggable");
  ghost.classList.add("drag-ghost");
  if (drag.payload.kind === "field-actor") {
    ghost.classList.add("drag-ghost--attack");
  }
  ghost.removeAttribute("title");
  Object.assign(ghost.style, {
    left: `${drag.left}px`,
    top: `${drag.top}px`,
    width: `${drag.naturalWidth}px`,
    height: `${drag.naturalHeight}px`,
    transformOrigin: `${drag.grabX}px ${drag.grabY}px`,
    transform: ghostTransform(0, 0, 0, drag.baseScale),
  });

  const hint = document.createElement("div");
  hint.className = "drag-hint";
  ghost.append(hint);

  document.body.append(ghost);
  drag.ghost = ghost;
  drag.hint = hint;

  drag.source.classList.add("drag-source");
  document.body.classList.add("is-dragging");
  highlightCandidates(drag.payload);

  drag.frame = requestAnimationFrame(animateFrame);
}

function animateFrame(): void {
  if (!active?.ghost) {
    return;
  }
  const reduced = prefersReducedMotion();
  const targetTilt = reduced
    ? 0
    : Math.max(-MAX_TILT_DEG, Math.min(MAX_TILT_DEG, active.velocityX * 9));
  // Ease the tilt toward the movement direction, and let it settle back
  // to upright when the pointer stops moving.
  active.tilt += (targetTilt - active.tilt) * 0.2;
  active.velocityX *= 0.85;

  active.ghost.style.transform = ghostTransform(
    active.x - active.startX,
    active.y - active.startY,
    active.tilt,
    active.baseScale * (active.hovered ? LIFT_SCALE * 1.04 : LIFT_SCALE),
  );
  active.frame = requestAnimationFrame(animateFrame);
}

function ghostTransform(dx: number, dy: number, tilt: number, scale: number): string {
  return `translate(${dx}px, ${dy}px) rotate(${tilt}deg) scale(${scale})`;
}

function findTargetAt(x: number, y: number, payload: DragPayload): HTMLElement | null {
  let node: Element | null = document.elementFromPoint(x, y);
  while (node) {
    const spec = dropTargets.get(node);
    if (spec && spec.accepts(payload)) {
      return node as HTMLElement;
    }
    node = node.parentElement;
  }
  return null;
}

function highlightCandidates(payload: DragPayload): void {
  for (const element of document.querySelectorAll<HTMLElement>(".drop-target")) {
    const spec = dropTargets.get(element);
    element.classList.toggle("drop-candidate", Boolean(spec?.accepts(payload)));
  }
}

function updateHover(): void {
  if (!active?.started) {
    return;
  }
  const target = findTargetAt(active.x, active.y, active.payload);
  if (target !== active.hovered) {
    active.hovered?.classList.remove("drop-hover");
    target?.classList.add("drop-hover");
    active.hovered = target;
  }

  const spec = target ? dropTargets.get(target) : undefined;
  const label = spec?.label?.(active.payload) ?? "";
  if (active.hint) {
    active.hint.textContent = label;
    active.hint.classList.toggle("visible", label !== "");
  }
  active.ghost?.classList.toggle("over-target", Boolean(target));
}

function clearHighlights(): void {
  for (const element of document.querySelectorAll(".drop-candidate, .drop-hover")) {
    element.classList.remove("drop-candidate", "drop-hover");
  }
  document.body.classList.remove("is-dragging");
}

function detachListeners(): void {
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerup", onPointerUp);
  window.removeEventListener("pointercancel", onPointerCancel);
  window.removeEventListener("keydown", onKeyDown);
}

// The browser still fires a click after a pointerup that followed a real
// drag; swallow that one so dropping a card doesn't also "click" it.
function suppressNextClick(): void {
  const swallow = (event: MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
  };
  window.addEventListener("click", swallow, { capture: true, once: true });
  setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
}

function onPointerUp(event: PointerEvent): void {
  if (!active || event.pointerId !== active.pointerId) {
    return;
  }
  finishDrag(true);
}

function onPointerCancel(event: PointerEvent): void {
  if (!active || event.pointerId !== active.pointerId) {
    return;
  }
  finishDrag(false);
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === "Escape" && active) {
    finishDrag(false);
  }
}

function finishDrag(allowDrop: boolean): void {
  const drag = active;
  if (!drag) {
    return;
  }
  active = null;
  detachListeners();
  if (drag.frame !== null) {
    cancelAnimationFrame(drag.frame);
  }

  if (!drag.started || !drag.ghost) {
    // Never passed the threshold: this was a click, let it through.
    return;
  }

  suppressNextClick();

  const target = allowDrop ? findTargetAt(drag.x, drag.y, drag.payload) : null;
  const spec = target ? dropTargets.get(target) : undefined;
  clearHighlights();

  const ghost = drag.ghost;
  const fromTransform = ghostTransform(
    drag.x - drag.startX,
    drag.y - drag.startY,
    drag.tilt,
    drag.baseScale * LIFT_SCALE,
  );
  const reduced = prefersReducedMotion();

  if (target && spec) {
    // Measure before onDrop, which may re-render and detach the target.
    const targetRect = target.getBoundingClientRect();
    spec.onDrop(drag.payload);
    drag.source.classList.remove("drag-source");

    // Settle into the target: into its center at `landScale` (a field
    // zone -> the card visibly lands in it), or -- for a wide target such
    // as a whole side of the board -- right where the pointer let go.
    const wide = targetRect.width > drag.originRect.width * 2.5;
    const endScale = wide ? drag.baseScale * 0.9 : (spec.landScale ?? 0.55);
    let endX = drag.x - drag.startX;
    let endY = drag.y - drag.startY;
    if (!wide) {
      // Where the ghost's center ends up for translate(0,0) at endScale,
      // pivoting on the grab point; then shift it onto the target center.
      const centerX = drag.left + drag.grabX + endScale * (drag.naturalWidth / 2 - drag.grabX);
      const centerY = drag.top + drag.grabY + endScale * (drag.naturalHeight / 2 - drag.grabY);
      endX = targetRect.left + targetRect.width / 2 - centerX;
      endY = targetRect.top + targetRect.height / 2 - centerY;
    }
    const endTransform = ghostTransform(endX, endY, 0, endScale);

    const animation = ghost.animate(
      [
        { transform: fromTransform, opacity: 1 },
        { transform: endTransform, opacity: 1, offset: 0.7 },
        { transform: endTransform, opacity: 0 },
      ],
      { duration: reduced ? 0 : 320, easing: "cubic-bezier(0.25, 0.9, 0.35, 1)", fill: "forwards" },
    );
    animation.onfinish = () => ghost.remove();
    return;
  }

  // Missed (or cancelled): spring back to where it came from.
  const animation = ghost.animate(
    [
      { transform: fromTransform },
      { transform: ghostTransform(0, 0, 0, drag.baseScale) },
    ],
    { duration: reduced ? 0 : 320, easing: "cubic-bezier(0.2, 1.35, 0.45, 1)", fill: "forwards" },
  );
  animation.onfinish = () => {
    ghost.remove();
    drag.source.classList.remove("drag-source");
  };
}
