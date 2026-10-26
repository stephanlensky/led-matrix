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
pnpm fake-device   # UDP receiver that renders device frames in the terminal
```

`pnpm fake-device` accepts `--port`, `--server`, `--server-port`, `--loss` (probability of dropping each packet) and `--brightness`.

## API

- `GET /api/animations`, `GET /api/animations/:id` — list or fetch animations
- `POST /api/animations` — create (id derived from the name unless given), `PUT`/`DELETE /api/animations/:id`
- `GET /api/outputs/:output`, `POST /api/outputs/:output/play {id}`, `POST /api/outputs/:output/stop`, `POST /api/outputs/:output/bpm {bpm}` — playback per output (`simulator` or `device`), each with its own animation and BPM
- `GET /api/effects` — built-in effects with JSON schemas for their params
- `GET /api/clips`, `GET /api/clips/:id`, `GET /api/clips/:id/frames` — list clips, fetch metadata or raw 64x64 RGBA frames
- `POST /api/clips` — multipart import of a GIF, image, SVG, video or several images as a sequence (`fit`, `resample`, `fps`, `start`, `duration`, `name` fields); `PATCH`/`DELETE /api/clips/:id`
- `GET /api/device` — device connection, address and last status; `PUT /api/device/brightness {brightness}` (0–255)
- `WS /api/stream/:output` — binary 64x64 RGB frames (12288 bytes) plus JSON `{type: "state"}` messages; the device stream also sends `{type: "device"}` messages on connect, status, brightness and connection changes

Animations and clips are stored in a SQLite database at `apps/server/data/led-matrix.db` (override with `DATABASE_PATH`); a new database is seeded with example animations. Video import requires `ffmpeg` on the `PATH`.

The server streams frames to the device over UDP as described in [docs/device-protocol.md](docs/device-protocol.md). It listens for device status on UDP port 7701 (`UDP_PORT`) and sends frames to whichever device last reported in, or to `DEVICE_HOST` if set.

Fonts in `packages/core/fonts` are converted with `pnpm --filter @led-matrix/core generate-fonts`.
