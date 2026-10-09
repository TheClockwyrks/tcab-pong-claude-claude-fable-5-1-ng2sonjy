// Carom — the physics: paddle integration, the ball's sub-stepped flight, and
// every collision the field resolves (specs/playfield.md, specs/balls.md).
//
// Everything here is a pure function over plain values, so the simulation can
// be stepped and checked without an engine, a canvas, or a clock.

import type { DeepReadonly } from "ts-essentials";
import {
  BALL_R,
  FIELD_H,
  FIELD_W,
  MAX_BOUNCE_ANGLE,
  MAX_SUBSTEP,
  OBSTACLES,
  P1_X0,
  P1_X1,
  P2_X0,
  P2_X1,
  PADDLE_HALF,
  PADDLE_MAX_CY,
  PADDLE_MIN_CY,
  SPEED_CAP,
  SPEED_MULT,
  SPIN_CLAMP,
  SPIN_FROM_PADDLE,
  SPIN_HALFLIFE,
} from "./constants";
import type { Rect } from "./constants";
import type { BallState, ObstacleState, PaddleState, Side } from "./game";

export function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

// ---- Paddles ---------------------------------------------------------------

/**
 * Moves a paddle at `vy` for `dt` seconds and clamps it to the field. The
 * returned `vy` is the paddle's actual velocity for the frame: where the clamp
 * shortened the move, the velocity is shortened to match, so a paddle pinned
 * against a bound carries `vy = 0`.
 */
export function integratePaddle(
  paddle: PaddleState,
  vy: number,
  dt: number,
): PaddleState {
  const unclamped = paddle.cy + vy * dt;
  const next = clamp(unclamped, PADDLE_MIN_CY, PADDLE_MAX_CY);
  const actualVy = next !== unclamped && dt > 0 ? (next - paddle.cy) / dt : vy;
  return { ...paddle, cy: next, vy: actualVy };
}

/** The axis-aligned rectangle a paddle occupies. */
export function paddleRect(side: Side, cy: number): Rect {
  return {
    x0: side === "left" ? P1_X0 : P2_X0,
    x1: side === "left" ? P1_X1 : P2_X1,
    y0: cy - PADDLE_HALF,
    y1: cy + PADDLE_HALF,
  };
}

// ---- Circle against an axis-aligned rectangle ------------------------------

export type Face = "left" | "right" | "top" | "bottom";

export interface Contact {
  readonly face: Face;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
}

/**
 * Resolves a ball of radius `BALL_R` at `(x, y)` moving at `(vx, vy)` against
 * `rect`, or returns `null` when the ball does not overlap it. The struck face
 * is the one of least penetration (left, right, top, bottom winning ties in
 * that order); the ball is placed off that face and the velocity component
 * into the face is reversed.
 */
export function resolveCircleRect(
  x: number,
  y: number,
  vx: number,
  vy: number,
  rect: Rect,
): Contact | null {
  const x0 = rect.x0 - BALL_R;
  const x1 = rect.x1 + BALL_R;
  const y0 = rect.y0 - BALL_R;
  const y1 = rect.y1 + BALL_R;
  if (!(x > x0 && x < x1 && y > y0 && y < y1)) return null;

  const depths: readonly [Face, number][] = [
    ["left", x - x0],
    ["right", x1 - x],
    ["top", y - y0],
    ["bottom", y1 - y],
  ];
  let face: Face = "left";
  let least = Infinity;
  for (const [candidate, depth] of depths) {
    if (depth < least) {
      least = depth;
      face = candidate;
    }
  }

  switch (face) {
    case "left":
      return { face, x: x0, y, vx: vx > 0 ? -vx : vx, vy };
    case "right":
      return { face, x: x1, y, vx: vx < 0 ? -vx : vx, vy };
    case "top":
      return { face, x, y: y0, vx, vy: vy > 0 ? -vy : vy };
    case "bottom":
      return { face, x, y: y1, vx, vy: vy < 0 ? -vy : vy };
  }
}

// ---- The ball's flight -----------------------------------------------------

/** What a frame of flight raised, each once however many sub-steps raised it. */
export interface BallEvents {
  paddleHit: boolean;
  wallBounce: boolean;
  obstacleBounce: boolean;
}

interface Flight {
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
}

/** Turns the velocity by the spin, then decays the spin, over `h` seconds. */
function applySpin(b: Flight, h: number): void {
  const speed = Math.hypot(b.vx, b.vy);
  if (speed > 0) {
    const angle = (b.spin / speed) * h;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const vx = b.vx * cos - b.vy * sin;
    const vy = b.vx * sin + b.vy * cos;
    b.vx = vx;
    b.vy = vy;
  }
  b.spin *= Math.pow(0.5, h / SPIN_HALFLIFE);
}

function resolveWalls(b: Flight, events: BallEvents): void {
  if (b.y - BALL_R < 0 && b.vy < 0) {
    b.y = BALL_R;
    b.vy = -b.vy;
    events.wallBounce = true;
  } else if (b.y + BALL_R > FIELD_H && b.vy > 0) {
    b.y = FIELD_H - BALL_R;
    b.vy = -b.vy;
    events.wallBounce = true;
  }
}

/** The paddle bounce: angle from the contact point, speed up, spin, placement. */
function paddleBounce(b: Flight, side: Side, paddle: PaddleState): void {
  const offset = clamp((b.y - paddle.cy) / PADDLE_HALF, -1, 1);
  const theta = offset * MAX_BOUNCE_ANGLE;
  const speed = Math.min(Math.hypot(b.vx, b.vy) * SPEED_MULT, SPEED_CAP);
  const dir = side === "left" ? 1 : -1;
  b.vx = dir * speed * Math.cos(theta);
  b.vy = speed * Math.sin(theta);
  b.spin = clamp(
    b.spin + paddle.vy * SPIN_FROM_PADDLE,
    -SPIN_CLAMP,
    SPIN_CLAMP,
  );
  b.x = side === "left" ? P1_X1 + BALL_R : P2_X0 - BALL_R;
}

function resolvePaddle(
  b: Flight,
  side: Side,
  paddle: PaddleState,
  events: BallEvents,
): void {
  const contact = resolveCircleRect(
    b.x,
    b.y,
    b.vx,
    b.vy,
    paddleRect(side, paddle.cy),
  );
  if (contact === null) return;
  if (contact.face === "left" || contact.face === "right") {
    paddleBounce(b, side, paddle);
    events.paddleHit = true;
  } else {
    // An end cap is resolved like a wall.
    b.x = contact.x;
    b.y = contact.y;
    b.vx = contact.vx;
    b.vy = contact.vy;
    events.wallBounce = true;
  }
}

function resolveObstacle(b: Flight, rect: Rect, events: BallEvents): void {
  const contact = resolveCircleRect(b.x, b.y, b.vx, b.vy, rect);
  if (contact === null) return;
  b.x = contact.x;
  b.y = contact.y;
  b.vx = contact.vx;
  b.vy = contact.vy;
  events.obstacleBounce = true;
}

/**
 * Advances a flying ball by `dt` seconds in sub-steps of at most `MAX_SUBSTEP`
 * units of travel each, resolving the walls, both paddles, and every present
 * obstacle in each. The paddles are as the frame already integrated them, so
 * their `vy` is what the spin reads. Returns the ball after the frame and the
 * events the frame raised.
 */
export function stepBall(
  ball: DeepReadonly<BallState>,
  paddles: DeepReadonly<{ left: PaddleState; right: PaddleState }>,
  obstacles: readonly DeepReadonly<ObstacleState>[],
  dt: number,
): { ball: BallState; events: BallEvents } {
  const events: BallEvents = {
    paddleHit: false,
    wallBounce: false,
    obstacleBounce: false,
  };
  const b: Flight = {
    x: ball.x,
    y: ball.y,
    vx: ball.vx,
    vy: ball.vy,
    spin: ball.spin,
  };
  const speed = Math.hypot(b.vx, b.vy);
  const n = Math.max(1, Math.ceil((speed * dt) / MAX_SUBSTEP));
  const h = dt / n;
  const rects = obstacles.map((o) => OBSTACLES[o.index]);

  for (let i = 0; i < n; i++) {
    applySpin(b, h);
    b.x += b.vx * h;
    b.y += b.vy * h;
    resolveWalls(b, events);
    resolvePaddle(b, "left", paddles.left, events);
    resolvePaddle(b, "right", paddles.right, events);
    for (const rect of rects) resolveObstacle(b, rect, events);
  }

  return { ball: { ...ball, ...b }, events };
}

/** The side that scores on this ball's position, or `null` while it is in play. */
export function goalCrossed(ball: DeepReadonly<BallState>): Side | null {
  if (ball.x - BALL_R > FIELD_W) return "left";
  if (ball.x + BALL_R < 0) return "right";
  return null;
}
