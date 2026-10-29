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
pnpm bench         # time every seed animation section
```

`pnpm fake-device` accepts `--port`, `--server`, `--server-port`, `--loss` (probability of dropping each packet) and `--brightness`.

`pnpm bench` prints a table of render times per section, slowest first. It accepts `--filter <id or id#section>`, `--top`, `--frames`, `--warmup`, `--fps`, `--bpm`, `--profile <file>` (writes a `.cpuprofile` and prints the top functions by self time), and `--passes <n>` with `--cache` to measure loop sections over several passes with or without the frame cache.

## Firmware

Requires [PlatformIO Core](https://docs.platformio.org/en/latest/core/installation/index.html) (`uv tool install platformio`). The first build downloads the ESP32 toolchain.

```sh
pnpm firmware:build     # compile for the Matrix Portal S3
pnpm firmware:upload    # flash over USB
pnpm firmware:monitor   # serial log
pnpm firmware:test      # protocol tests on the host
pnpm serial-stream      # stream test frames to the board over USB and print its status and logs
```

`pnpm serial-stream` accepts `--device` (defaults to the MatrixPortal under `/dev/serial/by-id`), `--fps`, `--seconds`, `--raw` (uncompressed frames), `--pattern` (`shape`, `gradient` or `noise`) and `--brightness` (sent after `--brightness-at` seconds). Once the board receives packets over USB it ignores UDP, sends its status and logs over USB, and returns to UDP 2 s after the last USB packet.

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

Settings are edited in the app's Settings tab and saved automatically to `settings.json` in the Electron user data directory (`~/.config/Mixxx Sync`). The daemon settings are locked while the daemon runs. `MIXXX_SYNC_USER_DATA` overrides the user data directory, for example to run a second instance. Output is either Server (WiFi), where the server renders and sends frames to its device or simulator output, or Local (USB), where the app renders in a niced child process and streams frames to the board over USB serial (auto-detected or a chosen port) with animations and clips cached in `content/` for offline use. Changing the output applies immediately and restarts a running daemon. Local (USB) needs access to `/dev/ttyACM*` (on Arch, the `uucp` group). In Local mode the Device view shows the USB link, content origin and the board's log, and the server's Device tab shows the board as disconnected; the Editor's live view still shows the server output. Defaults: server `LED_MATRIX_URL` or `https://led-matrix.cardinal.slensky.com`, output Server, server output `LED_MATRIX_OUTPUT` or `device`, socket `MIXXX_SOCKET` or `$XDG_RUNTIME_DIR/mixxx-control.sock`, mapping file `apps/mixxx-sync/mapping.json`, Mixxx database `MIXXX_DATABASE` or `~/.mixxx/mixxxdb.sqlite`.

The app is split into `src/main` (Electron main process: daemon, Mixxx socket, server client), `src/preload` (IPC bridge exposed as `window.api`), `src/shared` (IPC types) and `src/renderer` (React UI).

The mapping file maps track file paths to cues. Each cue shows a section (name or index, default the first) of an animation from a track beat on; `animation` carries over from the previous cue. `params` picks options by parameter name (`{"Speed": "Half time"}`); they carry over along with the animation, merged with the params of cues that don't name an animation, and reset to the defaults when a cue names an animation. Without `end`, a cue plays until the next one: `once` sections flow into the following sections and the last one holds, `loop` sections repeat. With `end`, the cue stops there and the display goes blank until the next cue (or the end of the track). A `once` section with `end`, together with the `once` sections that follow it, is sped up or slowed down to last exactly from `beat` to `end`, for example to fit a video clip to the song; a `loop` section keeps its own speed and just repeats until `end`. Beats before the first grid beat are negative, so a cue at `-1` starts on the beat just before a track that doesn't begin on a beat. The file is reloaded when it changes.

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
- The daemon sends the live track's whole cue list to the server as a timeline once, then only keeps the server's beat clock in step with the deck (beat, BPM, paused). The server switches cues itself while rendering, so cue changes get the same device latency lead as the rest of the animation and land on the beat. Loops and jumps in Mixxx move the clock right away; small drift is corrected at most once a second. The timeline is sent again when the live track or its cues change.
- On unmapped tracks and before the first cue, the current animation keeps playing in phase with the new track.
- Between a cue's `end` and the next cue, the display is blank.

The Editor tab reads the Mixxx library (read-only, also while Mixxx runs) and shows every track with its waveform, Mixxx cues and an animation lane. Drag an animation, one of its sections or one of its parameter options from the right panel onto a lane to add a cue that ends after one loop or after its `once` sections, cut short by the next cue (the parameter selects under the simulator, or the parameter submenus in a block's right-click menu, change the options of that block), drag a block to move it, and drag its left or right arrow handle to change its start or set its end (double-click the right handle to clear the end). Edits snap to Mixxx cues, other blocks, bars and whole beats; hold Alt to place freely. Delete or Backspace removes the selected block, the left and right arrow keys move it by a beat (with Shift, by a bar), and Ctrl+Z / Ctrl+Shift+Z undo and redo edits. Play a track to hear it and see the mapped animation in the simulator; changes are saved to the mapping file automatically. While the daemon runs, the track that's live in Mixxx is marked, its current cue is outlined, and the Live button scrolls to it. The keyboard button in the track list header lists all shortcuts.

## Parameters

An animation can define `parameters`, a list of `{name, default?, options}` where each option is `{name, values}`. A layer param written as `{"param": "color"}` takes its value from the selected option of the parameter that sets `color`, so one animation can vary its colors, speed, size and so on instead of being duplicated. Each value key belongs to one parameter. `default` names the option used when none is selected (otherwise the first one), and other options fall back to the default option's values for keys they leave out. Every option is validated against the effect params.

```json
{
  "name": "Strobe",
  "parameters": [
    {
      "name": "Color",
      "options": [
        { "name": "White", "values": { "color": "#ffffff" } },
        { "name": "Orange", "values": { "color": "#ff5a00" } }
      ]
    },
    {
      "name": "Speed",
      "default": "Double",
      "options": [
        { "name": "Beat", "values": { "flashesPerBeat": 1 } },
        { "name": "Double", "values": { "flashesPerBeat": 2 } }
      ]
    }
  ],
  "sections": [
    {
      "mode": { "type": "loop", "beats": 1 },
      "layers": [
        {
          "effect": "strobe",
          "params": {
            "color": { "param": "color" },
            "flashesPerBeat": { "param": "flashesPerBeat" }
          }
        }
      ]
    }
  ]
}
```

The Simulator and Device animation lists show an animation's parameters under it while it plays. In the Editor, each parameter has a select, and params bound to a parameter edit the value of its selected option.

## API

- `GET /api/animations`, `GET /api/animations/:id` — list or fetch animations
- `POST /api/animations` — create (id derived from the name unless given), `PUT`/`DELETE /api/animations/:id`
- `GET /api/outputs/:output`, `POST /api/outputs/:output/play {id, beat?, bpm?, section?, beats?, params?}`, `POST /api/outputs/:output/stop`, `POST /api/outputs/:output/bpm {bpm}` — playback per output (`simulator` or `device`), each with its own animation and BPM; `beat` starts the animation that many beats in; `section` picks the starting section and `beats` stretches that section and the `once` sections that follow it to last that many beats together (reported as the state's `fit`); `params` picks options by parameter name, e.g. `{"Color": "Orange"}` (unselected parameters use their default; the full selection is reported as the state's `params`)
- `POST /api/outputs/:output/params {params}` — change options of the playing animation without restarting it; parameters left out keep their current option
- `POST /api/outputs/:output/beat {beat}` — move the playing animation to a beat position without restarting it, for resyncing to the music; the state's `beat` is the current position
- `POST /api/outputs/:output/timeline {id, cues, beat, bpm?, paused?, keepCurrent?}` — play a list of cues `{beat, animationId, section, params?, beats?, offset}` (or `{beat, animationId: null}` for blank) against a beat clock starting at `beat`; the server picks the cue for each rendered frame, so cue changes are rendered ahead by the device latency like everything else. `beats` fits the cue's section like `play`, `offset` starts it that many beats in. Before the first cue the output is blank, or with `keepCurrent` keeps showing what was playing, in phase with the new clock. The state reports `timeline: {id, cue}` and the current cue's animation; `params`, `seek` and `advance` are refused while a timeline plays
- `POST /api/outputs/:output/clock {beat, bpm?, paused?}` — set the beat clock of the playing timeline (or animation) in one request
- `GET /api/effects` — built-in effects with JSON schemas for their params
- `GET /api/clips`, `GET /api/clips/:id`, `GET /api/clips/:id/frames` — list clips, fetch metadata or raw 64x64 RGBA frames
- `POST /api/clips` — multipart import of a GIF, image, SVG, video or several images as a sequence (`fit`, `resample`, `fps`, `start`, `duration`, `name` fields); `PATCH`/`DELETE /api/clips/:id`
- `GET /api/device` — device connection, address and last status; `PUT /api/device/brightness {brightness}` (0–255)
- `WS /api/stream/:output` — binary 64x64 RGB frames (12288 bytes) plus JSON `{type: "state"}` messages; the device stream also sends `{type: "device"}` messages on connect, status, brightness and connection changes

Animations and clips are stored in a SQLite database at `apps/server/data/led-matrix.db` (override with `DATABASE_PATH`); seed animations from `apps/server/src/seeds.ts` are written on every startup, overwriting stored animations with the same id. Video import requires `ffmpeg` on the `PATH`.

The server streams frames to the device over UDP as described in [docs/device-protocol.md](docs/device-protocol.md). It listens for device status on UDP port 7701 (`UDP_PORT`) and sends frames to whichever device last reported in, or to `DEVICE_HOST` if set.

The device output renders ahead by the measured device latency (frame sent to frame visible, reported in the Device tab), so the board shows each beat when it happens. The Device tab preview is delayed by the same amount to match the board. `DEVICE_LATENCY_OFFSET_MS` adds a fixed offset, for example to account for audio output latency.

Fonts in `packages/core/fonts` are converted with `pnpm --filter @led-matrix/core generate-fonts`.
