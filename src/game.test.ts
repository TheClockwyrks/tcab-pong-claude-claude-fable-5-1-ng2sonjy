import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConstantClock, JitterClock } from "@clockwyrks/simple-2d";
import { ACTIONS, CUES, HOLD_TIME, OBSTACLE_CENTERS } from "./constants";
import { BACKGROUND } from "./game";
import { createHarness, type Harness } from "./harness.test-support";

let h: Harness;

beforeEach(async () => {
  h = await createHarness();
});

afterEach(() => {
  h.destroy();
});

describe("initialize", () => {
  it("exports a CSS color as the background", () => {
    expect(BACKGROUND).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("registers every action so each key moves something", async () => {
    for (const action of ACTIONS) expect(typeof action).toBe("string");
    // A registered action reports a value; an unregistered one would stay 0.
    h.pose((s) => h.debug.setScreen(s, "playing"));
    h.pose((s) => h.debug.setMode(s, "versus"));
    h.keyDown("ArrowDown");
    await h.advance(1);
    h.keyUp("ArrowDown");
    expect(h.engine.state.paddles.right.vy).toBeGreaterThan(0);
  });

  it("defines every cue", async () => {
    // Playing a cue that was never defined throws inside update, which
    // `advance` would reject with; a score drives all four over a rally.
    h.pose((s) => h.debug.setScreen(s, "playing"));
    h.pose((s) => h.debug.setBallHeld(s, false));
    h.pose((s) => h.debug.setBallPosition(s, 470, 220));
    h.pose((s) => h.debug.setBallVelocity(s, 700, -700));
    await h.advance(2);
    expect(h.cues).toContain(CUES.obstacleBounce);
    h.pose((s) => h.debug.setBallPosition(s, 5, 100));
    h.pose((s) => h.debug.setBallVelocity(s, -900, 0));
    await h.advance(3);
    expect(h.cues).toContain(CUES.score);
  });

  it("registers diagnostic sources that read the current state", async () => {
    const names = h.engine.diagnostics().map((d) => d.name);
    for (const name of [
      "screen",
      "mode",
      "score",
      "ball pos",
      "ball vel",
      "ball speed",
      "ball spin",
      "left paddle",
      "right paddle",
    ]) {
      expect(names).toContain(name);
    }
    const read = (name: string) =>
      h.engine.diagnostics().find((d) => d.name === name)?.value;
    expect(read("screen")).toBe("title");
    h.pose((s) => h.debug.setScreen(s, "playing"));
    h.pose((s) => h.debug.setScore(s, 2, 3));
    h.pose((s) => h.debug.setBallVelocity(s, 3, 4));
    expect(read("screen")).toBe("playing");
    expect(read("score")).toBe("2 - 3");
    expect(read("ball speed")).toBe("5.0");
    h.pose((s) => h.debug.clearWorld(s));
    expect(read("ball pos")).toBe("none");
    expect(read("ball vel")).toBe("none");
    expect(read("ball speed")).toBe("none");
    expect(read("ball spin")).toBe("none");
    for (const reading of h.engine.diagnostics()) {
      expect(reading.error).toBeUndefined();
    }
  });
});

describe("delta-time independence", () => {
  /**
   * Drives one scripted rally: the left paddle held driven to meet the ball,
   * the AI off, the ball served toward the left and returned twice. Reports
   * what the rally reached, however the time was divided.
   */
  async function rally(stepMs: number) {
    const harness = await createHarness({ clock: new ConstantClock(stepMs) });
    const { debug } = harness;
    harness.pose((s) => debug.setMode(s, "solo"));
    harness.pose((s) => debug.setAiMovement(s, false));
    harness.pose((s) => debug.setScreen(s, "countdown"));
    harness.pose((s) => debug.setBallServeSign(s, 1));
    harness.pose((s) => debug.setPaddleDriven(s, "left", true));
    harness.pose((s) => debug.setPaddleDriven(s, "right", true));
    let hits = 0;
    let walls = 0;
    harness.engine.events.on("cue:played", (e) => {
      if (e.cue === CUES.paddleHit) hits++;
      if (e.cue === CUES.wallBounce) walls++;
    });
    const frames = Math.ceil(8000 / stepMs);
    for (let i = 0; i < frames && hits < 2; i++) {
      // Each paddle drifts toward the ball's height, carrying spin into it.
      const { ball, paddles } = harness.engine.state;
      const chase = (cy: number, speed: number) =>
        ball === null ? 0 : Math.sign(ball.y - cy) * speed;
      harness.pose((s) =>
        debug.setPaddleVy(s, "left", chase(paddles.left.cy, 120)),
      );
      harness.pose((s) =>
        debug.setPaddleVy(s, "right", chase(paddles.right.cy, 200)),
      );
      await harness.advance(1);
    }
    const s = debug.snapshot(harness.engine.state);
    harness.destroy();
    return { hits, walls, ball: s.ball, simTime: s.simTime };
  }

  it("reaches the same rally under 2 ms and 16 ms frames", async () => {
    const fine = await rally(2);
    const coarse = await rally(16);
    expect(fine.hits).toBe(2);
    expect(coarse.hits).toBe(2);
    expect(fine.walls).toBe(coarse.walls);
    expect(fine.ball).not.toBeNull();
    expect(coarse.ball).not.toBeNull();
    if (fine.ball === null || coarse.ball === null) return;
    expect(Math.abs(fine.ball.speed - coarse.ball.speed)).toBeLessThan(10);
    expect(Math.sign(fine.ball.vx)).toBe(Math.sign(coarse.ball.vx));
    const level = (vy: number) => (Math.abs(vy) < 120 ? 0 : Math.sign(vy));
    expect(level(fine.ball.vy)).toBe(level(coarse.ball.vy));
    expect(Math.abs(fine.simTime - coarse.simTime) / fine.simTime).toBeLessThan(
      0.08,
    );
  }, 20000);

  it("runs under a jittered clock", async () => {
    const harness = await createHarness({ clock: new JitterClock(2, 16, 7) });
    harness.pose((s) => harness.debug.setScreen(s, "countdown"));
    await harness.advance(400);
    const s = harness.debug.snapshot(harness.engine.state);
    expect(s.screen).not.toBe("countdown");
    expect(s.simTime).toBeGreaterThan(HOLD_TIME);
    expect(s.obstacles).toHaveLength(OBSTACLE_CENTERS.length);
    harness.destroy();
  });
});
