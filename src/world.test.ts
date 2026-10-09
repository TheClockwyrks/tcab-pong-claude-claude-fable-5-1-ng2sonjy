import { describe, expect, it } from "vitest";
import { FIELD_CX, FIELD_CY, HOLD_TIME, OBSTACLE_CENTERS } from "./constants";
import {
  allObstacles,
  drawServeSign,
  initialState,
  obstacleAt,
  parkedBall,
  restingPaddle,
  returnToTitle,
  startMatch,
} from "./world";

describe("drawServeSign", () => {
  it("draws both signs over a run", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 200 && seen.size < 2; i++) seen.add(drawServeSign());
    expect([...seen].sort()).toEqual([-1, 1]);
  });
});

describe("parkedBall", () => {
  it("waits at the home point with a full hold and no trail", () => {
    const b = parkedBall();
    expect(b).toMatchObject({
      x: FIELD_CX,
      y: FIELD_CY,
      vx: 0,
      vy: 0,
      spin: 0,
      held: true,
      holdTimer: HOLD_TIME,
      trail: [],
    });
    expect([1, -1]).toContain(b.serveSign);
  });
});

describe("obstacles", () => {
  it("places each obstacle at its fixed center, in order", () => {
    expect(allObstacles()).toEqual(
      OBSTACLE_CENTERS.map((c, index) => ({ index, cx: c.x, cy: c.y })),
    );
    expect(obstacleAt(1)).toEqual({ index: 1, cx: 790, cy: 500 });
  });

  it("fails loudly for an index naming no obstacle", () => {
    expect(() => obstacleAt(2)).toThrow(/names no obstacle/);
    expect(() => obstacleAt(-1)).toThrow(/names no obstacle/);
    expect(() => obstacleAt(0.5)).toThrow(/names no obstacle/);
  });
});

describe("initialState", () => {
  it("opens on the title screen with the specified values", () => {
    const s = initialState(true);
    expect(s).toMatchObject({
      screen: "title",
      mode: "solo",
      menuIndex: 0,
      titleIndex: 0,
      resumeScreen: "playing",
      score: { p1: 0, p2: 0 },
      winner: null,
      receiver: "left",
      ai: { tracking: true, movement: true },
      simTime: 0,
      muted: true,
      menuPresses: [],
    });
    expect(s.paddles.left).toEqual(restingPaddle());
    expect(s.paddles.right).toEqual(restingPaddle());
    expect(s.ball?.held).toBe(true);
    expect(s.obstacles).toHaveLength(2);
  });
});

describe("startMatch", () => {
  it("starts the countdown with everything cleared and the mode set", () => {
    const before = {
      ...initialState(false),
      screen: "matchover" as const,
      score: { p1: 11, p2: 3 },
      winner: "left" as const,
      receiver: "right" as const,
      titleIndex: 2,
      simTime: 40,
      menuIndex: 1,
      paddles: {
        left: { cy: 100, vy: 5, driven: true, drivenVy: 30 },
        right: { cy: 600, vy: -5, driven: false, drivenVy: 0 },
      },
      ball: null,
    };
    const s = startMatch(before, "versus");
    expect(s).toMatchObject({
      mode: "versus",
      screen: "countdown",
      resumeScreen: "playing",
      menuIndex: 0,
      titleIndex: 2,
      score: { p1: 0, p2: 0 },
      winner: null,
      receiver: "left",
      simTime: 40,
    });
    expect(s.ball?.held).toBe(true);
    expect(s.ball?.holdTimer).toBe(HOLD_TIME);
    expect(s.paddles.left).toEqual({
      cy: FIELD_CY,
      vy: 0,
      driven: true,
      drivenVy: 30,
    });
    expect(s.paddles.right.cy).toBe(FIELD_CY);
  });
});

describe("returnToTitle", () => {
  it("restores the title state but keeps titleIndex, simTime, and muted", () => {
    const before = {
      ...initialState(true),
      screen: "paused" as const,
      mode: "versus" as const,
      score: { p1: 4, p2: 9 },
      titleIndex: 1,
      menuIndex: 2,
      simTime: 12.5,
      obstacles: [],
      ball: null,
      ai: { tracking: false, movement: false },
    };
    const s = returnToTitle(before);
    expect(s).toMatchObject({
      screen: "title",
      mode: "solo",
      menuIndex: 1,
      titleIndex: 1,
      simTime: 12.5,
      muted: true,
      score: { p1: 0, p2: 0 },
      ai: { tracking: true, movement: true },
    });
    expect(s.ball?.held).toBe(true);
    expect(s.obstacles).toHaveLength(2);
  });
});
