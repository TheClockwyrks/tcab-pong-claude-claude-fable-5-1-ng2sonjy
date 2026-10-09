import { describe, expect, it } from "vitest";
import { aiVelocity } from "./ai";
import {
  AI_DEADZONE,
  AI_HOME_DEADZONE,
  AI_HOME_Y,
  AI_REACT,
  AI_SPEED,
} from "./constants";
import type { CaromState } from "./game";
import { initialState, parkedBall } from "./world";

const DT = 1 / 60;

function playing(patch: Partial<CaromState> = {}): CaromState {
  return { ...initialState(false), screen: "playing", ...patch };
}

function withBall(
  state: CaromState,
  x: number,
  y: number,
  vx: number,
  vy: number,
): CaromState {
  return { ...state, ball: { ...parkedBall(), held: false, x, y, vx, vy } };
}

function withRightPaddle(state: CaromState, cy: number): CaromState {
  return {
    ...state,
    paddles: { ...state.paddles, right: { ...state.paddles.right, cy } },
  };
}

describe("aiVelocity", () => {
  it("rests at home inside the home deadzone", () => {
    const s = withRightPaddle(playing(), AI_HOME_Y + AI_HOME_DEADZONE);
    expect(aiVelocity(s, DT)).toBe(0);
  });

  it("returns home at top speed from far away", () => {
    const s = withRightPaddle(playing(), 100);
    expect(aiVelocity(s, DT)).toBe(AI_SPEED);
    const t = withRightPaddle(playing(), 600);
    expect(aiVelocity(t, DT)).toBe(-AI_SPEED);
  });

  it("slows to reach a close target in one frame", () => {
    const s = withRightPaddle(playing(), AI_HOME_Y - 20);
    expect(aiVelocity(s, 0.1)).toBeCloseTo(200);
    expect(aiVelocity(s, DT)).toBe(AI_SPEED);
  });

  it("tracks a ball moving toward it with reaction lag", () => {
    const s = withBall(playing(), 800, 500, 400, 100);
    const target = 500 - 100 * AI_REACT;
    expect(aiVelocity(s, DT)).toBe(
      Math.sign(target - AI_HOME_Y) *
        Math.min(AI_SPEED, Math.abs(target - AI_HOME_Y) / DT),
    );
  });

  it("uses the defending deadzone while tracking", () => {
    const s = withRightPaddle(
      withBall(playing(), 800, 360 + AI_DEADZONE, 400, 0),
      360,
    );
    expect(aiVelocity(s, DT)).toBe(0);
    const t = withRightPaddle(
      withBall(playing(), 800, 360 + AI_DEADZONE + 1, 400, 0),
      360,
    );
    expect(aiVelocity(t, DT)).toBeGreaterThan(0);
  });

  it("goes home while the ball travels away", () => {
    const s = withRightPaddle(withBall(playing(), 800, 100, -400, 0), 100);
    expect(aiVelocity(s, DT)).toBe(AI_SPEED);
  });

  it("goes home on the countdown and with no ball", () => {
    const s = withRightPaddle(
      withBall(playing({ screen: "countdown" }), 800, 100, 400, 0),
      100,
    );
    expect(aiVelocity(s, DT)).toBe(AI_SPEED);
    const t = withRightPaddle(playing({ ball: null }), 100);
    expect(aiVelocity(t, DT)).toBe(AI_SPEED);
  });

  it("ignores the ball with tracking off", () => {
    const s = withRightPaddle(
      withBall(
        playing({ ai: { tracking: false, movement: true } }),
        800,
        100,
        400,
        0,
      ),
      AI_HOME_Y,
    );
    expect(aiVelocity(s, DT)).toBe(0);
  });

  it("stands still with movement off", () => {
    const s = withRightPaddle(
      withBall(
        playing({ ai: { tracking: true, movement: false } }),
        800,
        100,
        400,
        0,
      ),
      600,
    );
    expect(aiVelocity(s, DT)).toBe(0);
  });
});
