// Carom — one frame: read input, move between screens, advance the screen the
// input left the game on, play the cues the frame raised (specs/ui.md,
// specs/balls.md, specs/audio.md).

import type { PointerSample, UpdateApi } from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import {
  CUES,
  HOLD_TIME,
  MATCHOVER_ITEMS,
  PADDLE_SPEED,
  PAUSE_ITEMS,
  SERVE_ANGLE,
  SERVE_SPEED,
  TITLE_ITEMS,
  TRAIL_TIME,
  WIN_LEAD,
  WIN_SCORE,
} from "./constants";
import { aiVelocity } from "./ai";
import type {
  BallState,
  CaromState,
  MenuPress,
  PaddleState,
  Screen,
  Side,
} from "./game";
import { menuFor, menuItemAt, moveMenu } from "./menu";
import { goalCrossed, integratePaddle, stepBall } from "./physics";
import { parkedBall, returnToTitle, startMatch } from "./world";

type S = DeepReadonly<CaromState>;

/** Every action read once per frame: the edges and the held values. */
export interface FrameInput {
  readonly up1: boolean;
  readonly down1: boolean;
  readonly up2: boolean;
  readonly down2: boolean;
  readonly confirm: boolean;
  readonly back: boolean;
  readonly pause: boolean;
  readonly held: {
    readonly p1Up: number;
    readonly p1Down: number;
    readonly p2Up: number;
    readonly p2Down: number;
  };
  readonly samples: readonly PointerSample[];
}

function readInput(api: UpdateApi): FrameInput {
  const { input } = api;
  return {
    up1: input.pressed("p1-up"),
    down1: input.pressed("p1-down"),
    up2: input.pressed("p2-up"),
    down2: input.pressed("p2-down"),
    confirm: input.pressed("confirm"),
    back: input.pressed("back"),
    pause: input.pressed("pause"),
    held: {
      p1Up: input.value("p1-up"),
      p1Down: input.value("p1-down"),
      p2Up: input.value("p2-up"),
      p2Down: input.value("p2-down"),
    },
    samples: input.pointerSamples(),
  };
}

// ---- Menus -----------------------------------------------------------------

/** What confirming the item at `menuIndex` does on the screen now showing. */
export function confirmMenu(state: S): CaromState {
  switch (state.screen) {
    case "title": {
      const item = TITLE_ITEMS[state.menuIndex];
      const remembered = { ...state, titleIndex: state.menuIndex };
      if (item === "SOLO") return startMatch(remembered, "solo");
      if (item === "VERSUS") return startMatch(remembered, "versus");
      if (item === "HOW TO PLAY") {
        return { ...remembered, screen: "howto", menuIndex: 0 };
      }
      return remembered;
    }
    case "howto":
      return returnToTitle(state);
    case "paused": {
      const item = PAUSE_ITEMS[state.menuIndex];
      if (item === "RESUME") return { ...state, screen: state.resumeScreen };
      if (item === "RESTART") return startMatch(state, state.mode);
      if (item === "QUIT TO MENU") return returnToTitle(state);
      return { ...state };
    }
    case "matchover": {
      const item = MATCHOVER_ITEMS[state.menuIndex];
      if (item === "PLAY AGAIN") return startMatch(state, state.mode);
      if (item === "MENU") return returnToTitle(state);
      return { ...state };
    }
    default:
      return { ...state };
  }
}

/** The menu edges of one screen: up before down, movement before confirm. */
function applyMenuEdges(state: S, input: FrameInput): CaromState {
  const up = input.up1 || input.up2;
  const down = input.down1 || input.down2;
  if (up) return moveMenu(state, -1);
  if (down) return moveMenu(state, 1);
  if (input.confirm) return confirmMenu(state);
  return { ...state };
}

/** The keyboard's effect on the screen the frame began on. */
function applyKeyboard(state: S, input: FrameInput): CaromState {
  switch (state.screen) {
    case "title":
      return applyMenuEdges(state, input);
    case "howto":
      if (input.back) return returnToTitle(state);
      return applyMenuEdges(state, input);
    case "countdown":
    case "playing":
      if (input.pause) {
        return {
          ...state,
          resumeScreen: state.screen,
          screen: "paused",
          menuIndex: 0,
        };
      }
      return { ...state };
    case "paused":
      if (input.pause || input.back) {
        return { ...state, screen: state.resumeScreen };
      }
      return applyMenuEdges(state, input);
    case "matchover":
      if (input.back) return returnToTitle(state);
      return applyMenuEdges(state, input);
  }
}

/**
 * The pointer and touch contacts over the menu `screen` shows, applied after
 * the keyboard. A press is remembered until its release so a confirm needs
 * both edges inside one item. `live` is whether the keyboard left the frame on
 * the screen it began on; when it did not, the samples only keep the press
 * bookkeeping current and select nothing.
 */
function applyPointer(
  state: CaromState,
  screen: Screen,
  samples: readonly PointerSample[],
  live: boolean,
): CaromState {
  let next = state;
  let presses: readonly MenuPress[] = state.menuPresses;
  for (const sample of samples) {
    const item = live ? menuItemAt(screen, sample.x, sample.y) : null;
    if (sample.type === "down") {
      presses = [
        ...presses.filter((p) => p.id !== sample.id),
        { id: sample.id, item },
      ];
      if (item !== null) next = { ...next, menuIndex: item };
    } else if (sample.type === "move") {
      if (item !== null) next = { ...next, menuIndex: item };
    } else {
      // A release is also where the pointer now is, so it selects like a
      // move; it confirms only the item its own press landed on.
      const press = presses.find((p) => p.id === sample.id);
      presses = presses.filter((p) => p.id !== sample.id);
      if (item !== null) next = { ...next, menuIndex: item };
      if (item !== null && press !== undefined && press.item === item) {
        next = confirmMenu({ ...next, menuPresses: presses });
      }
    }
  }
  return { ...next, menuPresses: presses };
}

// ---- Paddles ---------------------------------------------------------------

/** The velocity a human player's held actions ask of a paddle. */
function humanVelocity(up: number, down: number): number {
  return (down - up) * PADDLE_SPEED;
}

/** Both paddles after the frame: driven, by the AI, or by the players. */
function movePaddles(
  state: S,
  input: FrameInput,
  dt: number,
): { left: PaddleState; right: PaddleState } {
  const { held } = input;
  const { left, right } = state.paddles;
  const solo = state.mode === "solo";

  const leftVy = left.driven
    ? left.drivenVy
    : solo
      ? humanVelocity(
          Math.max(held.p1Up, held.p2Up),
          Math.max(held.p1Down, held.p2Down),
        )
      : humanVelocity(held.p1Up, held.p1Down);

  const rightVy = right.driven
    ? right.drivenVy
    : solo
      ? aiVelocity(state, dt)
      : humanVelocity(held.p2Up, held.p2Down);

  return {
    left: integratePaddle(left, leftVy, dt),
    right: integratePaddle(right, rightVy, dt),
  };
}

// ---- The ball ------------------------------------------------------------

/** The served ball: leaving the home point toward `receiver`. */
function serve(ball: DeepReadonly<BallState>, receiver: Side): BallState {
  const dir = receiver === "left" ? -1 : 1;
  return {
    ...ball,
    held: false,
    holdTimer: 0,
    trail: [],
    vx: dir * SERVE_SPEED * Math.cos(SERVE_ANGLE),
    vy: ball.serveSign * SERVE_SPEED * Math.sin(SERVE_ANGLE),
  };
}

/** The ball with this frame's sample appended and the stale ones dropped. */
function sampleTrail(ball: BallState, simTime: number): BallState {
  const trail = [
    ...ball.trail.filter((s) => simTime - s.t <= TRAIL_TIME),
    { x: ball.x, y: ball.y, t: simTime },
  ];
  return { ...ball, trail };
}

function wins(own: number, other: number): boolean {
  return own >= WIN_SCORE && own - other >= WIN_LEAD;
}

/** A point for `scorer`: the score, then either match over or the next serve. */
function scorePoint(state: CaromState, scorer: Side): CaromState {
  const score =
    scorer === "left"
      ? { p1: state.score.p1 + 1, p2: state.score.p2 }
      : { p1: state.score.p1, p2: state.score.p2 + 1 };
  const won =
    scorer === "left" ? wins(score.p1, score.p2) : wins(score.p2, score.p1);
  if (won) {
    return {
      ...state,
      score,
      winner: scorer,
      screen: "matchover",
      menuIndex: 0,
    };
  }
  return {
    ...state,
    score,
    receiver: scorer === "left" ? "right" : "left",
    ball: { ...parkedBall(), holdTimer: HOLD_TIME },
    screen: "countdown",
  };
}

// ---- Advancing a screen -------------------------------------------------

/** The cues a frame raises, each at most once. */
type Cues = Set<string>;

function advanceCountdown(
  state: S,
  input: FrameInput,
  dt: number,
  simTime: number,
): CaromState {
  const paddles = movePaddles(state, input, dt);
  const ball = state.ball;
  if (ball === null) return { ...state, paddles };

  const holdTimer = ball.holdTimer - dt;
  if (holdTimer <= 0) {
    const served = sampleTrail(serve(ball, state.receiver), simTime);
    return { ...state, paddles, ball: served, screen: "playing" };
  }
  return {
    ...state,
    paddles,
    ball: sampleTrail({ ...ball, holdTimer }, simTime),
  };
}

function advancePlaying(
  state: S,
  input: FrameInput,
  dt: number,
  simTime: number,
  cues: Cues,
): CaromState {
  const paddles = movePaddles(state, input, dt);
  const current = state.ball;
  if (current === null) return { ...state, paddles };
  if (current.held) {
    return { ...state, paddles, ball: sampleTrail({ ...current }, simTime) };
  }

  const { ball, events } = stepBall(current, paddles, state.obstacles, dt);
  if (events.paddleHit) cues.add(CUES.paddleHit);
  if (events.wallBounce) cues.add(CUES.wallBounce);
  if (events.obstacleBounce) cues.add(CUES.obstacleBounce);

  const next: CaromState = { ...state, paddles, ball };
  const scorer = goalCrossed(ball);
  if (scorer !== null) {
    cues.add(CUES.score);
    const scored = scorePoint(next, scorer);
    return scored.ball === null
      ? scored
      : { ...scored, ball: sampleTrail(scored.ball, simTime) };
  }
  return { ...next, ball: sampleTrail(ball, simTime) };
}

function advanceScreen(
  state: CaromState,
  input: FrameInput,
  dt: number,
  simTime: number,
  cues: Cues,
): CaromState {
  switch (state.screen) {
    case "countdown":
      return advanceCountdown(state, input, dt, simTime);
    case "playing":
      return advancePlaying(state, input, dt, simTime, cues);
    default:
      return state;
  }
}

// ---- The frame -----------------------------------------------------------

/** One frame of Carom: the next state from the current one. */
export function updateGame(state: S, api: UpdateApi, dt: number): CaromState {
  // The mute bit is the runtime's. The game toggles it from any screen and
  // pushes a posed value into it, then mirrors what the runtime holds.
  const muted = api.input.pressed("mute") ? !state.muted : state.muted;
  if (api.audio.muted() !== muted) api.audio.setMuted(muted);

  const simTime = state.simTime + dt;
  const input = readInput(api);
  const begunOn = state.screen;

  const afterKeys = applyKeyboard(state, input);
  const live = afterKeys.screen === begunOn && menuFor(begunOn) !== null;
  const afterPointer = applyPointer(afterKeys, begunOn, input.samples, live);

  const cues: Cues = new Set();
  const advanced = advanceScreen(afterPointer, input, dt, simTime, cues);
  for (const cue of cues) api.audio.play(cue);

  // A press belongs to the screen it landed on: leaving that screen forgets it.
  const menuPresses = advanced.screen === begunOn ? advanced.menuPresses : [];
  return { ...advanced, menuPresses, simTime, muted: api.audio.muted() };
}
