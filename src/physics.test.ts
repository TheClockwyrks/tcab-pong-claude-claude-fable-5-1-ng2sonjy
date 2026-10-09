import { describe, expect, it } from "vitest";
import {
  BALL_R,
  FIELD_H,
  FIELD_W,
  MAX_BOUNCE_ANGLE,
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
import type { BallState, PaddleState } from "./game";
import {
  clamp,
  goalCrossed,
  integratePaddle,
  paddleRect,
  resolveCircleRect,
  stepBall,
} from "./physics";
import { allObstacles } from "./world";

function paddle(cy: number, vy = 0): PaddleState {
  return { cy, vy, driven: false, drivenVy: 0 };
}

function ball(patch: Partial<BallState>): BallState {
  return {
    x: 640,
    y: 360,
    vx: 0,
    vy: 0,
    spin: 0,
    held: false,
    holdTimer: 0,
    serveSign: 1,
    trail: [],
    ...patch,
  };
}

const centered = { left: paddle(360), right: paddle(360) };

describe("clamp", () => {
  it("bounds a value", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });
});

describe("integratePaddle", () => {
  it("moves at vy and keeps vy when unclamped", () => {
    const next = integratePaddle(paddle(360), 720, 0.1);
    expect(next.cy).toBeCloseTo(432);
    expect(next.vy).toBe(720);
  });

  it("clamps to the field and shortens vy to the actual move", () => {
    const next = integratePaddle(paddle(PADDLE_MAX_CY - 10), 720, 0.1);
    expect(next.cy).toBe(PADDLE_MAX_CY);
    expect(next.vy).toBeCloseTo(100);
  });

  it("reports vy = 0 when pinned against a bound", () => {
    const next = integratePaddle(paddle(PADDLE_MIN_CY), -720, 1 / 60);
    expect(next.cy).toBe(PADDLE_MIN_CY);
    expect(next.vy).toBe(0);
  });

  it("leaves vy as given when dt is 0", () => {
    const next = integratePaddle(paddle(PADDLE_MIN_CY - 50), -720, 0);
    expect(next.cy).toBe(PADDLE_MIN_CY);
    expect(next.vy).toBe(-720);
  });

  it("keeps the driver fields", () => {
    const next = integratePaddle(
      { cy: 360, vy: 0, driven: true, drivenVy: 50 },
      50,
      0.5,
    );
    expect(next.driven).toBe(true);
    expect(next.drivenVy).toBe(50);
  });
});

describe("paddleRect", () => {
  it("spans each side's fixed x range around cy", () => {
    expect(paddleRect("left", 300)).toEqual({
      x0: P1_X0,
      x1: P1_X1,
      y0: 300 - PADDLE_HALF,
      y1: 300 + PADDLE_HALF,
    });
    expect(paddleRect("right", 300)).toEqual({
      x0: P2_X0,
      x1: P2_X1,
      y0: 300 - PADDLE_HALF,
      y1: 300 + PADDLE_HALF,
    });
  });
});

describe("resolveCircleRect", () => {
  const rect = { x0: 100, y0: 100, x1: 120, y1: 240 };

  it("returns null when the center is outside the expanded rectangle", () => {
    expect(resolveCircleRect(100 - BALL_R, 170, 1, 0, rect)).toBeNull();
    expect(resolveCircleRect(50, 50, 1, 0, rect)).toBeNull();
  });

  it("strikes the left face and reverses an inward vx", () => {
    const c = resolveCircleRect(100 - BALL_R + 2, 170, 300, 50, rect);
    expect(c).toMatchObject({ face: "left", x: 100 - BALL_R, y: 170 });
    expect(c?.vx).toBe(-300);
    expect(c?.vy).toBe(50);
  });

  it("leaves a velocity that already points away", () => {
    const c = resolveCircleRect(100 - BALL_R + 2, 170, -300, 0, rect);
    expect(c?.vx).toBe(-300);
  });

  it("strikes the right face", () => {
    const c = resolveCircleRect(120 + BALL_R - 1, 170, -300, 0, rect);
    expect(c).toMatchObject({ face: "right", x: 120 + BALL_R, vx: 300 });
  });

  it("strikes the top and bottom faces", () => {
    const top = resolveCircleRect(110, 100 - BALL_R + 1, 0, 200, rect);
    expect(top).toMatchObject({ face: "top", y: 100 - BALL_R, vy: -200 });
    const bottom = resolveCircleRect(110, 240 + BALL_R - 1, 0, -200, rect);
    expect(bottom).toMatchObject({
      face: "bottom",
      y: 240 + BALL_R,
      vy: 200,
    });
  });

  it("breaks a tie in the order left, right, top, bottom", () => {
    // Equal depth on the left and the top: left wins.
    const c = resolveCircleRect(
      100 - BALL_R + 3,
      100 - BALL_R + 3,
      10,
      10,
      rect,
    );
    expect(c?.face).toBe("left");
  });
});

describe("stepBall", () => {
  it("advances in a straight line with no spin", () => {
    const { ball: b, events } = stepBall(
      ball({ vx: 300, vy: -60 }),
      centered,
      [],
      0.1,
    );
    expect(b.x).toBeCloseTo(670);
    expect(b.y).toBeCloseTo(354);
    expect(events).toEqual({
      paddleHit: false,
      wallBounce: false,
      obstacleBounce: false,
    });
  });

  it("reflects off the top wall and keeps speed and spin", () => {
    const { ball: b, events } = stepBall(
      ball({ x: 400, y: BALL_R + 2, vx: 100, vy: -400, spin: 0 }),
      centered,
      [],
      0.02,
    );
    expect(events.wallBounce).toBe(true);
    expect(b.vy).toBeGreaterThan(0);
    expect(b.y).toBeGreaterThanOrEqual(BALL_R);
    expect(Math.hypot(b.vx, b.vy)).toBeCloseTo(Math.hypot(100, 400));
  });

  it("reflects off the bottom wall", () => {
    const { ball: b, events } = stepBall(
      ball({ x: 400, y: FIELD_H - BALL_R - 2, vx: 100, vy: 400 }),
      centered,
      [],
      0.02,
    );
    expect(events.wallBounce).toBe(true);
    expect(b.vy).toBeLessThan(0);
    expect(b.y).toBeLessThanOrEqual(FIELD_H - BALL_R);
  });

  it("bounces off the left paddle's center straight across, faster", () => {
    const start = ball({ x: P1_X1 + BALL_R + 4, y: 360, vx: -500, vy: 0 });
    const { ball: b, events } = stepBall(start, centered, [], 0.02);
    expect(events.paddleHit).toBe(true);
    expect(b.vx).toBeGreaterThan(0);
    expect(Math.abs(b.vy)).toBeLessThan(1e-9);
    expect(Math.hypot(b.vx, b.vy)).toBeCloseTo(500 * SPEED_MULT);
    expect(b.spin).toBe(0);
  });

  it("sends a top-edge hit up at the maximum bounce angle", () => {
    const start = ball({
      x: P1_X1 + BALL_R + 2,
      y: 360 - PADDLE_HALF - 5,
      vx: -500,
      vy: 0,
    });
    const { ball: b } = stepBall(start, centered, [], 0.01);
    const angle = Math.atan2(b.vy, b.vx);
    expect(angle).toBeCloseTo(-MAX_BOUNCE_ANGLE, 5);
  });

  it("sends the ball toward the left off the right paddle", () => {
    const start = ball({ x: P2_X0 - BALL_R - 4, y: 360, vx: 500, vy: 0 });
    const { ball: b } = stepBall(start, centered, [], 0.02);
    expect(b.vx).toBeLessThan(0);
    // Placed off the front face, then carried on by the sub-steps after it.
    expect(b.x).toBeLessThanOrEqual(P2_X0 - BALL_R);
    expect(b.x).toBeGreaterThan(P2_X0 - BALL_R - 10);
  });

  it("caps the speed at SPEED_CAP", () => {
    const start = ball({ x: P1_X1 + BALL_R + 4, y: 360, vx: -970, vy: 0 });
    const { ball: b } = stepBall(start, centered, [], 0.01);
    expect(Math.hypot(b.vx, b.vy)).toBeCloseTo(SPEED_CAP);
  });

  it("adds spin from the paddle's motion, clamped", () => {
    const start = ball({ x: P1_X1 + BALL_R + 4, y: 360, vx: -500, vy: 0 });
    const moving = { left: paddle(360, 400), right: paddle(360) };
    const { ball: b } = stepBall(start, moving, [], 0.02);
    // The decay of the sub-steps after the hit only lowers the magnitude.
    expect(b.spin).toBeGreaterThan(0);
    expect(b.spin).toBeLessThanOrEqual(400 * SPIN_FROM_PADDLE);

    const touching = ball({ x: P1_X1 + BALL_R - 1, y: 360, vx: -500, vy: 0 });
    const fast = { left: paddle(360, -5000), right: paddle(360) };
    const { ball: c } = stepBall(touching, fast, [], 1e-6);
    expect(c.spin).toBeCloseTo(-SPIN_CLAMP, 1);
  });

  it("resolves a paddle end cap like a wall", () => {
    const start = ball({
      x: P1_X0 + 8,
      y: 360 - PADDLE_HALF - BALL_R + 1,
      vx: 0,
      vy: 300,
    });
    const { ball: b, events } = stepBall(start, centered, [], 1e-6);
    expect(events.wallBounce).toBe(true);
    expect(events.paddleHit).toBe(false);
    expect(b.vy).toBeLessThan(0);
    expect(b.y).toBeCloseTo(360 - PADDLE_HALF - BALL_R);
  });

  it("bounces off an obstacle leaving speed and spin unchanged", () => {
    const a = OBSTACLES[0];
    const start = ball({
      x: a.x0 - BALL_R - 3,
      y: 220,
      vx: 400,
      vy: 0,
      spin: 100,
    });
    const { ball: b, events } = stepBall(start, centered, allObstacles(), 0.02);
    expect(events.obstacleBounce).toBe(true);
    expect(b.vx).toBeLessThan(0);
    expect(Math.hypot(b.vx, b.vy)).toBeCloseTo(400);
    expect(b.spin).toBeCloseTo(100 * Math.pow(0.5, 0.02 / SPIN_HALFLIFE), 6);
  });

  it("ignores an absent obstacle", () => {
    const a = OBSTACLES[0];
    const start = ball({ x: a.x0 - BALL_R - 3, y: 220, vx: 400, vy: 0 });
    const { ball: b, events } = stepBall(
      start,
      centered,
      [allObstacles()[1]],
      0.02,
    );
    expect(events.obstacleBounce).toBe(false);
    expect(b.vx).toBe(400);
  });

  it("turns the velocity with spin and decays the spin", () => {
    const start = ball({ vx: 400, vy: 0, spin: 400 });
    const { ball: b } = stepBall(start, centered, [], 0.1);
    expect(b.vy).toBeGreaterThan(0); // positive spin turns +x toward +y
    expect(Math.hypot(b.vx, b.vy)).toBeCloseTo(400);
    expect(b.spin).toBeLessThan(400);
    expect(b.spin).toBeGreaterThan(
      400 * Math.pow(0.5, 0.1 / SPIN_HALFLIFE) - 1,
    );
  });

  it("decays spin even at rest and skips the turn", () => {
    const { ball: b } = stepBall(ball({ spin: 100 }), centered, [], 0.8);
    expect(b.vx).toBe(0);
    expect(b.vy).toBe(0);
    expect(b.spin).toBeCloseTo(50);
  });

  it("never lets a fast ball tunnel through a paddle", () => {
    const start = ball({ x: 400, y: 360, vx: -SPEED_CAP, vy: 0 });
    let current = start;
    for (let i = 0; i < 60; i++) {
      current = stepBall(current, centered, allObstacles(), 1 / 60).ball;
    }
    expect(current.vx).toBeGreaterThan(0);
    expect(current.x).toBeGreaterThan(P1_X1);
  });

  it("agrees between 2 ms and 16 ms frames over a rally", () => {
    const run = (dtMs: number) => {
      let current = ball({ x: 300, y: 300, vx: 520, vy: 120 });
      let hits = 0;
      let walls = 0;
      let elapsed = 0;
      while (hits < 4 && elapsed < 10) {
        // Paddles that meet the ball a little below their center, at rest,
        // so every return leaves upward and the rally works the top wall.
        const cy = clamp(current.y + 10, PADDLE_MIN_CY, PADDLE_MAX_CY);
        const { ball: next, events } = stepBall(
          current,
          { left: paddle(cy), right: paddle(cy) },
          allObstacles(),
          dtMs / 1000,
        );
        if (events.paddleHit) hits++;
        if (events.wallBounce) walls++;
        current = next;
        elapsed += dtMs / 1000;
      }
      return { current, hits, walls, elapsed };
    };
    const fine = run(2);
    const coarse = run(16);
    expect(fine.hits).toBe(4);
    expect(coarse.hits).toBe(4);
    expect(fine.walls).toBe(coarse.walls);
    const fineSpeed = Math.hypot(fine.current.vx, fine.current.vy);
    const coarseSpeed = Math.hypot(coarse.current.vx, coarse.current.vy);
    expect(Math.abs(fineSpeed - coarseSpeed)).toBeLessThan(10);
    expect(Math.sign(fine.current.vx)).toBe(Math.sign(coarse.current.vx));
    expect(Math.abs(fine.elapsed - coarse.elapsed) / fine.elapsed).toBeLessThan(
      0.08,
    );
  });
});

describe("goalCrossed", () => {
  it("names the scorer once the ball is fully past an edge", () => {
    expect(goalCrossed(ball({ x: FIELD_W + BALL_R + 1 }))).toBe("left");
    expect(goalCrossed(ball({ x: -BALL_R - 1 }))).toBe("right");
    expect(goalCrossed(ball({ x: FIELD_W + BALL_R }))).toBeNull();
    expect(goalCrossed(ball({ x: 640 }))).toBeNull();
  });
});
