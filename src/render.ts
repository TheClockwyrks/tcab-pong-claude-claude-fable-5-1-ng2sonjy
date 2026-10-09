// Carom — drawing a frame, in the field's logical units. Everything here is a
// pure read of the state handed over; nothing is drawn from anywhere else.

import type { DeepReadonly } from "ts-essentials";
import {
  BALL_R,
  FIELD_CX,
  FIELD_CY,
  FIELD_H,
  FIELD_W,
  HOLD_TIME,
  NET_X,
  OBSTACLE_H,
  OBSTACLE_W,
  P1_X0,
  P2_X0,
  PADDLE_H,
  PADDLE_HALF,
  PADDLE_W,
  TITLE_TEXT,
  TRAIL_TIME,
} from "./constants";
import type { BallState, CaromState, Side } from "./game";
import {
  MENU_ITEM_H,
  MENU_ITEM_W,
  menuFor,
  menuItemCenterY,
  type MenuLayout,
} from "./menu";

type S = DeepReadonly<CaromState>;
type Ctx = CanvasRenderingContext2D;

/** The palette. The field is dark and every body is a bright solid color. */
export const COLORS = {
  line: "#1a2136",
  net: "#2c3654",
  left: "#4fe3ff",
  right: "#ff5c8a",
  ball: "#fff3b0",
  obstacle: "#9dff5c",
  text: "#e8edff",
  dim: "#8b95b8",
  accent: "#ffd166",
  shade: "rgba(6, 8, 16, 0.72)",
} as const;

const FONT = "'Segoe UI', 'Helvetica Neue', Arial, 'DejaVu Sans', sans-serif";

function font(size: number, weight: "bold" | "normal" = "bold"): string {
  return `${weight} ${size}px ${FONT}`;
}

function roundedRect(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

function glowingBody(
  ctx: Ctx,
  color: string,
  blur: number,
  draw: () => void,
): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  draw();
  ctx.restore();
}

function label(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  size: number,
  color: string,
  weight: "bold" | "normal" = "bold",
  align: CanvasTextAlign = "center",
): void {
  ctx.font = font(size, weight);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
}

// ---- The field and its furniture ----------------------------------------

function drawField(ctx: Ctx): void {
  // The walls, as faint lines just inside the top and bottom edges.
  ctx.strokeStyle = COLORS.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 1);
  ctx.lineTo(FIELD_W, 1);
  ctx.moveTo(0, FIELD_H - 1);
  ctx.lineTo(FIELD_W, FIELD_H - 1);
  ctx.stroke();

  // A center circle, decoration only.
  ctx.beginPath();
  ctx.arc(FIELD_CX, FIELD_CY, 72, 0, Math.PI * 2);
  ctx.stroke();

  // The dashed net.
  ctx.save();
  ctx.strokeStyle = COLORS.net;
  ctx.lineWidth = 4;
  ctx.setLineDash([18, 14]);
  ctx.beginPath();
  ctx.moveTo(NET_X, 0);
  ctx.lineTo(NET_X, FIELD_H);
  ctx.stroke();
  ctx.restore();
}

function drawPaddle(ctx: Ctx, side: Side, cy: number): void {
  const x = side === "left" ? P1_X0 : P2_X0;
  const color = side === "left" ? COLORS.left : COLORS.right;
  glowingBody(ctx, color, 18, () => {
    roundedRect(ctx, x, cy - PADDLE_HALF, PADDLE_W, PADDLE_H, 7);
    ctx.fill();
  });
}

function drawObstacle(ctx: Ctx, cx: number, cy: number): void {
  glowingBody(ctx, COLORS.obstacle, 14, () => {
    roundedRect(
      ctx,
      cx - OBSTACLE_W / 2,
      cy - OBSTACLE_H / 2,
      OBSTACLE_W,
      OBSTACLE_H,
      9,
    );
    ctx.fill();
  });
}

/** `color` faded toward the field background by `amount` in `[0, 1]`. */
function fadedToBackground(color: readonly number[], amount: number): string {
  const bg = [11, 14, 23]; // BACKGROUND, #0b0e17
  const [r, g, b] = color.map((c, i) =>
    Math.round(bg[i] + (c - bg[i]) * amount),
  );
  return `rgb(${r}, ${g}, ${b})`;
}

const BALL_RGB = [255, 243, 176] as const; // COLORS.ball

function drawTrail(ctx: Ctx, ball: DeepReadonly<BallState>, now: number): void {
  const samples = ball.trail;
  if (samples.length < 2) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    // Older samples fade and thin out; the newest is nearly the ball's width.
    // The fade blends toward the background rather than through alpha, so the
    // overlapping round segments do not bead where they meet.
    const age = Math.min(1, Math.max(0, (now - b.t) / TRAIL_TIME));
    ctx.strokeStyle = fadedToBackground(BALL_RGB, 0.6 * (1 - age));
    ctx.lineWidth = 2 + (BALL_R * 1.6 - 2) * (1 - age);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBall(ctx: Ctx, ball: DeepReadonly<BallState>): void {
  glowingBody(ctx, COLORS.ball, 22, () => {
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
    ctx.fill();
  });
  // A small highlight gives the ball a little volume.
  ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
  ctx.beginPath();
  ctx.arc(ball.x - BALL_R * 0.35, ball.y - BALL_R * 0.35, BALL_R * 0.3, 0, 7);
  ctx.fill();
}

/** The pre-serve hold: a ring that empties as the hold runs out. */
function drawCountdown(ctx: Ctx, state: S): void {
  const ball = state.ball;
  if (ball === null) return;
  const remaining = Math.max(0, Math.min(1, ball.holdTimer / HOLD_TIME));
  ctx.save();
  ctx.strokeStyle = COLORS.accent;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(
    ball.x,
    ball.y,
    BALL_R + 16,
    -Math.PI / 2,
    -Math.PI / 2 + Math.PI * 2 * remaining,
  );
  ctx.stroke();

  // The serve direction, as a chevron toward the receiver.
  const dir = state.receiver === "left" ? -1 : 1;
  const tipX = ball.x + dir * (BALL_R + 46);
  ctx.beginPath();
  ctx.moveTo(tipX - dir * 12, ball.y - 12);
  ctx.lineTo(tipX, ball.y);
  ctx.lineTo(tipX - dir * 12, ball.y + 12);
  ctx.stroke();
  ctx.restore();
}

function drawWorld(ctx: Ctx, state: S): void {
  drawField(ctx);
  for (const o of state.obstacles) drawObstacle(ctx, o.cx, o.cy);
  drawPaddle(ctx, "left", state.paddles.left.cy);
  drawPaddle(ctx, "right", state.paddles.right.cy);
  if (state.ball !== null) {
    drawTrail(ctx, state.ball, state.simTime);
    drawBall(ctx, state.ball);
  }
}

// ---- The HUD ---------------------------------------------------------------

function modeLabel(state: S): string {
  return state.mode === "solo" ? "SOLO · YOU vs CPU" : "VERSUS · P1 vs P2";
}

function drawHud(ctx: Ctx, state: S): void {
  label(ctx, String(state.score.p1), FIELD_CX - 110, 72, 64, COLORS.left);
  label(ctx, String(state.score.p2), FIELD_CX + 110, 72, 64, COLORS.right);
  label(ctx, modeLabel(state), FIELD_CX, 30, 16, COLORS.dim);
}

// ---- Menus ---------------------------------------------------------------

function drawMenu(ctx: Ctx, layout: MenuLayout, menuIndex: number): void {
  layout.items.forEach((item, index) => {
    const cy = menuItemCenterY(layout, index);
    const selected = index === menuIndex;
    if (selected) {
      ctx.save();
      ctx.fillStyle = "rgba(255, 209, 102, 0.14)";
      ctx.strokeStyle = COLORS.accent;
      ctx.lineWidth = 2;
      roundedRect(
        ctx,
        FIELD_CX - MENU_ITEM_W / 2,
        cy - MENU_ITEM_H / 2,
        MENU_ITEM_W,
        MENU_ITEM_H,
        12,
      );
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    label(ctx, item, FIELD_CX, cy, 28, selected ? COLORS.accent : COLORS.text);
  });
}

function shade(ctx: Ctx): void {
  ctx.fillStyle = COLORS.shade;
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);
}

function drawTitle(ctx: Ctx, state: S): void {
  ctx.save();
  ctx.globalAlpha = 0.28;
  drawWorld(ctx, state);
  ctx.restore();

  ctx.save();
  ctx.shadowColor = COLORS.left;
  ctx.shadowBlur = 36;
  label(ctx, TITLE_TEXT, FIELD_CX, 190, 128, COLORS.text);
  ctx.restore();
  label(
    ctx,
    "A TOP-DOWN PADDLE DUEL — SPIN THE BALL, BANK IT OFF THE BLOCKS",
    FIELD_CX,
    272,
    18,
    COLORS.dim,
    "normal",
  );

  const layout = menuFor("title");
  if (layout !== null) drawMenu(ctx, layout, state.menuIndex);

  label(
    ctx,
    "W / S  AND  ↑ / ↓  MOVE  ·  ENTER  CONFIRM  ·  ESC  BACK  ·  M  MUTE",
    FIELD_CX,
    FIELD_H - 36,
    15,
    COLORS.dim,
    "normal",
  );
}

/** A line of the how-to copy: text, color, and its center y. */
type HowtoLine = readonly [string, string, number];

const HOWTO_LEFT: readonly HowtoLine[] = [
  ["CONTROLS", COLORS.accent, 150],
  ["Player one moves the left paddle with  W / S", COLORS.text, 190],
  ["Player two moves the right paddle with  ↑ / ↓", COLORS.text, 220],
  ["In Solo either pair moves your paddle;", COLORS.dim, 250],
  ["the CPU takes the right side.", COLORS.dim, 278],
  ["Enter / Space confirm  ·  Esc back", COLORS.dim, 312],
  ["P / Esc pause  ·  M mute", COLORS.dim, 340],
  ["SCORING", COLORS.accent, 396],
  ["A ball past the far edge scores.", COLORS.text, 436],
  ["First to 11, two clear, wins the match.", COLORS.text, 466],
];

const HOWTO_RIGHT: readonly HowtoLine[] = [
  ["SPIN", COLORS.accent, 150],
  ["Where the ball meets your paddle sets its", COLORS.text, 190],
  ["angle: the edges send it steep.", COLORS.text, 220],
  ["Strike while your paddle is moving and the", COLORS.text, 254],
  ["ball curves that way. Moving down bends it", COLORS.text, 284],
  ["clockwise, moving up the other way. Spin", COLORS.text, 314],
  ["fades in about a second, so a late flick", COLORS.text, 344],
  ["curves the most.", COLORS.text, 374],
  ["THE BLOCKS", COLORS.accent, 426],
  ["Two fixed blocks flank the net. The ball", COLORS.text, 466],
  ["banks off them at full speed, so curve a", COLORS.text, 496],
  ["shot around one, or carom off it.", COLORS.text, 526],
];

function drawHowtoColumn(ctx: Ctx, x: number, lines: readonly HowtoLine[]) {
  for (const [text, color, y] of lines) {
    const heading = text === text.toUpperCase();
    label(ctx, text, x, y, heading ? 22 : 18, color, "normal", "left");
  }
}

/** The bodies of the game, named, in a row starting at `(x, y)`. */
function drawLegend(ctx: Ctx, x: number, y: number): void {
  const bar = (bx: number, color: string, w: number) =>
    glowingBody(ctx, color, 12, () => {
      roundedRect(ctx, bx, y - 18, w, 36, 5);
      ctx.fill();
    });
  bar(x, COLORS.left, 12);
  label(ctx, "YOU / P1", x + 26, y, 17, COLORS.dim, "normal", "left");
  bar(x + 140, COLORS.right, 12);
  label(ctx, "CPU / P2", x + 166, y, 17, COLORS.dim, "normal", "left");
  bar(x + 280, COLORS.obstacle, 14);
  label(ctx, "BLOCK", x + 308, y, 17, COLORS.dim, "normal", "left");
  glowingBody(ctx, COLORS.ball, 12, () => {
    ctx.beginPath();
    ctx.arc(x + 404, y, 9, 0, Math.PI * 2);
    ctx.fill();
  });
  label(ctx, "BALL", x + 428, y, 17, COLORS.dim, "normal", "left");
}

function drawHowto(ctx: Ctx, state: S): void {
  ctx.save();
  ctx.globalAlpha = 0.18;
  drawWorld(ctx, state);
  ctx.restore();

  label(ctx, "HOW TO PLAY", FIELD_CX, 70, 52, COLORS.text);
  drawHowtoColumn(ctx, 110, HOWTO_LEFT);
  drawHowtoColumn(ctx, 700, HOWTO_RIGHT);
  drawLegend(ctx, 110, 540);

  const layout = menuFor("howto");
  if (layout !== null) drawMenu(ctx, layout, state.menuIndex);
}

function drawPaused(ctx: Ctx, state: S): void {
  drawWorld(ctx, state);
  drawHud(ctx, state);
  shade(ctx);
  label(ctx, "PAUSED", FIELD_CX, 230, 72, COLORS.text);
  const layout = menuFor("paused");
  if (layout !== null) drawMenu(ctx, layout, state.menuIndex);
}

function winnerCopy(state: S): string {
  if (state.winner === "left") {
    return state.mode === "solo" ? "YOU WIN" : "PLAYER ONE WINS";
  }
  if (state.winner === "right") {
    return state.mode === "solo" ? "CPU WINS" : "PLAYER TWO WINS";
  }
  return "MATCH OVER";
}

function drawMatchOver(ctx: Ctx, state: S): void {
  drawWorld(ctx, state);
  shade(ctx);
  const color =
    state.winner === "left"
      ? COLORS.left
      : state.winner === "right"
        ? COLORS.right
        : COLORS.text;
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 28;
  label(ctx, winnerCopy(state), FIELD_CX, 210, 72, color);
  ctx.restore();
  label(ctx, "FINAL SCORE", FIELD_CX, 290, 18, COLORS.dim, "normal");
  label(ctx, String(state.score.p1), FIELD_CX - 70, 350, 64, COLORS.left);
  label(ctx, "–", FIELD_CX, 350, 48, COLORS.dim, "normal");
  label(ctx, String(state.score.p2), FIELD_CX + 70, 350, 64, COLORS.right);
  const layout = menuFor("matchover");
  if (layout !== null) drawMenu(ctx, layout, state.menuIndex);
}

// ---- The frame -----------------------------------------------------------

/** Draws `state` onto `ctx`, which arrives cleared and in logical units. */
export function renderGame(state: S, ctx: Ctx): void {
  switch (state.screen) {
    case "title":
      drawTitle(ctx, state);
      break;
    case "howto":
      drawHowto(ctx, state);
      break;
    case "countdown":
      drawWorld(ctx, state);
      drawHud(ctx, state);
      drawCountdown(ctx, state);
      break;
    case "playing":
      drawWorld(ctx, state);
      drawHud(ctx, state);
      break;
    case "paused":
      drawPaused(ctx, state);
      break;
    case "matchover":
      drawMatchOver(ctx, state);
      break;
  }
}
