// Carom — building and rebuilding the world: the parked ball, the obstacles,
// the title-screen state, a match start, and the return to the title.

import type { DeepReadonly } from "ts-essentials";
import { FIELD_CX, FIELD_CY, HOLD_TIME, OBSTACLE_CENTERS } from "./constants";
import type {
  BallState,
  CaromState,
  Mode,
  ObstacleState,
  PaddleState,
} from "./game";

/** A fresh serve sign, `1` and `-1` each equally likely. */
export function drawServeSign(): 1 | -1 {
  return Math.random() < 0.5 ? 1 : -1;
}

/**
 * The ball parked at its home point: held, waiting the full hold, at rest, with
 * no spin, no trail, and a freshly drawn serve sign.
 */
export function parkedBall(): BallState {
  return {
    x: FIELD_CX,
    y: FIELD_CY,
    vx: 0,
    vy: 0,
    spin: 0,
    held: true,
    holdTimer: HOLD_TIME,
    serveSign: drawServeSign(),
    trail: [],
  };
}

/** Obstacle `index` at its fixed center. Throws for an index that names none. */
export function obstacleAt(index: number): ObstacleState {
  const center = OBSTACLE_CENTERS[index];
  if (!Number.isInteger(index) || center === undefined) {
    throw new Error(
      `Carom: obstacle index ${index} names no obstacle (valid: 0..${OBSTACLE_CENTERS.length - 1})`,
    );
  }
  return { index, cx: center.x, cy: center.y };
}

/** Both obstacles, in the order of `OBSTACLE_CENTERS`. */
export function allObstacles(): ObstacleState[] {
  return OBSTACLE_CENTERS.map((_, index) => obstacleAt(index));
}

/** A paddle at rest at the field center, under no driver. */
export function restingPaddle(): PaddleState {
  return { cy: FIELD_CY, vy: 0, driven: false, drivenVy: 0 };
}

/** The state the game opens on, with `muted` mirroring the runtime's bit. */
export function initialState(muted: boolean): CaromState {
  return {
    screen: "title",
    mode: "solo",
    menuIndex: 0,
    titleIndex: 0,
    resumeScreen: "playing",
    score: { p1: 0, p2: 0 },
    winner: null,
    paddles: { left: restingPaddle(), right: restingPaddle() },
    ai: { tracking: true, movement: true },
    receiver: "left",
    ball: parkedBall(),
    obstacles: allObstacles(),
    simTime: 0,
    muted,
    menuPresses: [],
  };
}

/**
 * Starts a match in `mode`: the countdown before the first serve, with the
 * scores cleared, the ball parked, and both paddles centered. `titleIndex`,
 * `simTime`, `muted`, the AI's faculties, and the paddles' drivers all keep
 * their values.
 */
export function startMatch(
  state: DeepReadonly<CaromState>,
  mode: Mode,
): CaromState {
  return {
    ...state,
    mode,
    screen: "countdown",
    resumeScreen: "playing",
    menuIndex: 0,
    score: { p1: 0, p2: 0 },
    winner: null,
    receiver: "left",
    ball: parkedBall(),
    paddles: {
      left: { ...state.paddles.left, cy: FIELD_CY, vy: 0 },
      right: { ...state.paddles.right, cy: FIELD_CY, vy: 0 },
    },
    menuPresses: [],
  };
}

/**
 * Returns to the title: every declared field goes back to its title-screen
 * value except `titleIndex`, `simTime`, and `muted`, which keep theirs, and
 * `menuIndex`, which becomes `titleIndex`.
 */
export function returnToTitle(state: DeepReadonly<CaromState>): CaromState {
  return {
    ...initialState(state.muted),
    titleIndex: state.titleIndex,
    menuIndex: state.titleIndex,
    simTime: state.simTime,
  };
}
