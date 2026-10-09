import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BALL_R,
  CUES,
  FIELD_CY,
  FIELD_W,
  HOLD_TIME,
  P1_X1,
  PADDLE_MIN_CY,
  PADDLE_SPEED,
  SERVE_ANGLE,
  SERVE_SPEED,
  TRAIL_TIME,
  WIN_SCORE,
} from "./constants";
import type { CaromState } from "./game";
import { createHarness, STEP_MS, type Harness } from "./harness.test-support";
import { confirmMenu } from "./update";
import { initialState } from "./world";

const DT = STEP_MS / 1000;

let h: Harness;

beforeEach(async () => {
  h = await createHarness();
});

afterEach(() => {
  h.destroy();
});

const snap = () => h.debug.snapshot(h.engine.state);

/** Starts a match from the title by confirming the item at `index`. */
async function startFromTitle(index: number): Promise<void> {
  h.pose((s) => h.debug.setMenuIndex(s, index));
  await h.tap("Enter");
}

/** Takes a match from the title into play, with the ball served. */
async function intoPlay(mode: "solo" | "versus" = "versus"): Promise<void> {
  await startFromTitle(mode === "solo" ? 0 : 1);
  await h.advanceSeconds(HOLD_TIME + 0.05);
  expect(snap().screen).toBe("playing");
}

describe("the title screen", () => {
  it("opens on the title with the specified state", async () => {
    const s = snap();
    expect(s.screen).toBe("title");
    expect(s.menuIndex).toBe(0);
    expect(s.ball?.held).toBe(true);
    expect(s.obstacles).toHaveLength(2);
    expect(s.muted).toBe(false);
  });

  it("moves the highlight with either player's keys, wrapping", async () => {
    await h.tap("ArrowDown");
    expect(snap().menuIndex).toBe(1);
    await h.tap("KeyS");
    expect(snap().menuIndex).toBe(2);
    await h.tap("KeyS");
    expect(snap().menuIndex).toBe(0);
    await h.tap("KeyW");
    expect(snap().menuIndex).toBe(2);
    await h.tap("ArrowUp");
    expect(snap().menuIndex).toBe(1);
  });

  it("applies up before down and movement before confirm", async () => {
    h.keyDown("KeyW");
    h.keyDown("KeyS");
    h.keyDown("Enter");
    await h.advance(1);
    h.keyUp("KeyW");
    h.keyUp("KeyS");
    h.keyUp("Enter");
    expect(snap().screen).toBe("title");
    expect(snap().menuIndex).toBe(2);
  });

  it("starts a Solo match from SOLO and remembers the selection", async () => {
    await startFromTitle(0);
    const s = snap();
    expect(s.screen).toBe("countdown");
    expect(s.mode).toBe("solo");
    expect(s.titleIndex).toBe(0);
    expect(s.resumeScreen).toBe("playing");
    expect(s.receiver).toBe("left");
  });

  it("starts a Versus match from VERSUS", async () => {
    await startFromTitle(1);
    expect(snap().mode).toBe("versus");
    expect(snap().titleIndex).toBe(1);
  });

  it("opens the how-to screen and returns to the title", async () => {
    await startFromTitle(2);
    expect(snap().screen).toBe("howto");
    expect(snap().menuIndex).toBe(0);
    expect(snap().titleIndex).toBe(2);
    await h.tap("Escape");
    expect(snap().screen).toBe("title");
    expect(snap().menuIndex).toBe(2);
    await h.tap("Space");
    expect(snap().screen).toBe("howto");
    await h.tap("Enter");
    expect(snap().screen).toBe("title");
  });

  it("ignores back and pause on the title", async () => {
    await h.tap("Escape");
    await h.tap("KeyP");
    expect(snap().screen).toBe("title");
  });

  it("advances nothing but simTime", async () => {
    await h.advance(30);
    const s = snap();
    expect(s.simTime).toBeCloseTo(30 * DT);
    expect(s.ball?.holdTimer).toBe(HOLD_TIME);
    expect(s.ball?.trail).toHaveLength(0);
  });
});

describe("the countdown and the serve", () => {
  it("counts the hold down and serves toward player one", async () => {
    await startFromTitle(1);
    // The frame that confirmed SOLO already advanced the countdown it reached.
    expect(snap().ball?.holdTimer).toBeCloseTo(HOLD_TIME - DT);
    expect(snap().ball?.trail).toHaveLength(1);
    await h.advance(1);
    expect(snap().ball?.holdTimer).toBeCloseTo(HOLD_TIME - 2 * DT);
    expect(snap().ball?.trail).toHaveLength(2);
    await h.advanceSeconds(HOLD_TIME);
    const b = snap().ball;
    expect(snap().screen).toBe("playing");
    expect(b?.held).toBe(false);
    expect(b?.holdTimer).toBe(0);
    expect(b?.vx).toBeCloseTo(-SERVE_SPEED * Math.cos(SERVE_ANGLE));
    expect(Math.abs(b?.vy ?? 0)).toBeCloseTo(
      SERVE_SPEED * Math.sin(SERVE_ANGLE),
    );
    expect(Math.sign(b?.vy ?? 0)).toBe(b?.serveSign);
  });

  it("does not advance the ball on the frame it is served", async () => {
    await startFromTitle(1);
    h.pose((s) => h.debug.setBallHoldTimer(s, 0));
    await h.advance(1);
    const b = snap().ball;
    expect(snap().screen).toBe("playing");
    expect(b?.x).toBe(640);
    expect(b?.y).toBe(FIELD_CY);
  });

  it("moves the paddles during the countdown", async () => {
    await startFromTitle(1);
    h.keyDown("KeyW");
    h.keyDown("ArrowDown");
    await h.advance(6);
    h.keyUp("KeyW");
    h.keyUp("ArrowDown");
    const s = snap();
    expect(s.paddles.left.cy).toBeCloseTo(FIELD_CY - 6 * DT * PADDLE_SPEED);
    expect(s.paddles.right.cy).toBeCloseTo(FIELD_CY + 6 * DT * PADDLE_SPEED);
  });

  it("serves with a posed serve sign", async () => {
    await startFromTitle(1);
    h.pose((s) => h.debug.setBallServeSign(s, -1));
    await h.advanceSeconds(HOLD_TIME + 0.05);
    expect(snap().ball?.vy).toBeLessThan(0);
    expect(snap().ball?.serveSign).toBe(-1);
  });

  it("serves toward a posed receiver", async () => {
    await startFromTitle(1);
    h.pose((s) => h.debug.setReceiver(s, "right"));
    await h.advanceSeconds(HOLD_TIME + 0.05);
    expect(snap().ball?.vx).toBeGreaterThan(0);
  });

  it("runs with no ball on the field", async () => {
    await startFromTitle(1);
    h.pose((s) => h.debug.clearWorld(s));
    await h.advanceSeconds(2);
    expect(snap().screen).toBe("countdown");
    expect(snap().ball).toBeNull();
  });
});

describe("play", () => {
  it("moves each player's own paddle in Versus", async () => {
    await intoPlay("versus");
    h.keyDown("KeyS");
    await h.advance(3);
    expect(snap().paddles.left.vy).toBe(PADDLE_SPEED);
    h.keyUp("KeyS");
    await h.advance(1);
    expect(snap().paddles.left.cy).toBeCloseTo(
      FIELD_CY + 3 * DT * PADDLE_SPEED,
    );
    expect(snap().paddles.right.cy).toBe(FIELD_CY);
    expect(snap().paddles.left.vy).toBe(0);
  });

  it("moves the human paddle with either pair in Solo and the AI the other", async () => {
    await intoPlay("solo");
    h.pose((s) => h.debug.setAiMovement(s, false));
    h.keyDown("ArrowUp");
    await h.advance(3);
    expect(snap().paddles.left.cy).toBeCloseTo(
      FIELD_CY - 3 * DT * PADDLE_SPEED,
    );
    expect(snap().paddles.left.vy).toBe(-PADDLE_SPEED);
    h.keyUp("ArrowUp");
    expect(snap().paddles.right.cy).toBe(FIELD_CY);
  });

  it("lets the AI chase a ball coming its way", async () => {
    await intoPlay("solo");
    h.pose((s) => h.debug.setBallPosition(s, 900, 600));
    h.pose((s) => h.debug.setBallVelocity(s, 300, 0));
    await h.advance(10);
    expect(snap().paddles.right.cy).toBeGreaterThan(FIELD_CY);
    expect(snap().paddles.right.vy).toBeGreaterThan(0);
  });

  it("pins a paddle at the bound with vy 0", async () => {
    await intoPlay("versus");
    h.keyDown("KeyW");
    await h.advanceSeconds(1.2);
    expect(snap().paddles.left.cy).toBe(PADDLE_MIN_CY);
    expect(snap().paddles.left.vy).toBe(0);
    h.keyUp("KeyW");
  });

  it("drives a driven paddle at drivenVy and leaves the other alone", async () => {
    await intoPlay("versus");
    h.pose((s) => h.debug.setPaddleVy(s, "left", 100));
    expect(snap().paddles.left.vy).toBe(0);
    expect(snap().paddles.left.drivenVy).toBe(100);
    h.pose((s) => h.debug.setPaddleDriven(s, "left", true));
    h.keyDown("KeyW");
    await h.advance(6);
    h.keyUp("KeyW");
    const s = snap();
    expect(s.paddles.left.cy).toBeCloseTo(FIELD_CY + 6 * DT * 100);
    expect(s.paddles.left.vy).toBe(100);
    expect(s.paddles.right.driven).toBe(false);
  });

  it("records a trail no older than TRAIL_TIME", async () => {
    await intoPlay("versus");
    await h.advanceSeconds(0.5);
    const b = snap().ball;
    const t = snap().simTime;
    expect(b).not.toBeNull();
    if (b === null) return;
    expect(b.trail.length).toBeGreaterThan(2);
    for (const sample of b.trail) {
      expect(t - sample.t).toBeLessThanOrEqual(TRAIL_TIME + 1e-9);
    }
    const last = b.trail[b.trail.length - 1];
    expect(last.x).toBe(b.x);
    expect(last.y).toBe(b.y);
    expect(last.t).toBeCloseTo(t);
  });

  it("plays each cue once on the frame of its event", async () => {
    await intoPlay("versus");
    h.cues.length = 0;
    h.pose((s) => h.debug.setBallPosition(s, 300, BALL_R + 3));
    h.pose((s) => h.debug.setBallVelocity(s, 0, -600));
    await h.advance(1);
    expect(h.cues).toEqual([CUES.wallBounce]);

    h.cues.length = 0;
    h.pose((s) => h.debug.setBallPosition(s, P1_X1 + BALL_R + 3, FIELD_CY));
    h.pose((s) => h.debug.setBallVelocity(s, -600, 0));
    await h.advance(1);
    expect(h.cues).toEqual([CUES.paddleHit]);

    h.cues.length = 0;
    h.pose((s) => h.debug.setBallPosition(s, 470, 220));
    h.pose((s) => h.debug.setBallVelocity(s, 600, 0));
    await h.advance(1);
    expect(h.cues).toEqual([CUES.obstacleBounce]);
  });

  it("scores for player one past the right edge and serves to the loser", async () => {
    await intoPlay("versus");
    h.cues.length = 0;
    h.pose((s) => h.debug.setBallPosition(s, FIELD_W - 5, 100));
    h.pose((s) => h.debug.setBallVelocity(s, 900, 0));
    for (let i = 0; i < 5 && snap().screen === "playing"; i++) {
      await h.advance(1);
    }
    const s = snap();
    expect(s.score).toEqual({ p1: 1, p2: 0 });
    expect(s.screen).toBe("countdown");
    expect(s.receiver).toBe("right");
    expect(s.ball?.held).toBe(true);
    expect(s.ball?.x).toBe(640);
    expect(s.ball?.holdTimer).toBe(HOLD_TIME);
    expect(h.cues).toContain(CUES.score);
  });

  it("scores for player two past the left edge", async () => {
    await intoPlay("versus");
    h.pose((s) => h.debug.setBallPosition(s, 5, 100));
    h.pose((s) => h.debug.setBallVelocity(s, -900, 0));
    await h.advance(3);
    expect(snap().score).toEqual({ p1: 0, p2: 1 });
    expect(snap().receiver).toBe("left");
  });

  it("ends the match on the win rule and leaves the ball where it is", async () => {
    await intoPlay("versus");
    h.pose((s) => h.debug.setScore(s, WIN_SCORE - 1, 3));
    h.pose((s) => h.debug.setBallPosition(s, FIELD_W - 5, 100));
    h.pose((s) => h.debug.setBallVelocity(s, 900, 0));
    await h.advance(3);
    const s = snap();
    expect(s.screen).toBe("matchover");
    expect(s.winner).toBe("left");
    expect(s.menuIndex).toBe(0);
    expect(s.score.p1).toBe(WIN_SCORE);
    expect(s.ball?.x).toBeGreaterThan(FIELD_W);
    await h.advance(5);
    expect(snap().ball?.x).toBe(s.ball?.x);
  });

  it("plays on at deuce until a two-point lead", async () => {
    await intoPlay("versus");
    h.pose((s) => h.debug.setScore(s, 10, 10));
    h.pose((s) => h.debug.setBallPosition(s, 5, 100));
    h.pose((s) => h.debug.setBallVelocity(s, -900, 0));
    await h.advance(3);
    expect(snap().score).toEqual({ p1: 10, p2: 11 });
    expect(snap().screen).toBe("countdown");
    expect(snap().winner).toBeNull();
    await h.advanceSeconds(HOLD_TIME + 0.05);
    h.pose((s) => h.debug.setBallPosition(s, 5, 100));
    h.pose((s) => h.debug.setBallVelocity(s, -900, 0));
    await h.advance(3);
    expect(snap().winner).toBe("right");
  });

  it("leaves a held ball at rest on a playing frame", async () => {
    await intoPlay("versus");
    h.pose((s) => h.debug.setBallHeld(s, true));
    await h.advance(5);
    expect(snap().ball?.held).toBe(true);
    expect(snap().ball?.trail.length).toBeGreaterThan(0);
  });
});

describe("pausing", () => {
  it("pauses with P from play and resumes with P", async () => {
    await intoPlay("versus");
    const before = snap().ball;
    await h.tap("KeyP");
    expect(snap().screen).toBe("paused");
    expect(snap().resumeScreen).toBe("playing");
    expect(snap().menuIndex).toBe(0);
    await h.advance(10);
    expect(snap().ball).toEqual({ ...before, trail: before?.trail });
    await h.tap("KeyP");
    expect(snap().screen).toBe("playing");
  });

  it("pauses from the countdown and resumes there with Escape once", async () => {
    await startFromTitle(1);
    await h.advance(5);
    const timer = snap().ball?.holdTimer;
    await h.tap("Escape");
    expect(snap().screen).toBe("paused");
    expect(snap().resumeScreen).toBe("countdown");
    await h.advance(10);
    expect(snap().ball?.holdTimer).toBe(timer);
    await h.tap("Escape");
    expect(snap().screen).toBe("countdown");
    await h.advance(1);
    expect(snap().screen).toBe("countdown");
  });

  it("navigates the pause menu and restarts in the current mode", async () => {
    await intoPlay("solo");
    h.pose((s) => h.debug.setScore(s, 3, 4));
    await h.tap("KeyP");
    await h.tap("ArrowUp");
    expect(snap().menuIndex).toBe(2);
    await h.tap("ArrowDown");
    expect(snap().menuIndex).toBe(0);
    await h.tap("KeyS");
    expect(snap().menuIndex).toBe(1);
    await h.tap("Enter");
    const s = snap();
    expect(s.screen).toBe("countdown");
    expect(s.mode).toBe("solo");
    expect(s.score).toEqual({ p1: 0, p2: 0 });
  });

  it("resumes from RESUME and quits to the title from QUIT TO MENU", async () => {
    await intoPlay("versus");
    await h.tap("KeyP");
    await h.tap("Enter");
    expect(snap().screen).toBe("playing");
    await h.tap("KeyP");
    await h.tap("KeyW");
    expect(snap().menuIndex).toBe(2);
    await h.tap("Enter");
    const s = snap();
    expect(s.screen).toBe("title");
    expect(s.menuIndex).toBe(1);
    expect(s.titleIndex).toBe(1);
    expect(s.mode).toBe("solo");
  });

  it("resumes and does nothing else when pause and a menu edge coincide", async () => {
    await intoPlay("versus");
    await h.tap("KeyP");
    h.keyDown("KeyP");
    h.keyDown("Enter");
    h.keyDown("KeyS");
    await h.advance(1);
    h.keyUp("KeyP");
    h.keyUp("Enter");
    h.keyUp("KeyS");
    expect(snap().screen).toBe("playing");
    expect(snap().menuIndex).toBe(0);
  });
});

describe("the match-over screen", () => {
  async function finish(): Promise<void> {
    await intoPlay("versus");
    h.pose((s) => h.debug.setScore(s, 10, 2));
    h.pose((s) => h.debug.setBallPosition(s, FIELD_W - 5, 100));
    h.pose((s) => h.debug.setBallVelocity(s, 900, 0));
    await h.advance(3);
    expect(snap().screen).toBe("matchover");
  }

  it("plays again in the same mode", async () => {
    await finish();
    await h.tap("Enter");
    expect(snap().screen).toBe("countdown");
    expect(snap().mode).toBe("versus");
    expect(snap().score).toEqual({ p1: 0, p2: 0 });
    expect(snap().winner).toBeNull();
  });

  it("returns to the title from MENU and from back", async () => {
    await finish();
    await h.tap("ArrowDown");
    expect(snap().menuIndex).toBe(1);
    await h.tap("ArrowDown");
    expect(snap().menuIndex).toBe(0);
    await h.tap("ArrowUp");
    await h.tap("Enter");
    expect(snap().screen).toBe("title");
    await finish();
    await h.tap("Escape");
    expect(snap().screen).toBe("title");
    expect(snap().winner).toBeNull();
  });
});

describe("mute", () => {
  it("toggles the runtime's mute bit from any screen and mirrors it", async () => {
    await h.tap("KeyM");
    expect(snap().muted).toBe(true);
    await intoPlay("versus");
    expect(snap().muted).toBe(true);
    await h.tap("KeyM");
    expect(snap().muted).toBe(false);
  });

  it("takes a posed mute bit into the runtime", async () => {
    h.pose((s) => h.debug.setMuted(s, true));
    await h.advance(1);
    expect(snap().muted).toBe(true);
    await h.tap("KeyM");
    expect(snap().muted).toBe(false);
  });

  it("keeps playing cues while muted", async () => {
    await intoPlay("versus");
    await h.tap("KeyM");
    h.cues.length = 0;
    h.pose((s) => h.debug.setBallPosition(s, 300, BALL_R + 3));
    h.pose((s) => h.debug.setBallVelocity(s, 0, -600));
    await h.advance(1);
    expect(h.cues).toEqual([CUES.wallBounce]);
  });
});

describe("pointer and touch menus", () => {
  function rect(index: number) {
    const r = h.debug.menuItemRect(h.engine.state, index);
    if (r === null) throw new Error(`no item ${index}`);
    return { cx: r.x + r.w / 2, cy: r.y + r.h / 2, r };
  }

  it("highlights the item a pointer moves onto", async () => {
    const { cx, cy } = rect(2);
    h.pointer("pointermove", cx, cy);
    await h.advance(1);
    expect(snap().menuIndex).toBe(2);
    h.pointer("pointermove", 5, 5);
    await h.advance(1);
    expect(snap().menuIndex).toBe(2);
  });

  it("confirms on a press and release inside one item", async () => {
    const { cx, cy } = rect(1);
    h.pointer("pointerdown", cx, cy);
    await h.advance(1);
    expect(snap().menuIndex).toBe(1);
    expect(snap().screen).toBe("title");
    h.pointer("pointerup", cx, cy);
    await h.advance(1);
    expect(snap().screen).toBe("countdown");
    expect(snap().mode).toBe("versus");
    expect(snap().titleIndex).toBe(1);
  });

  it("confirms a press and release that arrive on one frame", async () => {
    const { cx, cy } = rect(0);
    h.pointer("pointerdown", cx, cy);
    h.pointer("pointerup", cx, cy);
    await h.advance(1);
    expect(snap().screen).toBe("countdown");
    expect(snap().mode).toBe("solo");
  });

  it("confirms nothing when the edges fall in different regions", async () => {
    const a = rect(0);
    const b = rect(1);
    h.pointer("pointerdown", a.cx, a.cy);
    h.pointer("pointerup", b.cx, b.cy);
    await h.advance(1);
    expect(snap().screen).toBe("title");
    expect(snap().menuIndex).toBe(1);
  });

  it("confirms nothing when the press fell outside every region", async () => {
    const a = rect(0);
    h.pointer("pointerdown", 5, 5);
    await h.advance(1);
    h.pointer("pointermove", a.cx, a.cy);
    h.pointer("pointerup", a.cx, a.cy);
    await h.advance(1);
    expect(snap().screen).toBe("title");
    expect(snap().menuIndex).toBe(0);
  });

  it("drives the menus by touch too", async () => {
    const a = rect(2);
    h.pointer("pointerdown", 5, 5, { device: "touch" });
    h.pointer("pointermove", a.cx, a.cy, { device: "touch" });
    await h.advance(1);
    expect(snap().menuIndex).toBe(2);
    h.pointer("pointerup", a.cx, a.cy, { device: "touch" });
    await h.advance(1);
    expect(snap().screen).toBe("title");
    h.pointer("pointerdown", a.cx, a.cy, { device: "touch" });
    h.pointer("pointerup", a.cx, a.cy, { device: "touch" });
    await h.advance(1);
    expect(snap().screen).toBe("howto");
  });

  it("lets a pointer selection win over a keyboard move on one frame", async () => {
    const { cx, cy } = rect(2);
    h.keyDown("KeyS");
    h.pointer("pointermove", cx, cy);
    await h.advance(1);
    h.keyUp("KeyS");
    expect(snap().menuIndex).toBe(2);
  });

  it("confirms the keyboard's item alone when both confirm at once", async () => {
    const { cx, cy } = rect(2);
    h.keyDown("Enter");
    h.pointer("pointerdown", cx, cy);
    h.pointer("pointerup", cx, cy);
    await h.advance(1);
    h.keyUp("Enter");
    expect(snap().screen).toBe("countdown");
    expect(snap().mode).toBe("solo");
  });

  it("confirms nothing on a screen without a menu", async () => {
    await intoPlay("versus");
    h.pointer("pointerdown", 640, 400);
    h.pointer("pointerup", 640, 400);
    await h.advance(1);
    expect(snap().screen).toBe("playing");
    await h.tap("KeyP");
    const { cx, cy } = rect(2);
    h.pointer("pointerdown", cx, cy);
    h.pointer("pointerup", cx, cy);
    await h.advance(1);
    expect(snap().screen).toBe("title");
  });

  it("does not confirm a press that began on another screen", async () => {
    await intoPlay("versus");
    await h.tap("KeyP");
    const { cx, cy } = rect(2);
    h.pointer("pointerdown", cx, cy);
    await h.advance(1);
    expect(snap().menuIndex).toBe(2);
    await h.tap("Escape");
    expect(snap().screen).toBe("playing");
    await h.tap("Escape");
    h.pointer("pointerup", cx, cy);
    await h.advance(1);
    expect(snap().screen).toBe("paused");
    expect(snap().menuIndex).toBe(2);
  });

  it("does not confirm a press that landed where no menu was", async () => {
    await intoPlay("versus");
    await h.tap("KeyP");
    const { cx, cy } = rect(2);
    await h.tap("KeyP");
    h.pointer("pointerdown", cx, cy);
    await h.advance(1);
    await h.tap("KeyP");
    h.pointer("pointerup", cx, cy);
    await h.advance(1);
    expect(snap().screen).toBe("paused");
  });
});

describe("confirmMenu", () => {
  it("leaves a screen with nothing to confirm as it is", () => {
    const playing: CaromState = { ...initialState(false), screen: "playing" };
    expect(confirmMenu(playing)).toEqual(playing);
    const odd: CaromState = { ...initialState(false), menuIndex: 9 };
    expect(confirmMenu(odd).screen).toBe("title");
    const pausedOdd: CaromState = {
      ...initialState(false),
      screen: "paused",
      menuIndex: 9,
    };
    expect(confirmMenu(pausedOdd).screen).toBe("paused");
    const overOdd: CaromState = {
      ...initialState(false),
      screen: "matchover",
      menuIndex: 9,
    };
    expect(confirmMenu(overOdd).screen).toBe("matchover");
  });
});
