// A tiny typed "hyperscript" helper so the UI code below can build DOM
// trees declaratively without a framework, per the plain HTML/CSS/TS
// choice for this app. Not a general-purpose library -- just enough to
// keep renderLobby/renderBoard readable.
type Child = Node | string | null | undefined | false;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  children: Child[] = [],
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  Object.assign(element, props);

  for (const child of children) {
    if (child === null || child === undefined || child === false) {
      continue;
    }
    element.append(typeof child === "string" ? document.createTextNode(child) : child);
  }

  return element;
}
