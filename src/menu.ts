// Carom — the menus: which items each screen shows, where each item's hit
// region lies, and the keyboard navigation over them (specs/ui.md). The same
// layout is drawn by `render.ts` and reported by `menuItemRect`, so a pointer
// selects exactly what is drawn.

import type { DeepReadonly } from "ts-essentials";
import {
  FIELD_CX,
  MATCHOVER_ITEMS,
  PAUSE_ITEMS,
  TITLE_ITEMS,
} from "./constants";
import type { CaromState, MenuItemRect, Screen } from "./game";

/** The copy of the how-to screen's single item, which returns to the title. */
export const HOWTO_ITEMS = ["BACK TO TITLE"] as const;

/** The width and height of every item's hit region. */
export const MENU_ITEM_W = 420;
export const MENU_ITEM_H = 56;

/** The vertical pitch between items. */
export const MENU_ITEM_STEP = 68;

export interface MenuLayout {
  readonly items: readonly string[];
  /** The y of the first item's center. */
  readonly top: number;
}

const LAYOUTS: Readonly<Partial<Record<Screen, MenuLayout>>> = {
  title: { items: TITLE_ITEMS, top: 372 },
  howto: { items: HOWTO_ITEMS, top: 640 },
  paused: { items: PAUSE_ITEMS, top: 332 },
  matchover: { items: MATCHOVER_ITEMS, top: 460 },
};

/** The menu `screen` shows, or `null` for a screen that shows none. */
export function menuFor(screen: Screen): MenuLayout | null {
  return LAYOUTS[screen] ?? null;
}

/** The center y of item `index` on `layout`. */
export function menuItemCenterY(layout: MenuLayout, index: number): number {
  return layout.top + index * MENU_ITEM_STEP;
}

/** The hit region of item `index` on the menu `screen` shows, or `null`. */
export function menuItemRect(
  screen: Screen,
  index: number,
): MenuItemRect | null {
  const layout = menuFor(screen);
  if (layout === null) return null;
  if (!Number.isInteger(index) || index < 0 || index >= layout.items.length) {
    return null;
  }
  return {
    x: FIELD_CX - MENU_ITEM_W / 2,
    y: menuItemCenterY(layout, index) - MENU_ITEM_H / 2,
    w: MENU_ITEM_W,
    h: MENU_ITEM_H,
  };
}

/** The item under `(x, y)` on the menu `screen` shows, or `null`. */
export function menuItemAt(
  screen: Screen,
  x: number,
  y: number,
): number | null {
  const layout = menuFor(screen);
  if (layout === null) return null;
  for (let index = 0; index < layout.items.length; index++) {
    const r = menuItemRect(screen, index);
    if (r !== null && x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) {
      return index;
    }
  }
  return null;
}

/** `menuIndex` moved by `delta` items, wrapping at both ends. */
export function wrapIndex(index: number, delta: number, count: number): number {
  return (((index + delta) % count) + count) % count;
}

/** The state with its menu highlight moved up or down one item, wrapping. */
export function moveMenu(
  state: DeepReadonly<CaromState>,
  delta: 1 | -1,
): CaromState {
  const layout = menuFor(state.screen);
  if (layout === null) return { ...state };
  return {
    ...state,
    menuIndex: wrapIndex(state.menuIndex, delta, layout.items.length),
  };
}
