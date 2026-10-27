# led-matrix

Animation designer, simulator and server for a 64x64 HUB75 LED matrix driven by an Adafruit Matrix Portal S3.

## Layout

- `packages/core` — frame model, effects, animation schema and renderer shared by server and web
- `apps/server` — Fastify API and playback engine (runs TypeScript directly on Node)
- `apps/web` — Vite + React frontend with the panel simulator
- `apps/mixxx-sync` — Electron app that runs the laptop daemon following Mixxx and plays mapped animations in time with the music
- `firmware` — PlatformIO (Arduino) firmware for the Matrix Portal S3

## Development

Requires Node 26+ and pnpm 12.

```sh
pnpm install
pnpm dev      # server on :3000, web on :5173
pnpm check    # format, lint, typecheck, test
pnpm fake-device   # UDP receiver that renders device frames in the terminal
```

`pnpm fake-device` accepts `--port`, `--server`, `--server-port`, `--loss` (probability of dropping each packet) and `--brightness`.

## Firmware

Requires [PlatformIO Core](https://docs.platformio.org/en/latest/core/installation/index.html) (`uv tool install platformio`). The first build downloads the ESP32 toolchain.

```sh
pnpm firmware:build     # compile for the Matrix Portal S3
pnpm firmware:upload    # flash over USB
pnpm firmware:monitor   # serial log
pnpm firmware:test      # protocol tests on the host
```

Without configuration the board runs its own access point `led-matrix` (password `led-matrix`, board at `192.168.4.1`). To join a laptop hotspot instead, copy `firmware/config.example.ini` to `firmware/config.ini` and set `station_ssid` and `station_password`. `server_host` is optional; without it the board broadcasts its status and the server finds it.

On boot the panel shows a test pattern, then the network name and board address until the first frame arrives. It drives the panel with ESP32-HUB75-MatrixPanel-DMA at 8-bit depth with CIE 1931 correction and hardware (OE) brightness. `clock_speed` in `config.ini` sets the panel clock (default 16 MHz); lower it to 8000000 if WiFi drops packets.

Flashing needs access to the serial port: on Arch, add yourself to the `uucp` group. If an upload does not find the board, double-tap reset or hold BOOT while pressing reset to enter the bootloader.

## Deployment

GitHub Actions builds `ghcr.io/stephanlensky/led-matrix` from the `Dockerfile` on every push to `main`. The image serves the web build (`WEB_ROOT`) and the API on port 3000, listens for device status on UDP 7701 and keeps its database at `/data/led-matrix.db`. On cardinal it runs at `led-matrix.cardinal.slensky.com`; broadcasts don't reach the pod there, so the board needs `server_host = 192.168.1.183`.

## Mixxx sync

`apps/mixxx-sync` is an Electron app that reads deck state from the Mixxx deck state server (Preferences → Decks → "Deck state server") and drives one output of the server. Start and stop the sync daemon from its window, which also shows the live deck, track, current cue and a log.

```sh
pnpm mixxx-sync
```

Settings are edited in the app while the daemon is stopped and saved to `settings.json` in the Electron user data directory (`~/.config/Mixxx Sync`). Defaults: server `LED_MATRIX_URL` or `https://led-matrix.cardinal.slensky.com`, output `LED_MATRIX_OUTPUT` or `device`, socket `MIXXX_SOCKET` or `$XDG_RUNTIME_DIR/mixxx-deck-state.sock`, mapping file `apps/mixxx-sync/mapping.json`.

The app is split into `src/main` (Electron main process: daemon, Mixxx socket, server client), `src/preload` (IPC bridge exposed as `window.api`), `src/shared` (IPC types) and `src/renderer` (React UI).

The mapping file maps track file paths to cues. Each cue shows a section (name or index, default the first) of an animation from a track beat on; `animation` carries over from the previous cue. With `end`, the section is sped up or slowed down to last exactly from `beat` to `end`, for example to fit a video clip to the song. Beats before the first grid beat are negative, so a cue at `-1` starts on the beat just before a track that doesn't begin on a beat. The file is reloaded when it changes.

```json
{
  "tracks": {
    "/mnt/music/track.flac": [
      { "beat": 0, "animation": "cat", "section": "Stare" },
      { "beat": 128, "section": "Spawn" },
      { "beat": 192, "end": 704, "animation": "bad-apple" }
    ]
  }
}
```

- The live deck is the playing deck with the highest volume after the crossfader; another deck takes over only once it is clearly louder.
- When the live deck enters a new cue, the daemon plays its section from the beats since the cue, so the server's own section chaining (`once` into the next section) stays in time with the track. Loops and jumps in Mixxx are followed by moving the beat, or by replaying when they cross a cue.
- On unmapped tracks and before the first cue, the current animation keeps playing; the daemon only follows the BPM and aligns the beat phase.

## API

- `GET /api/animations`, `GET /api/animations/:id` — list or fetch animations
- `POST /api/animations` — create (id derived from the name unless given), `PUT`/`DELETE /api/animations/:id`
- `GET /api/outputs/:output`, `POST /api/outputs/:output/play {id, beat?, bpm?}`, `POST /api/outputs/:output/stop`, `POST /api/outputs/:output/bpm {bpm}` — playback per output (`simulator` or `device`), each with its own animation and BPM; `beat` starts the animation that many beats in; `section` picks the starting section and `beats` stretches that section to last that many beats (reported as the state's `fit`)
- `POST /api/outputs/:output/beat {beat}` — move the playing animation to a beat position without restarting it, for resyncing to the music; the state's `beat` is the current position
- `GET /api/effects` — built-in effects with JSON schemas for their params
- `GET /api/clips`, `GET /api/clips/:id`, `GET /api/clips/:id/frames` — list clips, fetch metadata or raw 64x64 RGBA frames
- `POST /api/clips` — multipart import of a GIF, image, SVG, video or several images as a sequence (`fit`, `resample`, `fps`, `start`, `duration`, `name` fields); `PATCH`/`DELETE /api/clips/:id`
- `GET /api/device` — device connection, address and last status; `PUT /api/device/brightness {brightness}` (0–255)
- `WS /api/stream/:output` — binary 64x64 RGB frames (12288 bytes) plus JSON `{type: "state"}` messages; the device stream also sends `{type: "device"}` messages on connect, status, brightness and connection changes

Animations and clips are stored in a SQLite database at `apps/server/data/led-matrix.db` (override with `DATABASE_PATH`); seed animations from `apps/server/src/seeds.ts` are written on every startup, overwriting stored animations with the same id. Video import requires `ffmpeg` on the `PATH`.

The server streams frames to the device over UDP as described in [docs/device-protocol.md](docs/device-protocol.md). It listens for device status on UDP port 7701 (`UDP_PORT`) and sends frames to whichever device last reported in, or to `DEVICE_HOST` if set.

The device output renders ahead by the measured device latency (frame sent to frame visible, reported in the Device tab), so the board shows each beat when it happens. The Device tab preview is delayed by the same amount to match the board. `DEVICE_LATENCY_OFFSET_MS` adds a fixed offset, for example to account for audio output latency.

Fonts in `packages/core/fonts` are converted with `pnpm --filter @led-matrix/core generate-fonts`.
