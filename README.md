# led-matrix

Animation designer, simulator and server for a 64x64 HUB75 LED matrix driven by an Adafruit Matrix Portal S3.

## Layout

- `packages/core` — frame model, effects, animation schema and renderer shared by server and web
- `apps/server` — Fastify API and playback engine (runs TypeScript directly on Node)
- `apps/web` — Vite + React frontend with the panel simulator

## Development

Requires Node 26+ and pnpm 12.

```sh
pnpm install
pnpm dev      # server on :3000, web on :5173
pnpm check    # format, lint, typecheck, test
```

## API

- `GET /api/animations`, `GET /api/animations/:id` — list or fetch animations
- `POST /api/animations` — create (id derived from the name unless given), `PUT`/`DELETE /api/animations/:id`
- `POST /api/play {id}`, `POST /api/stop`, `POST /api/bpm {bpm}`, `GET /api/playback`
- `GET /api/effects` — built-in effects with JSON schemas for their params
- `WS /api/stream` — binary 64x64 RGB frames (12288 bytes) plus JSON `{type: "state"}` messages

Animations are stored as JSON files in `apps/server/data/animations` (override with `DATA_DIR`) and seeded with examples on first start.

Fonts in `packages/core/fonts` are converted with `pnpm --filter @led-matrix/core generate-fonts`.
