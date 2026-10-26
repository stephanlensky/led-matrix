# Device protocol

UDP protocol between the server (laptop) and the LED matrix device (Matrix Portal S3). The reference implementation is `packages/core/src/device-protocol.ts`; `pnpm fake-device` runs a receiver that behaves like the firmware should.

## Transport

| Port | Owner  | Receives                        |
| ---- | ------ | ------------------------------- |
| 7700 | device | frames and control messages     |
| 7701 | server | status messages from the device |

The device uses one socket bound to 7700 for everything and sends its status from it, so the server replies to the source address and port of the last status message. Until a status arrives the server sends nothing, unless it was started with `DEVICE_HOST`.

The device sends status to the configured server address if it has one, otherwise to the subnet broadcast address. This covers both the device joining a laptop hotspot and the laptop joining an access point run by the device.

Every packet fits in one datagram (at most 1472 bytes) so nothing relies on IP fragmentation.

## Packet header

All integers are little endian.

| Offset | Size | Field                  |
| ------ | ---- | ---------------------- |
| 0      | 2    | magic `"LM"` (`4C 4D`) |
| 2      | 1    | protocol version, `1`  |
| 3      | 1    | message type           |

Receivers drop packets with the wrong magic, an unknown version, an unknown type or the wrong size.

## Server to device

### `0x01` frame chunk

A 64x64 RGB888 frame (12288 bytes) is split into chunks of at most 448 pixels (7 rows), so a frame is 10 packets.

| Offset | Size | Field                                              |
| ------ | ---- | -------------------------------------------------- |
| 4      | 4    | frame sequence number (u32, wraps)                 |
| 8      | 1    | chunk index                                        |
| 9      | 1    | chunk count                                        |
| 10     | 2    | offset of the first pixel (`y * 64 + x`)           |
| 12     | n·3  | pixels, row-major `R G B`, n = remaining bytes / 3 |

Pixel values are plain 8-bit sRGB. Gamma correction, brightness and colour depth reduction happen on the device.

Assembling frames:

- Chunks for the frame being assembled are copied into a back buffer at their offset.
- When every chunk index of a frame has arrived, the frame is shown (swap buffers).
- A chunk for a different sequence starts a new frame; an incomplete frame in progress is discarded and counted as dropped.
- A chunk whose sequence is 0 to 15 behind the newest sequence seen is stale and ignored (late or duplicated packets). Anything further behind is treated as a restarted stream and accepted, so the server can restart without the device rejecting frames.
- Sequence comparisons use wrapping arithmetic: `int32_t(a - b)`.

### `0x02` set brightness

| Offset | Size | Field                |
| ------ | ---- | -------------------- |
| 4      | 1    | brightness, 0 to 255 |

The device stores the value persistently and reports it in its status. The server keeps resending it whenever a status reports a different value, so a lost packet only delays the change by one status interval.

## Device to server

### `0x81` status

Sent once at startup, every 1000 ms, and right after the brightness changes.

| Offset | Size | Field                                 |
| ------ | ---- | ------------------------------------- |
| 4      | 2    | width in pixels                       |
| 6      | 2    | height in pixels                      |
| 8      | 1    | brightness                            |
| 9      | 1    | mode: 0 idle, 1 streaming, 2 fallback |
| 10     | 2    | reserved, 0                           |
| 12     | 4    | uptime in ms (u32, wraps)             |
| 16     | 4    | frames shown since boot               |
| 20     | 4    | frames dropped since boot             |

The server considers the device disconnected after 3000 ms without a status.

## Device modes

- **idle**: no frame shown for 2000 ms. The display is blanked (firmware may draw an idle pattern instead).
- **streaming**: showing frames from the server.
- **fallback**: reserved for milestone 4, where the device plays uploaded clips while the server is unreachable.

## Reserved message types

`0x03`–`0x7F` server to device and `0x82`–`0xFF` device to server are free for later messages such as clip upload.
