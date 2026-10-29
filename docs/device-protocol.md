# Device protocol

Protocol between the host (the server or the mixxx-sync daemon) and the LED matrix device (Matrix Portal S3), over UDP or USB serial. The reference implementation is `packages/core/src/device-protocol.ts` and the firmware implementation is `firmware/lib/protocol`; `pnpm fake-device` runs a receiver that behaves like the firmware should.

## UDP transport

| Port | Owner  | Receives                        |
| ---- | ------ | ------------------------------- |
| 7700 | device | frames and control messages     |
| 7701 | server | status messages from the device |

The device uses one socket bound to 7700 for everything and sends its status from it, so the server replies to the source address and port of the last status message. Until a status arrives the server sends nothing, unless it was started with `DEVICE_HOST`.

The device sends status to the configured server address if it has one, otherwise to the subnet broadcast address. This covers both the device joining a laptop hotspot and the laptop joining an access point run by the device.

Every packet fits in one datagram of at most 1356 bytes, so nothing relies on IP fragmentation, even on networks with a smaller MTU (the Kubernetes pod network uses 1420). The device drops IP fragments.

## Serial transport

Over USB serial (the board's native USB CDC port) the same packets are sent in both directions, each framed with [COBS](https://en.wikipedia.org/wiki/Consistent_Overhead_Byte_Stuffing) and followed by a `00` delimiter. UDP packets stay unframed.

- COBS replaces every `00` in the packet, so `00` only ever appears as the delimiter. The encoder writes no trailing block code after a full 254-byte block that ends the packet (the canonical form), and the decoder accepts both forms.
- A decoded packet is at most 1472 bytes. Encoded with its delimiter it is at most 1479 bytes (`n + ceil(n / 254) + 1`). Hosts send at most 1356-byte packets, like over UDP.
- Receivers decode incrementally and drop a frame that is empty, longer than 1472 bytes once decoded, or whose last block runs past the delimiter, then resume at the next `00`. The packet inside is then checked like a UDP packet.
- A host should send a lone `00` after opening the port, so any partial frame left in the device's buffer ends there.
- `firmware/test/serial_vectors.txt` holds shared test vectors (packet and encoded frame in hex) that both implementations test against.

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

### `0x03` compressed frame chunk

Sent instead of `0x01` to devices whose status sets the compressed frames feature. Each chunk covers a range of pixels, run-length encoded, and the server fills each packet with as many pixels as fit, so a mostly black frame is one packet instead of ten.

| Offset | Size | Field                                    |
| ------ | ---- | ---------------------------------------- |
| 4      | 4    | frame sequence number (u32, wraps)       |
| 8      | 1    | chunk index                              |
| 9      | 1    | chunk count                              |
| 10     | 2    | offset of the first pixel (`y * 64 + x`) |
| 12     | 2    | number of pixels in the chunk            |
| 14     | n    | runs                                     |

Each run starts with a byte `t`. Below `0x80` it is followed by `t + 1` pixels as `R G B`; from `0x80` up it is followed by one `R G B` pixel repeated `(t & 0x7f) + 1` times. A chunk whose runs don't cover exactly its pixel count, or run past the end of the packet, is dropped. Chunks are assembled into frames exactly like `0x01` chunks.

### `0x02` set brightness

| Offset | Size | Field                |
| ------ | ---- | -------------------- |
| 4      | 1    | brightness, 0 to 255 |

The device stores the value persistently and reports it in its status. The server keeps resending it whenever a status reports a different value, so a lost packet only delays the change by one status interval.

## Device to server

### `0x81` status

Sent once at startup, every 1000 ms, and right after the brightness changes. The message is 32 bytes.

| Offset | Size | Field                                 |
| ------ | ---- | ------------------------------------- |
| 4      | 2    | width in pixels                       |
| 6      | 2    | height in pixels                      |
| 8      | 1    | brightness                            |
| 9      | 1    | mode: 0 idle, 1 streaming, 2 fallback |
| 10     | 1    | features: bit 0 compressed frames     |
| 11     | 1    | reserved, 0                           |
| 12     | 4    | uptime in ms (u32, wraps)             |
| 16     | 4    | frames shown since boot               |
| 20     | 4    | frames dropped since boot             |
| 24     | 4    | sequence of the frame being shown     |
| 28     | 2    | age of that frame in ms, 0 to 65535   |
| 30     | 2    | reserved, 0                           |

The age counts from when the frame became visible: the device adds half a panel refresh period to the time it flipped buffers, since the hardware switches buffers at the end of the current refresh pass. The server keeps the send time of recent frames and computes the latency as `status received - age - frame sent`. It uses the lowest of the last 8 samples, since delays on the status packet itself only make a sample larger.

The server considers the device disconnected after 3000 ms without a status.

## Device modes

- **idle**: no frame shown for 2000 ms. The display is blanked (firmware may draw an idle pattern instead).
- **streaming**: showing frames from the server.
- **fallback**: reserved for milestone 4, where the device plays uploaded clips while the server is unreachable.

## Reserved message types

`0x03`–`0x7F` server to device and `0x82`–`0xFF` device to server are free for later messages such as clip upload.
