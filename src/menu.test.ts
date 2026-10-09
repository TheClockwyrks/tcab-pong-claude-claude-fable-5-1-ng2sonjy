import { describe, expect, it } from "vitest";
import {
  FIELD_CX,
  MATCHOVER_ITEMS,
  PAUSE_ITEMS,
  TITLE_ITEMS,
} from "./constants";
import {
  HOWTO_ITEMS,
  MENU_ITEM_H,
  MENU_ITEM_W,
  menuFor,
  menuItemAt,
  menuItemCenterY,
  menuItemRect,
  moveMenu,
  wrapIndex,
} from "./menu";
import { initialState } from "./world";

describe("menuFor", () => {
  it("names each menu screen's items in order", () => {
    expect(menuFor("title")?.items).toEqual(TITLE_ITEMS);
    expect(menuFor("howto")?.items).toEqual(HOWTO_ITEMS);
    expect(menuFor("paused")?.items).toEqual(PAUSE_ITEMS);
    expect(menuFor("matchover")?.items).toEqual(MATCHOVER_ITEMS);
  });

  it("has no menu on the live screens", () => {
    expect(menuFor("countdown")).toBeNull();
    expect(menuFor("playing")).toBeNull();
  });
});

describe("menuItemRect", () => {
  it("centers every item on the field and stacks them downward", () => {
    const layout = menuFor("title");
    if (layout === null) throw new Error("title has a menu");
    for (let i = 0; i < TITLE_ITEMS.length; i++) {
      const r = menuItemRect("title", i);
      expect(r).not.toBeNull();
      if (r === null) continue;
      expect(r.x + r.w / 2).toBe(FIELD_CX);
      expect(r.y + r.h / 2).toBe(menuItemCenterY(layout, i));
      expect(r.w).toBe(MENU_ITEM_W);
      expect(r.h).toBe(MENU_ITEM_H);
      if (i > 0) {
        const above = menuItemRect("title", i - 1);
        expect(above && above.y + above.h <= r.y).toBe(true);
      }
    }
  });

  it("returns null off the menu and on screens without one", () => {
    expect(menuItemRect("title", -1)).toBeNull();
    expect(menuItemRect("title", TITLE_ITEMS.length)).toBeNull();
    expect(menuItemRect("title", 0.5)).toBeNull();
    expect(menuItemRect("playing", 0)).toBeNull();
    expect(menuItemRect("countdown", 0)).toBeNull();
  });
});

describe("menuItemAt", () => {
  it("finds the item under a point and nothing between items", () => {
    const r = menuItemRect("paused", 1);
    if (r === null) throw new Error("paused has three items");
    expect(menuItemAt("paused", r.x + 1, r.y + 1)).toBe(1);
    expect(menuItemAt("paused", r.x + r.w / 2, r.y + r.h / 2)).toBe(1);
    expect(menuItemAt("paused", r.x + r.w, r.y)).toBeNull();
    expect(menuItemAt("paused", r.x - 1, r.y + 1)).toBeNull();
    expect(menuItemAt("paused", 10, 10)).toBeNull();
    expect(menuItemAt("playing", r.x + 1, r.y + 1)).toBeNull();
  });
});

describe("wrapIndex", () => {
  it("wraps at both ends", () => {
    expect(wrapIndex(0, -1, 3)).toBe(2);
    expect(wrapIndex(2, 1, 3)).toBe(0);
    expect(wrapIndex(1, 1, 3)).toBe(2);
    expect(wrapIndex(0, -1, 1)).toBe(0);
  });
});

describe("moveMenu", () => {
  it("moves the highlight over the current screen's items", () => {
    const title = initialState(false);
    expect(moveMenu(title, 1).menuIndex).toBe(1);
    expect(moveMenu(title, -1).menuIndex).toBe(TITLE_ITEMS.length - 1);
    const paused = { ...title, screen: "paused" as const, menuIndex: 2 };
    expect(moveMenu(paused, 1).menuIndex).toBe(0);
  });

  it("leaves a screen with no menu alone", () => {
    const playing = { ...initialState(false), screen: "playing" as const };
    expect(moveMenu(playing, 1).menuIndex).toBe(0);
  });
});
