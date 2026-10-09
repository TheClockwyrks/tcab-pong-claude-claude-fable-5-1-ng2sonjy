import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { FIELD_H, FIELD_W, HOLD_TIME } from "./constants";
import type { CaromState, Screen } from "./game";
import { createHarness, type Harness } from "./harness.test-support";
import { COLORS, renderGame } from "./render";
import { initialState, parkedBall } from "./world";

let h: Harness;

beforeEach(async () => {
  h = await createHarness();
});

afterEach(() => {
  h.destroy();
});

/** Counts the pixels of the harness canvas that differ from the background. */
function litPixels(canvas: Harness["canvas"]): number {
  const ctx = canvas.getContext("2d");
  const { data } = ctx.getImageData(0, 0, FIELD_W, FIELD_H);
  const [br, bg, bb] = [11, 14, 23]; // BACKGROUND, #0b0e17
  let lit = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (
      Math.abs(data[i] - br) > 8 ||
      Math.abs(data[i + 1] - bg) > 8 ||
      Math.abs(data[i + 2] - bb) > 8
    ) {
      lit++;
    }
  }
  return lit;
}

/** Whether any pixel near `(x, y)` is close to `hex`. */
function hasColorNear(
  canvas: Harness["canvas"],
  x: number,
  y: number,
  hex: string,
): boolean {
  const ctx = canvas.getContext("2d");
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const { data } = ctx.getImageData(x - 4, y - 4, 9, 9);
  for (let i = 0; i < data.length; i += 4) {
    if (
      Math.abs(data[i] - r) < 24 &&
      Math.abs(data[i + 1] - g) < 24 &&
      Math.abs(data[i + 2] - b) < 24
    ) {
      return true;
    }
  }
  return false;
}

const SCREENS: readonly Screen[] = [
  "title",
  "howto",
  "countdown",
  "playing",
  "paused",
  "matchover",
];

describe("renderGame", () => {
  it.each(SCREENS)("draws the %s screen", async (screen) => {
    h.pose((s) => h.debug.setScreen(s, screen));
    await h.advance(1);
    expect(litPixels(h.canvas)).toBeGreaterThan(2000);
  });

  it("draws the paddles, the ball, and the obstacles in their colors", async () => {
    h.pose((s) => h.debug.setScreen(s, "playing"));
    h.pose((s) => h.debug.setBallHeld(s, false));
    await h.advance(1);
    const s = h.engine.state;
    expect(hasColorNear(h.canvas, 56, s.paddles.left.cy, COLORS.left)).toBe(
      true,
    );
    expect(hasColorNear(h.canvas, 1224, s.paddles.right.cy, COLORS.right)).toBe(
      true,
    );
    expect(hasColorNear(h.canvas, 490, 220, COLORS.obstacle)).toBe(true);
    expect(hasColorNear(h.canvas, 790, 500, COLORS.obstacle)).toBe(true);
    expect(hasColorNear(h.canvas, 640, 360, COLORS.ball)).toBe(true);
  });

  it("draws nothing where an absent ball and obstacle would be", async () => {
    h.pose((s) => h.debug.setScreen(s, "playing"));
    h.pose((s) => h.debug.clearWorld(s));
    await h.advance(1);
    expect(hasColorNear(h.canvas, 490, 220, COLORS.obstacle)).toBe(false);
    expect(hasColorNear(h.canvas, 640, 360, COLORS.ball)).toBe(false);
  });

  it("draws a trail behind a moving ball", async () => {
    h.pose((s) => h.debug.setScreen(s, "countdown"));
    await h.advanceSeconds(HOLD_TIME + 0.2);
    const ball = h.engine.state.ball;
    expect(ball).not.toBeNull();
    if (ball === null) return;
    expect(ball.trail.length).toBeGreaterThan(3);
    const oldest = ball.trail[0];
    const mid = ball.trail[Math.floor(ball.trail.length / 2)];
    const mx = (oldest.x + mid.x) / 2;
    const my = (oldest.y + mid.y) / 2;
    // The trail is translucent, so look for anything lit over the background.
    const ctx = h.canvas.getContext("2d");
    const { data } = ctx.getImageData(
      Math.round(mx) - 6,
      Math.round(my) - 6,
      13,
      13,
    );
    let lit = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] + data[i + 1] + data[i + 2] > 180) lit++;
    }
    expect(lit).toBeGreaterThan(0);
  });

  it("draws the match-over copy for either winner and for none", () => {
    const canvas = createCanvas(FIELD_W, FIELD_H);
    const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;
    const base: CaromState = {
      ...initialState(false),
      screen: "matchover",
      score: { p1: 11, p2: 4 },
    };
    const variants: CaromState[] = [
      { ...base, winner: "left", mode: "solo" },
      { ...base, winner: "right", mode: "solo" },
      { ...base, winner: "left", mode: "versus" },
      { ...base, winner: "right", mode: "versus" },
      { ...base, winner: null },
      { ...base, screen: "countdown", ball: null },
      { ...base, screen: "countdown", receiver: "right" },
      {
        ...base,
        screen: "playing",
        ball: { ...parkedBall(), trail: [{ x: 1, y: 1, t: 0 }] },
      },
    ];
    for (const state of variants) {
      expect(() => renderGame(state, ctx)).not.toThrow();
    }
  });

  it("records its drawing through the engine's recorder", async () => {
    h.pose((s) => h.debug.setScreen(s, "playing"));
    h.engine.startRecording();
    await h.advance(3);
    const recording = h.engine.stopRecording();
    expect(recording.frames).toHaveLength(3);
    expect(recording.width).toBe(FIELD_W);
    expect(recording.ops.length).toBeGreaterThan(10);
  });
});
