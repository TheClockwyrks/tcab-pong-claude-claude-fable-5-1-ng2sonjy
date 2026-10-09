// Carom — the test harness: the engine stood up over a Node canvas and a
// clock of the test's own, with helpers that press keys, drive the pointer,
// and pose the game through its debug surface.
//
// This file is support for the suites beside it rather than a suite itself,
// which is why its name does not end in `.test.ts`.

import { createCanvas } from "@napi-rs/canvas";
import type { Canvas } from "@napi-rs/canvas";
import { ConstantClock, createEngine } from "@clockwyrks/simple-2d";
import type { Clock, Engine, SurfaceMetrics } from "@clockwyrks/simple-2d";
import { FIELD_H, FIELD_W, LAYOUT } from "./constants";
import { BACKGROUND, game } from "./game";
import type { CaromDebugApi, CaromState } from "./game";

export type CaromEngine = Engine<CaromState, CaromDebugApi>;

/** A frame of 1/60 s, the default clock the harness steps by. */
export const STEP_MS = 1000 / 60;

export interface Harness {
  readonly engine: CaromEngine;
  readonly debug: CaromDebugApi;
  readonly target: EventTarget;
  readonly canvas: Canvas;
  /** Advances `frames` frames. */
  advance(frames: number): Promise<void>;
  /** Advances roughly `seconds` of game time at the harness clock. */
  advanceSeconds(seconds: number): Promise<void>;
  /** Holds a key down until `keyUp`. */
  keyDown(code: string): void;
  keyUp(code: string): void;
  /** Taps a key: down, one frame, up. */
  tap(code: string): Promise<void>;
  /** Poses the game through one of the surface's operations. */
  pose(transition: (s: CaromState) => CaromState): void;
  /** Dispatches a pointer event at logical coordinates. */
  pointer(
    type: "pointerdown" | "pointermove" | "pointerup",
    x: number,
    y: number,
    options?: { id?: number; device?: "mouse" | "touch" },
  ): void;
  /** The cues played since the harness was built, in order. */
  readonly cues: string[];
  destroy(): void;
}

/**
 * Builds the engine over its own canvas and clock. The surface reports the
 * canvas at its logical size with a device pixel ratio of 1, so a logical
 * coordinate is a client coordinate and the pointer needs no mapping.
 */
export async function createHarness(options?: {
  clock?: Clock;
  stepMs?: number;
}): Promise<Harness> {
  const canvas = createCanvas(FIELD_W, FIELD_H);
  const target = new EventTarget();
  const surface: SurfaceMetrics = {
    cssWidth: () => FIELD_W,
    cssHeight: () => FIELD_H,
    dpr: () => 1,
    events: () => target,
  };
  const stepMs = options?.stepMs ?? STEP_MS;
  const engine = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: FIELD_W,
    height: FIELD_H,
    game,
    background: BACKGROUND,
    layout: LAYOUT,
    clock: options?.clock ?? new ConstantClock(stepMs),
    surface,
  });
  const cues: string[] = [];
  engine.events.on("cue:played", (event) => cues.push(event.cue));
  await engine.initialize();

  const dispatch = (type: string, fields: Record<string, unknown>): void => {
    target.dispatchEvent(Object.assign(new Event(type), fields));
  };

  const harness: Harness = {
    engine,
    debug: engine.debug,
    target,
    canvas,
    cues,
    advance: (frames) => engine.advance(frames),
    advanceSeconds: (seconds) =>
      engine.advance(Math.round((seconds * 1000) / stepMs)),
    keyDown: (code) => dispatch("keydown", { code, repeat: false }),
    keyUp: (code) => dispatch("keyup", { code, repeat: false }),
    tap: async (code) => {
      harness.keyDown(code);
      await engine.advance(1);
      harness.keyUp(code);
    },
    pose: (transition) => {
      engine.apply((s) => transition(s as CaromState));
    },
    pointer: (type, x, y, opts) => {
      const device = opts?.device ?? "mouse";
      dispatch(type, {
        clientX: x,
        clientY: y,
        pointerId: opts?.id ?? (device === "touch" ? 7 : 1),
        pointerType: device,
        isPrimary: true,
        button: type === "pointermove" ? -1 : 0,
        buttons: type === "pointerup" ? 0 : 1,
      });
    },
    destroy: () => engine.destroy(),
  };
  return harness;
}
