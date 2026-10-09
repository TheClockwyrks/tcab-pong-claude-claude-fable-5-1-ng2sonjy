// Carom — captures the showcase media into `showcase/`: screenshots of the
// running game drawn by its own renderer onto a Node canvas, and a replay of a
// rally recorded with the engine's recorder. Everything is driven through the
// debug surface, so the capture is scripted and repeatable.
//
//   node scripts/capture-showcase.mjs
//
// The game's TypeScript sources are loaded through Vite's SSR module loader,
// which resolves them exactly as the build does.

/* global console, EventTarget */

import { gzipSync } from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { createServer } from "vite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "showcase");

const STEP_MS = 1000 / 60;
const DPR = 1.5;

const vite = await createServer({
  root,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "error",
  // The engine is published with extensionless imports that Vite resolves and
  // plain Node does not, so it is loaded through Vite like the game itself.
  ssr: { noExternal: ["@clockwyrks/simple-2d"] },
});

try {
  const { ConstantClock, createEngine } = await vite.ssrLoadModule(
    "@clockwyrks/simple-2d",
  );
  const { BACKGROUND, game } = await vite.ssrLoadModule("/src/game.ts");
  const { CUES, FIELD_H, FIELD_W, LAYOUT } =
    await vite.ssrLoadModule("/src/constants.ts");

  const canvas = createCanvas(FIELD_W * DPR, FIELD_H * DPR);
  const target = new EventTarget();
  const engine = createEngine({
    canvas,
    width: FIELD_W,
    height: FIELD_H,
    game,
    background: BACKGROUND,
    layout: LAYOUT,
    clock: new ConstantClock(STEP_MS),
    surface: {
      cssWidth: () => FIELD_W,
      cssHeight: () => FIELD_H,
      dpr: () => DPR,
      events: () => target,
    },
  });
  const debug = await engine.initialize().then(() => engine.debug);
  const pose = (transition) => engine.apply(transition);
  const snapshot = () => debug.snapshot(engine.state);

  let obstacleBounces = 0;
  let paddleHits = 0;
  engine.events.on("cue:played", (event) => {
    if (event.cue === CUES.obstacleBounce) obstacleBounces++;
    if (event.cue === CUES.paddleHit) paddleHits++;
  });

  await mkdir(outDir, { recursive: true });
  const screenshot = async (name) => {
    await writeFile(join(outDir, name), canvas.toBuffer("image/png"));
    console.log(`wrote ${name}`);
  };

  // ---- The title screen -------------------------------------------------
  await engine.advance(1);
  await screenshot("title.png");

  // ---- A rally -----------------------------------------------------------
  // Versus, both paddles driven by a script that meets the ball a little off
  // center while moving, so every strike carries spin and leaves at an angle
  // that works the walls and the blocks.
  pose((s) => debug.setMode(s, "versus"));
  pose((s) => debug.setScreen(s, "countdown"));
  pose((s) => debug.setBallServeSign(s, -1));
  pose((s) => debug.setPaddleDriven(s, "left", true));
  pose((s) => debug.setPaddleDriven(s, "right", true));

  const chase = (side, ball, cy, lead, speed) => {
    if (ball === null) return 0;
    const incoming = side === "left" ? ball.vx < 0 : ball.vx > 0;
    const target = incoming ? ball.y + lead : 360;
    const diff = target - cy;
    if (Math.abs(diff) < 6) return 0;
    return Math.sign(diff) * Math.min(speed, Math.abs(diff) / (STEP_MS / 1000));
  };

  const frame = async (count) => {
    for (let i = 0; i < count; i++) {
      const { ball, paddles } = engine.state;
      const t = snapshot().simTime;
      // The lead alternates over time so the paddles strike moving in both
      // directions and the ball curves both ways.
      const lead = 26 * Math.sin(t * 1.7);
      pose((s) =>
        debug.setPaddleVy(
          s,
          "left",
          chase("left", ball, paddles.left.cy, lead, 650),
        ),
      );
      pose((s) =>
        debug.setPaddleVy(
          s,
          "right",
          chase("right", ball, paddles.right.cy, -lead, 650),
        ),
      );
      await engine.advance(1);
    }
  };

  // Let the serve go and the rally settle in, then record a few seconds.
  await frame(90);
  engine.startRecording();
  await frame(420);
  const recording = engine.stopRecording();
  await writeFile(
    join(outDir, "rally.json.gz"),
    gzipSync(JSON.stringify(recording), { level: 9 }),
  );
  console.log(
    `wrote rally.json.gz (${recording.frames.length} frames, ${paddleHits} paddle hits, ${obstacleBounces} block bounces)`,
  );

  // Carry on until the ball is mid-field with a visible, curving trail.
  for (let i = 0; i < 600; i++) {
    await frame(1);
    const s = snapshot();
    const b = s.ball;
    if (
      s.screen === "playing" &&
      b !== null &&
      b.x > 400 &&
      b.x < 880 &&
      b.y > 150 &&
      b.y < 570 &&
      Math.abs(b.spin) > 150 &&
      b.trail.length > 5
    ) {
      break;
    }
  }
  await screenshot("rally.png");

  // ---- Match point ---------------------------------------------------------
  // A fresh ball, so no trail from the rally reaches across the field.
  pose((s) => debug.setScore(s, 10, 9));
  pose((s) => debug.setScreen(s, "playing"));
  pose((s) => debug.spawnBall(s));
  pose((s) => debug.setBallHeld(s, false));
  pose((s) => debug.setBallPosition(s, FIELD_W - 60, 300));
  pose((s) => debug.setBallVelocity(s, 900, 120));
  pose((s) => debug.setPaddleDriven(s, "left", false));
  pose((s) => debug.setPaddleDriven(s, "right", false));
  for (let i = 0; i < 10 && snapshot().screen !== "matchover"; i++) {
    await engine.advance(1);
  }
  await screenshot("matchover.png");

  engine.destroy();
} finally {
  await vite.close();
}
