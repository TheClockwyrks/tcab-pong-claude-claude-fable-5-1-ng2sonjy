import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CAROM_DEBUG_VERSION,
  FIELD_CX,
  FIELD_CY,
  HOLD_TIME,
  OBSTACLE_CENTERS,
  TITLE_ITEMS,
} from "./constants";
import { createHarness, type Harness } from "./harness.test-support";

let h: Harness;

beforeEach(async () => {
  h = await createHarness();
});

afterEach(() => {
  h.destroy();
});

const snap = () => h.debug.snapshot(h.engine.state);

describe("the surface", () => {
  it("carries the version as a plain number", () => {
    expect(h.debug.version).toBe(CAROM_DEBUG_VERSION);
    expect(snap().version).toBe(1);
  });

  it("is what the engine returns from engine.debug", () => {
    expect(h.engine.debug).toBe(h.debug);
  });
});

describe("the world", () => {
  it("clears the world and reports it empty", () => {
    h.pose((s) => h.debug.clearWorld(s));
    const s = snap();
    expect(s.ball).toBeNull();
    expect(s.obstacles).toEqual([]);
    expect(s.paddles.left.cy).toBe(FIELD_CY);
  });

  it("spawns the ball parked", () => {
    h.pose((s) => h.debug.clearWorld(s));
    h.pose((s) => h.debug.spawnBall(s));
    expect(snap().ball).toMatchObject({
      x: FIELD_CX,
      y: FIELD_CY,
      vx: 0,
      vy: 0,
      speed: 0,
      spin: 0,
      held: true,
      holdTimer: HOLD_TIME,
      trail: [],
    });
  });

  it("returns a present ball to its parked arrangement", () => {
    h.pose((s) => h.debug.setBallPosition(s, 100, 100));
    h.pose((s) => h.debug.setBallVelocity(s, 5, 5));
    h.pose((s) => h.debug.spawnBall(s));
    expect(snap().ball).toMatchObject({ x: FIELD_CX, y: FIELD_CY, vx: 0 });
  });

  it("spawns obstacles in OBSTACLE_CENTERS order whatever the call order", () => {
    h.pose((s) => h.debug.clearWorld(s));
    h.pose((s) => h.debug.spawnObstacle(s, 1));
    expect(snap().obstacles).toEqual([
      { index: 1, cx: OBSTACLE_CENTERS[1].x, cy: OBSTACLE_CENTERS[1].y },
    ]);
    h.pose((s) => h.debug.spawnObstacle(s, 0));
    expect(snap().obstacles.map((o) => o.index)).toEqual([0, 1]);
    h.pose((s) => h.debug.spawnObstacle(s, 0));
    expect(snap().obstacles).toHaveLength(2);
  });

  it("fails loudly for an obstacle index naming none", () => {
    expect(() => h.pose((s) => h.debug.spawnObstacle(s, 2))).toThrow();
  });

  it("resets to the title state but keeps the mute bit", async () => {
    h.pose((s) => h.debug.setMuted(s, true));
    h.pose((s) => h.debug.setScreen(s, "playing"));
    h.pose((s) => h.debug.setScore(s, 5, 6));
    h.pose((s) => h.debug.setPaddleDriven(s, "left", true));
    h.pose((s) => h.debug.setPaddleVy(s, "left", 40));
    h.pose((s) => h.debug.setAiTracking(s, false));
    h.pose((s) => h.debug.clearWorld(s));
    await h.advance(3);
    h.pose((s) => h.debug.reset(s));
    const s = snap();
    expect(s.screen).toBe("title");
    expect(s.score).toEqual({ p1: 0, p2: 0 });
    expect(s.paddles.left).toEqual({
      cy: FIELD_CY,
      vy: 0,
      drivenVy: 0,
      driven: false,
    });
    expect(s.ai).toEqual({ tracking: true, movement: true });
    expect(s.ball?.held).toBe(true);
    expect(s.obstacles).toHaveLength(2);
    expect(s.simTime).toBe(0);
    expect(s.muted).toBe(true);
  });

  it("reconciles to an equal state without advancing anything", async () => {
    h.pose((s) => h.debug.setScreen(s, "playing"));
    h.pose((s) => h.debug.setBallVelocity(s, 300, 400));
    const before = snap();
    h.pose((s) => h.debug.reconcile(s));
    expect(snap()).toEqual(before);
    expect(snap().ball?.speed).toBe(500);
    h.pose((s) => h.debug.reconcile(s));
    expect(snap()).toEqual(before);
  });
});

describe("screens and menus", () => {
  it("sets each field alone", () => {
    h.pose((s) => h.debug.setScreen(s, "paused"));
    h.pose((s) => h.debug.setMode(s, "versus"));
    h.pose((s) => h.debug.setMenuIndex(s, 2));
    h.pose((s) => h.debug.setTitleIndex(s, 1));
    h.pose((s) => h.debug.setResumeScreen(s, "countdown"));
    const s = snap();
    expect(s.screen).toBe("paused");
    expect(s.mode).toBe("versus");
    expect(s.menuIndex).toBe(2);
    expect(s.titleIndex).toBe(1);
    expect(s.resumeScreen).toBe("countdown");
    expect(s.score).toEqual({ p1: 0, p2: 0 });
    expect(s.obstacles).toHaveLength(2);
  });

  it("refuses a value outside the vocabulary", () => {
    expect(() => h.pose((s) => h.debug.setScreen(s, "lobby" as never))).toThrow(
      /screen/,
    );
    expect(() => h.pose((s) => h.debug.setMode(s, "coop" as never))).toThrow(
      /mode/,
    );
    expect(() =>
      h.pose((s) => h.debug.setResumeScreen(s, "title" as never)),
    ).toThrow(/resumeScreen/);
    expect(() => h.pose((s) => h.debug.setMenuIndex(s, "1" as never))).toThrow(
      /menuIndex/,
    );
  });

  it("behaves as the set screen from the next frame", async () => {
    h.pose((s) => h.debug.setScreen(s, "countdown"));
    await h.advanceSeconds(HOLD_TIME + 0.05);
    expect(snap().screen).toBe("playing");
    expect(snap().ball?.vx).toBeLessThan(0);
  });
});

describe("match state", () => {
  it("sets the scores, the winner, and the receiver", () => {
    h.pose((s) => h.debug.setScore(s, 7, 9));
    h.pose((s) => h.debug.setWinner(s, "right"));
    h.pose((s) => h.debug.setReceiver(s, "right"));
    expect(snap().score).toEqual({ p1: 7, p2: 9 });
    expect(snap().winner).toBe("right");
    expect(snap().receiver).toBe("right");
    h.pose((s) => h.debug.setWinner(s, null));
    expect(snap().winner).toBeNull();
    expect(() => h.pose((s) => h.debug.setWinner(s, "top" as never))).toThrow(
      /winner/,
    );
  });
});

describe("paddles", () => {
  it("sets cy, drivenVy, and driven for one side alone", () => {
    h.pose((s) => h.debug.setPaddleCy(s, "right", 123));
    h.pose((s) => h.debug.setPaddleVy(s, "right", -80));
    h.pose((s) => h.debug.setPaddleDriven(s, "right", true));
    const s = snap();
    expect(s.paddles.right).toEqual({
      cy: 123,
      vy: 0,
      drivenVy: -80,
      driven: true,
    });
    expect(s.paddles.left).toEqual({
      cy: FIELD_CY,
      vy: 0,
      drivenVy: 0,
      driven: false,
    });
  });

  it("reaches a cy the game's clamp would refuse", () => {
    h.pose((s) => h.debug.setPaddleCy(s, "left", -50));
    expect(snap().paddles.left.cy).toBe(-50);
  });

  it("refuses a side outside the vocabulary", () => {
    expect(() =>
      h.pose((s) => h.debug.setPaddleCy(s, "middle" as never, 1)),
    ).toThrow(/side/);
    expect(() =>
      h.pose((s) => h.debug.setPaddleDriven(s, "left", 1 as never)),
    ).toThrow(/driven/);
  });

  it("takes drivenVy into vy on the first driven frame", async () => {
    h.pose((s) => h.debug.setScreen(s, "playing"));
    h.pose((s) => h.debug.setPaddleVy(s, "right", 90));
    h.pose((s) => h.debug.setPaddleDriven(s, "right", true));
    await h.advance(1);
    expect(snap().paddles.right.vy).toBe(90);
    expect(snap().paddles.right.drivenVy).toBe(90);
    h.pose((s) => h.debug.setPaddleDriven(s, "right", false));
    await h.advance(1);
    expect(snap().paddles.right.drivenVy).toBe(90);
  });
});

describe("the ball", () => {
  it("sets each field alone and reports speed from the velocity", () => {
    h.pose((s) => h.debug.setBallPosition(s, 200, 300));
    h.pose((s) => h.debug.setBallVelocity(s, 30, 40));
    h.pose((s) => h.debug.setBallSpin(s, -250));
    h.pose((s) => h.debug.setBallHeld(s, false));
    h.pose((s) => h.debug.setBallHoldTimer(s, 0.25));
    h.pose((s) => h.debug.setBallServeSign(s, -1));
    expect(snap().ball).toMatchObject({
      x: 200,
      y: 300,
      vx: 30,
      vy: 40,
      speed: 50,
      spin: -250,
      held: false,
      holdTimer: 0.25,
      serveSign: -1,
    });
  });

  it("draws the serve sign afresh and changes nothing else", () => {
    h.pose((s) => h.debug.setBallPosition(s, 200, 300));
    const seen = new Set<number>();
    for (let i = 0; i < 100 && seen.size < 2; i++) {
      h.pose((s) => h.debug.drawBallServeSign(s));
      seen.add(snap().ball?.serveSign ?? 0);
    }
    expect([...seen].sort()).toEqual([-1, 1]);
    expect(snap().ball?.x).toBe(200);
  });

  it("fails loudly while the field carries no ball", () => {
    h.pose((s) => h.debug.clearWorld(s));
    const poses = [
      (s: Parameters<typeof h.debug.setBallPosition>[0]) =>
        h.debug.setBallPosition(s, 1, 2),
      (s: Parameters<typeof h.debug.setBallVelocity>[0]) =>
        h.debug.setBallVelocity(s, 1, 2),
      (s: Parameters<typeof h.debug.setBallSpin>[0]) =>
        h.debug.setBallSpin(s, 1),
      (s: Parameters<typeof h.debug.setBallHeld>[0]) =>
        h.debug.setBallHeld(s, true),
      (s: Parameters<typeof h.debug.setBallHoldTimer>[0]) =>
        h.debug.setBallHoldTimer(s, 1),
      (s: Parameters<typeof h.debug.setBallServeSign>[0]) =>
        h.debug.setBallServeSign(s, 1),
      (s: Parameters<typeof h.debug.drawBallServeSign>[0]) =>
        h.debug.drawBallServeSign(s),
    ];
    for (const pose of poses) {
      expect(() => h.pose(pose)).toThrow(/no ball/);
    }
    expect(snap().ball).toBeNull();
  });

  it("refuses a serve sign outside 1 and -1", () => {
    expect(() =>
      h.pose((s) => h.debug.setBallServeSign(s, 0 as never)),
    ).toThrow(/serveSign/);
    expect(() => h.pose((s) => h.debug.setBallSpin(s, Number.NaN))).toThrow(
      /spin/,
    );
  });
});

describe("the AI and audio", () => {
  it("gates each faculty on its own", () => {
    h.pose((s) => h.debug.setAiTracking(s, false));
    expect(snap().ai).toEqual({ tracking: false, movement: true });
    h.pose((s) => h.debug.setAiMovement(s, false));
    expect(snap().ai).toEqual({ tracking: false, movement: false });
    expect(() =>
      h.pose((s) => h.debug.setAiMovement(s, "no" as never)),
    ).toThrow(/movement/);
  });

  it("sets the mute bit", () => {
    h.pose((s) => h.debug.setMuted(s, true));
    expect(snap().muted).toBe(true);
    expect(() => h.pose((s) => h.debug.setMuted(s, 1 as never))).toThrow(
      /muted/,
    );
  });
});

describe("readings", () => {
  it("reports the whole declared state and copies of its arrays", () => {
    const s = snap();
    expect(Object.keys(s).sort()).toEqual(
      [
        "version",
        "screen",
        "mode",
        "menuIndex",
        "titleIndex",
        "resumeScreen",
        "score",
        "winner",
        "muted",
        "paddles",
        "ai",
        "receiver",
        "ball",
        "obstacles",
        "simTime",
      ].sort(),
    );
    expect(s.ball?.trail).not.toBe(h.engine.state.ball?.trail);
    expect(s.obstacles).not.toBe(h.engine.state.obstacles);
  });

  it("reports menu item regions on menu screens only", () => {
    expect(h.debug.menuItemRect(h.engine.state, 0)).toMatchObject({
      w: expect.any(Number),
      h: expect.any(Number),
    });
    expect(h.debug.menuItemRect(h.engine.state, TITLE_ITEMS.length)).toBeNull();
    h.pose((s) => h.debug.setScreen(s, "playing"));
    expect(h.debug.menuItemRect(h.engine.state, 0)).toBeNull();
    h.pose((s) => h.debug.setScreen(s, "countdown"));
    expect(h.debug.menuItemRect(h.engine.state, 0)).toBeNull();
    h.pose((s) => h.debug.setScreen(s, "howto"));
    expect(h.debug.menuItemRect(h.engine.state, 0)).not.toBeNull();
    expect(h.debug.menuItemRect(h.engine.state, 1)).toBeNull();
  });
});
