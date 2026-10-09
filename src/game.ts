// Carom — the game: the state it holds, the debug surface that poses and reads
// that state, and the three functions the engine drives.
//
// The simulation itself lives in the modules beside this file. `update.ts`
// advances a frame, `render.ts` draws one, `debug.ts` builds the automation
// surface, and `world.ts`, `physics.ts`, `ai.ts`, and `menu.ts` hold the rules
// those three are written from. This file declares the types they all share and
// wires them to the engine.

import type {
  Game,
  InitApi,
  RenderApi,
  UpdateApi,
} from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import { ACTIONS, BINDINGS, CUES } from "./constants";
import { createDebugApi } from "./debug";
import { renderGame } from "./render";
import { updateGame } from "./update";
import { initialState } from "./world";

// ---- The state (specs/state.md) -------------------------------------------

export type Screen =
  "title" | "howto" | "countdown" | "playing" | "paused" | "matchover";

export type Mode = "solo" | "versus";

export type Side = "left" | "right";

export interface PaddleState {
  readonly cy: number;
  readonly vy: number;
  readonly driven: boolean;
  readonly drivenVy: number;
}

export interface AiState {
  readonly tracking: boolean;
  readonly movement: boolean;
}

export interface TrailSample {
  readonly x: number;
  readonly y: number;
  readonly t: number;
}

export interface BallState {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly spin: number;
  readonly held: boolean;
  readonly holdTimer: number;
  readonly serveSign: 1 | -1;
  readonly trail: readonly TrailSample[];
}

export interface ObstacleState {
  readonly index: number;
  readonly cx: number;
  readonly cy: number;
}

/**
 * Where a pointer or touch contact landed, kept while it is held so its release
 * can be matched against the same menu item. `id` is the engine's pointer id
 * and `item` the index of the menu item under the press, or `null` when it
 * landed outside every item. This is transient input bookkeeping rather than
 * game state: the snapshot does not report it and `reset` empties it.
 */
export interface MenuPress {
  readonly id: number;
  readonly item: number | null;
}

export interface CaromState {
  readonly screen: Screen;
  readonly mode: Mode;
  readonly menuIndex: number;
  readonly titleIndex: number;
  readonly resumeScreen: "countdown" | "playing";

  readonly score: { readonly p1: number; readonly p2: number };
  readonly winner: Side | null;

  readonly paddles: { readonly left: PaddleState; readonly right: PaddleState };
  readonly ai: AiState;

  readonly receiver: Side;
  readonly ball: BallState | null;
  readonly obstacles: readonly ObstacleState[];

  readonly simTime: number;
  readonly muted: boolean;

  /** Pointer and touch presses still held on a menu. See `MenuPress`. */
  readonly menuPresses: readonly MenuPress[];
}

// ---- The debug surface (specs/instrumentation.md) --------------------------

export interface MenuItemRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface PaddleSnapshot {
  readonly cy: number;
  readonly vy: number;
  readonly drivenVy: number;
  readonly driven: boolean;
}

export interface BallSnapshot {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly speed: number;
  readonly spin: number;
  readonly held: boolean;
  readonly holdTimer: number;
  readonly serveSign: 1 | -1;
  readonly trail: readonly TrailSample[];
}

export interface CaromSnapshot {
  readonly version: number;
  readonly screen: Screen;
  readonly mode: Mode;
  readonly menuIndex: number;
  readonly titleIndex: number;
  readonly resumeScreen: "countdown" | "playing";
  readonly score: { readonly p1: number; readonly p2: number };
  readonly winner: Side | null;
  readonly muted: boolean;
  readonly paddles: {
    readonly left: PaddleSnapshot;
    readonly right: PaddleSnapshot;
  };
  readonly ai: AiState;
  readonly receiver: Side;
  readonly ball: BallSnapshot | null;
  readonly obstacles: readonly ObstacleState[];
  readonly simTime: number;
}

type S = DeepReadonly<CaromState>;

export interface CaromDebugApi {
  readonly version: number;

  // The world.
  clearWorld(state: S): CaromState;
  spawnBall(state: S): CaromState;
  spawnObstacle(state: S, index: number): CaromState;
  reset(state: S): CaromState;
  reconcile(state: S): CaromState;

  // Screens and menus.
  setScreen(state: S, screen: Screen): CaromState;
  setMode(state: S, mode: Mode): CaromState;
  setMenuIndex(state: S, index: number): CaromState;
  setTitleIndex(state: S, index: number): CaromState;
  setResumeScreen(state: S, screen: "countdown" | "playing"): CaromState;

  // Match state.
  setScore(state: S, p1: number, p2: number): CaromState;
  setWinner(state: S, side: Side | null): CaromState;
  setReceiver(state: S, side: Side): CaromState;

  // Paddles.
  setPaddleCy(state: S, side: Side, cy: number): CaromState;
  setPaddleVy(state: S, side: Side, vy: number): CaromState;
  setPaddleDriven(state: S, side: Side, driven: boolean): CaromState;

  // The ball.
  setBallPosition(state: S, x: number, y: number): CaromState;
  setBallVelocity(state: S, vx: number, vy: number): CaromState;
  setBallSpin(state: S, spin: number): CaromState;
  setBallHeld(state: S, held: boolean): CaromState;
  setBallHoldTimer(state: S, seconds: number): CaromState;
  setBallServeSign(state: S, sign: 1 | -1): CaromState;
  drawBallServeSign(state: S): CaromState;

  // The AI opponent.
  setAiTracking(state: S, enabled: boolean): CaromState;
  setAiMovement(state: S, enabled: boolean): CaromState;

  // Audio.
  setMuted(state: S, muted: boolean): CaromState;

  // Readings.
  snapshot(state: S): CaromSnapshot;
  menuItemRect(state: S, index: number): MenuItemRect | null;
}

// ---- The game -------------------------------------------------------------

/**
 * The field background, a CSS color string. `src/main.ts` hands it to the engine
 * as the color the canvas is cleared to each frame, so the letterbox bars around
 * the field match the field itself.
 */
export const BACKGROUND = "#0b0e17";

/** Formats a position as one short overlay line. */
function point(x: number, y: number): string {
  return `${x.toFixed(1)}, ${y.toFixed(1)}`;
}

function registerDiagnostics(api: InitApi<CaromState>): void {
  const d = api.diagnostics;
  d.register("screen", (s) => s.screen);
  d.register("mode", (s) => s.mode);
  d.register("score", (s) => `${s.score.p1} - ${s.score.p2}`);
  d.register("ball pos", (s) => (s.ball ? point(s.ball.x, s.ball.y) : "none"));
  d.register("ball vel", (s) =>
    s.ball ? point(s.ball.vx, s.ball.vy) : "none",
  );
  d.register("ball speed", (s) =>
    s.ball ? Math.hypot(s.ball.vx, s.ball.vy).toFixed(1) : "none",
  );
  d.register("ball spin", (s) => (s.ball ? s.ball.spin.toFixed(1) : "none"));
  d.register("left paddle", (s) => point(s.paddles.left.cy, s.paddles.left.vy));
  d.register("right paddle", (s) =>
    point(s.paddles.right.cy, s.paddles.right.vy),
  );
}

/** The game this build's engine drives. */
export const game: Game<CaromState, CaromDebugApi> = {
  initialize(api: InitApi<CaromState>): [CaromState, CaromDebugApi] {
    for (const action of ACTIONS) {
      api.input.register(action, { keys: [...BINDINGS[action]] });
    }

    api.audio.define(CUES.paddleHit, {
      wave: "square",
      freq: 520,
      freqTo: 390,
      durationMs: 70,
      gain: 0.18,
    });
    api.audio.define(CUES.wallBounce, {
      wave: "triangle",
      freq: 300,
      freqTo: 240,
      durationMs: 50,
      gain: 0.16,
    });
    api.audio.define(CUES.obstacleBounce, {
      wave: "sawtooth",
      freq: 180,
      freqTo: 140,
      durationMs: 60,
      gain: 0.14,
    });
    api.audio.define(CUES.score, {
      wave: "sine",
      freq: 660,
      freqTo: 990,
      durationMs: 220,
      gain: 0.2,
    });

    registerDiagnostics(api);

    return [initialState(false), createDebugApi()];
  },

  update(state: S, api: UpdateApi, dt: number): CaromState {
    return updateGame(state, api, dt);
  },

  render(state: S, api: RenderApi): void {
    renderGame(state, api.ctx);
  },
};
