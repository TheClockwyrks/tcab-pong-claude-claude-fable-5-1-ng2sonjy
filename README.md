# Carom

Carom is a top-down paddle duel that runs entirely in the browser. Two paddles
face each other across a dark field while a ball ricochets between them, off the
top and bottom walls, and off a pair of blocks in the middle of the field. A
player scores when the ball passes the far edge behind their opponent's paddle.
First to 11, two clear, wins.

Carom's defining mechanic is spin: the motion of a paddle at the moment it
strikes the ball curves the ball's flight afterward. Strike while moving down
and the ball bends clockwise; strike while moving up and it bends the other
way. The spin fades over a second or so, and the two blocks turn the open field
into a bank-shot puzzle: curve a shot around one, or carom off it, to catch the
other side out.

Play solo against the CPU, or two players on one keyboard. Everything is drawn
and synthesized in code; the game ships no art or audio files and needs no
backend.

## Installing

Carom is a TypeScript project built with [Vite](https://vite.dev). It needs
Node.js 20 or later.

```sh
npm ci
```

## Running in development

```sh
npm run dev
```

Vite serves the game with hot reload and prints the local URL, normally
`http://localhost:5173/`.

## Building the static site

```sh
npm run build
```

This type-checks the sources and emits the complete static site into `dist/`,
with `index.html` at its root. That directory runs as-is at the root of any
static file server; `npm run preview` serves it locally for a final check.

## Controls

| Action           | Keys                               |
| ---------------- | ---------------------------------- |
| Player one       | `W` up, `S` down                   |
| Player two       | `↑` up, `↓` down                   |
| Confirm          | `Enter` or `Space`                 |
| Back             | `Esc`                              |
| Pause and resume | `P` or `Esc`                       |
| Mute             | `M`                                |
| Debug overlay    | `` ` `` (backtick)                 |

In Solo, either pair of movement keys moves your paddle on the left and the CPU
takes the right. In Versus, each pair moves its own player's paddle. The menus
also take the mouse and touch: move over an item to highlight it, and press and
release on it to choose it. On a touchscreen, on-screen sliders appear for both
paddles.

## Development

| Command             | Does                                                |
| ------------------- | --------------------------------------------------- |
| `npm run typecheck` | `tsc --noEmit`                                      |
| `npm run lint`      | ESLint                                              |
| `npm run format`    | Prettier, in check mode                             |
| `npm test`          | Vitest over `src/**/*.test.ts`, with coverage       |

The tests stand the engine up over a Node canvas and a clock of their own and
step the game frame by frame, so they need no browser. The game is built on the
Simple 2D engine, documented under `engine/`; the game's own specification is
under `specs/`.

`node scripts/capture-showcase.mjs` regenerates the store-page media in
`showcase/`: screenshots drawn by the game's own renderer and a replay recorded
with the engine's recorder.

## Layout

| Path                 | Holds                                                        |
| -------------------- | ------------------------------------------------------------ |
| `src/game.ts`        | The state types, the debug surface's type, and the `Game`    |
| `src/update.ts`      | One frame: input, screens, and advancing the simulation      |
| `src/physics.ts`     | The ball's flight, spin, and every collision                 |
| `src/ai.ts`          | The CPU opponent                                             |
| `src/menu.ts`        | The menus and their hit regions                              |
| `src/render.ts`      | Drawing                                                      |
| `src/debug.ts`       | The debug and automation surface                             |
| `src/world.ts`       | Building the title state, a match start, a parked ball       |
| `src/constants.ts`   | Every figure the specification fixes                         |
| `src/main.ts`        | The entry point that binds the game to the engine            |
| `showcase/`          | The store-page description, carousel, and media              |
