// Carom — the debug and automation surface (specs/instrumentation.md). Every
// operation is a pose or a reading in the shape of `update`: it takes the
// current state, read-only, and returns the next state or what it read.

import type { DeepReadonly } from "ts-essentials";
import { CAROM_DEBUG_VERSION } from "./constants";
import type {
  BallState,
  CaromDebugApi,
  CaromSnapshot,
  CaromState,
  Mode,
  PaddleState,
  Screen,
  Side,
} from "./game";
import { menuItemRect } from "./menu";
import {
  allObstacles,
  drawServeSign,
  initialState,
  obstacleAt,
  parkedBall,
} from "./world";

type S = DeepReadonly<CaromState>;

const SCREENS: readonly Screen[] = [
  "title",
  "howto",
  "countdown",
  "playing",
  "paused",
  "matchover",
];
const MODES: readonly Mode[] = ["solo", "versus"];
const SIDES: readonly Side[] = ["left", "right"];
const RESUME_SCREENS: readonly ("countdown" | "playing")[] = [
  "countdown",
  "playing",
];

function expectOneOf<T>(
  what: string,
  value: unknown,
  allowed: readonly T[],
): T {
  if (!allowed.includes(value as T)) {
    throw new Error(
      `Carom: ${what} must be one of ${allowed.map(String).join(", ")}, got ${String(value)}`,
    );
  }
  return value as T;
}

function expectNumber(what: string, value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`Carom: ${what} must be a number, got ${String(value)}`);
  }
  return value;
}

function expectBoolean(what: string, value: unknown): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`Carom: ${what} must be a boolean, got ${String(value)}`);
  }
  return value;
}

/** The ball, or a loud failure while the field carries none. */
function requireBall(state: S): DeepReadonly<BallState> {
  if (state.ball === null) {
    throw new Error("Carom: no ball is on the field to pose");
  }
  return state.ball;
}

function withBall(state: S, patch: Partial<BallState>): CaromState {
  return { ...state, ball: { ...requireBall(state), ...patch } };
}

function withPaddle(
  state: S,
  side: Side,
  patch: Partial<PaddleState>,
): CaromState {
  expectOneOf("side", side, SIDES);
  return {
    ...state,
    paddles: { ...state.paddles, [side]: { ...state.paddles[side], ...patch } },
  };
}

function snapshot(state: S): CaromSnapshot {
  const ball = state.ball;
  return {
    version: CAROM_DEBUG_VERSION,
    screen: state.screen,
    mode: state.mode,
    menuIndex: state.menuIndex,
    titleIndex: state.titleIndex,
    resumeScreen: state.resumeScreen,
    score: { p1: state.score.p1, p2: state.score.p2 },
    winner: state.winner,
    muted: state.muted,
    paddles: {
      left: { ...state.paddles.left },
      right: { ...state.paddles.right },
    },
    ai: { ...state.ai },
    receiver: state.receiver,
    ball:
      ball === null
        ? null
        : {
            x: ball.x,
            y: ball.y,
            vx: ball.vx,
            vy: ball.vy,
            speed: Math.hypot(ball.vx, ball.vy),
            spin: ball.spin,
            held: ball.held,
            holdTimer: ball.holdTimer,
            serveSign: ball.serveSign,
            trail: ball.trail.map((s) => ({ ...s })),
          },
    obstacles: state.obstacles.map((o) => ({ ...o })),
    simTime: state.simTime,
  };
}

/** Builds the surface. It holds nothing: every call works from the state given. */
export function createDebugApi(): CaromDebugApi {
  return {
    version: CAROM_DEBUG_VERSION,

    clearWorld: (s) => ({ ...s, ball: null, obstacles: [] }),
    spawnBall: (s) => ({ ...s, ball: parkedBall() }),
    spawnObstacle: (s, index) => {
      // Placing one keeps the field in `OBSTACLE_CENTERS` order, and placing
      // one already present returns it to its fixed center.
      const present = new Set(s.obstacles.map((o) => o.index));
      present.add(obstacleAt(index).index);
      return {
        ...s,
        obstacles: allObstacles().filter((o) => present.has(o.index)),
      };
    },
    reset: (s) => initialState(s.muted),
    // Every reading is worked out at the read, so there is nothing to bring
    // into agreement: the state comes back as it was.
    reconcile: (s) => ({ ...s }),

    setScreen: (s, screen) => ({
      ...s,
      screen: expectOneOf("screen", screen, SCREENS),
    }),
    setMode: (s, mode) => ({ ...s, mode: expectOneOf("mode", mode, MODES) }),
    setMenuIndex: (s, index) => ({
      ...s,
      menuIndex: expectNumber("menuIndex", index),
    }),
    setTitleIndex: (s, index) => ({
      ...s,
      titleIndex: expectNumber("titleIndex", index),
    }),
    setResumeScreen: (s, screen) => ({
      ...s,
      resumeScreen: expectOneOf("resumeScreen", screen, RESUME_SCREENS),
    }),

    setScore: (s, p1, p2) => ({
      ...s,
      score: { p1: expectNumber("p1", p1), p2: expectNumber("p2", p2) },
    }),
    setWinner: (s, side) => ({
      ...s,
      winner: side === null ? null : expectOneOf("winner", side, SIDES),
    }),
    setReceiver: (s, side) => ({
      ...s,
      receiver: expectOneOf("receiver", side, SIDES),
    }),

    setPaddleCy: (s, side, cy) =>
      withPaddle(s, side, { cy: expectNumber("cy", cy) }),
    setPaddleVy: (s, side, vy) =>
      withPaddle(s, side, { drivenVy: expectNumber("vy", vy) }),
    setPaddleDriven: (s, side, driven) =>
      withPaddle(s, side, { driven: expectBoolean("driven", driven) }),

    setBallPosition: (s, x, y) =>
      withBall(s, { x: expectNumber("x", x), y: expectNumber("y", y) }),
    setBallVelocity: (s, vx, vy) =>
      withBall(s, { vx: expectNumber("vx", vx), vy: expectNumber("vy", vy) }),
    setBallSpin: (s, spin) => withBall(s, { spin: expectNumber("spin", spin) }),
    setBallHeld: (s, held) =>
      withBall(s, { held: expectBoolean("held", held) }),
    setBallHoldTimer: (s, seconds) =>
      withBall(s, { holdTimer: expectNumber("holdTimer", seconds) }),
    setBallServeSign: (s, sign) =>
      withBall(s, { serveSign: expectOneOf("serveSign", sign, [1, -1]) }),
    drawBallServeSign: (s) => withBall(s, { serveSign: drawServeSign() }),

    setAiTracking: (s, enabled) => ({
      ...s,
      ai: { ...s.ai, tracking: expectBoolean("tracking", enabled) },
    }),
    setAiMovement: (s, enabled) => ({
      ...s,
      ai: { ...s.ai, movement: expectBoolean("movement", enabled) },
    }),

    setMuted: (s, muted) => ({ ...s, muted: expectBoolean("muted", muted) }),

    snapshot,
    menuItemRect: (s, index) => menuItemRect(s.screen, index),
  };
}
