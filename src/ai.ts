// Carom — the AI opponent (specs/modes/single-player.md). It holds no state of
// its own: each frame it computes a velocity for the right paddle from the
// state it is handed, and the paddle is then integrated like any other.

import type { DeepReadonly } from "ts-essentials";
import {
  AI_DEADZONE,
  AI_HOME_DEADZONE,
  AI_HOME_Y,
  AI_REACT,
  AI_SPEED,
} from "./constants";
import type { CaromState } from "./game";

/**
 * The velocity the AI drives its paddle at this frame, in units per second.
 * With tracking off the target is home; with movement off the paddle stands
 * still.
 */
export function aiVelocity(
  state: DeepReadonly<CaromState>,
  dt: number,
): number {
  if (!state.ai.movement) return 0;

  let target = AI_HOME_Y;
  let deadzone = AI_HOME_DEADZONE;
  const ball = state.ball;
  if (
    state.ai.tracking &&
    state.screen === "playing" &&
    ball !== null &&
    ball.vx > 0
  ) {
    target = ball.y - ball.vy * AI_REACT;
    deadzone = AI_DEADZONE;
  }

  const diff = target - state.paddles.right.cy;
  if (Math.abs(diff) <= deadzone) return 0;
  return Math.sign(diff) * Math.min(AI_SPEED, Math.abs(diff) / dt);
}
