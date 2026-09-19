<img src="https://atkin.engineering/images/AtkinEngineering_logo_final_webRGB.png" style="width:150px">

# interfaceNode - **_Changelog_**

<!-- VERSION_INFO_START -->
![Release](https://img.shields.io/badge/Release-1.2.0-brightgreen)   
**Version:** `1.2.0+2609191214`   
**Built:** `2026-09-19 12:14`   
**SDK:** `6.2.0-e4df0c1`   
**CMake:** `4.0.3`   
<!-- VERSION_INFO_END -->
<!-- FIRMWARE_SHA256_START -->
**Firmware SHA-256:** `cc9144f19abc123ba1d0ca7a68d8cbece50c1ae36e27ef519070fa61b7b800d1`
<!-- FIRMWARE_SHA256_END -->

## Highlights

- Complete rewrite of the bridge - full USB / RS485 / TCP bridging support
- USB serial communications now use direct USB CDC
- Settings are now stored as a binary file
- Complete redesign of the status LED subsystem - independently configurable RGB LEDs per interface, replacing an earlier third-party indicator library
- TLS/HTTPS removed entirely - the web server and TCP bridge are now plain HTTP/TCP only
- Device configuration API (`/config`) rewritten to a single JSON request for reading and writing every setting, replacing ~30 individual per-field requests
- Web server converted to fully asynchronous request handling - every handler now runs on a worker task, not the main server task, so a slow or blocking request (e.g. a future handler waiting on a bridge response) can no longer stall the entire web interface
- System log capture implemented - recent log output is kept in memory and viewable from the web interface (`/systemlog.html`), color-coded by level
- WebSocket bridge added as a fourth bridge interface, alongside USB/RS485/TCP - runs on its own dedicated server and port, entirely separate from the config-mode web interface, so the two can never conflict
- Every FreeRTOS task's stack usage is now logged once at the end of boot, covering this project's own tasks and every library-internal one (WiFi, lwIP, IDLE, and similar) in a single report

## Added

- `bridge`: Full bridge support across USB, RS485, and TCP
- `protocol aware`: DyNet 1 & 2 parsing and validation
- `led`: Initial status LED support
- `enterprise`: WPA2/WPA3-Enterprise (EAP) authentication for Station mode, including EAP-FAST
- `network`: Static IP addressing for Station mode; configurable custom IP range for Access Point mode
- `network`: IPv6 dual-stack support alongside IPv4
- `led`: Configurable per-LED colour sequences - idle and activity colours are independently editable without touching state-machine logic
- `build`: `sdkconfig.defaults` added for reproducible builds (socket headroom, WiFi buffer tuning, mbedTLS client-only mode)
- `debug`: Colour-coded, level-aware debug console logging, matching ESP-IDF's own log-level conventions
- `enterprise`: RADIUS/CA server certificate upload and validation for EAP - certificate is uploaded via the web interface and stored on the device, resolving the previous gap where the setting existed but had nothing to validate against
- `button`: Short press now enables configuration mode and reboots into it; previously had no effect
- `network`: Web interface Access Point encryption selector (`sysConfig.ap.encryption`) now has a URI handler - AP mode encryption is configurable rather than fixed to WPA2-PSK
- `build`: `espressif/cjson` dependency added for JSON parsing/generation (`/config` API)
- `led`: New all-LEDs white state shown momentarily before every reboot, regardless of what triggered it
- `beacon`: DyNet discovery beacon - responds to broadcast queries on UDP port 9998 (device MAC address, TCP bridge port), active when `Protocol aware` is set to `Dynet` and the device is not in configuration mode. Runs independently of the USB/RS485/TCP bridge - discovery traffic is never routed to or from bridge interfaces
- `web`: `Cache-Control`/`Pragma`/`Expires` HTTP response headers on every served static file (HTML, JS, CSS, images) - browsers no longer cache the web UI, avoiding stale files being shown after a firmware update
- `web`: Status message during firmware upload ("Upload sent (N bytes). Writing to device flash...") shown once the browser finishes sending the file, while the device is still writing it to flash
- `web`: System log (`/systemlog.html`) - recent `ESP_LOG*_SAVE()` output is kept in a fixed-size buffer in external RAM and served as a colour-coded HTML page. Chosen over an earlier flash-file-backed approach (via `espressif/log_router` on a dedicated FAT partition) for being simpler to read through and not requiring any flash writes - the trade-off is that this log does not persist across a reboot or power cycle, unlike the flash-based version it replaced
- `bridge`: WebSocket bridge interface (`/ws`, dedicated server on port 8080) - lets a browser or any WebSocket-capable client observe and inject bridge traffic directly, the same as USB/RS485/TCP. Only runs outside configuration mode, on its own separate httpd instance from the config UI's web server
- `bridge`: `bridge_ws_forward_dynet1`/`bridge_ws_forward_dynet2` - independent on/off switches for whether DyNet1 and DyNet2 frames are forwarded to WebSocket bridge clients, based on each frame's own type. Not yet exposed in the web interface - currently set in code only
- `system`: `reboot_is_pending()` - lets other code check whether a reboot has already been requested and skip starting new work if so. Applied to the end of the boot sequence, so it no longer runs `board_button_init()`/`mark_app_valid()` if a reboot was triggered (e.g. by a web request) while boot was still finishing
- `button`: System button now ignores presses while a reboot is already pending, using `reboot_is_pending()` - a press during the short delay before the device restarts no longer does anything, rather than queuing up another action
- `system`: Per-task stack usage report (`dump_task_stacks()`) - logs every FreeRTOS task's configured stack size, remaining headroom, and bytes used, once at the end of boot. This project's own tasks report all three figures; library-internal tasks (WiFi, lwIP, IDLE, and similar) report remaining headroom only, since FreeRTOS doesn't expose a task's original configured size, only its current high-water-mark

## Changed

- Settings persistence switched from an INI-based file to a binary struct format with CRC validation
- Status LED (formerly tied to USB activity) now indicates overall system mode (starting / config mode / Access Point / Station) instead
- WiFi LED narrowed to TCP socket status only; Access-Point-vs-Station indication moved to the status LED
- mbedTLS configured for client-only operation, since nothing in this firmware acts as a TLS server anymore
- `/config` web API rewritten from one query-string request per setting field to a single JSON GET (read everything) and JSON POST (write everything, plus an optional save/factory-reset/reboot action in the same request)
- Web page load sequence: config values are now fetched only once the page structure itself is fully parsed and displayed, rather than waiting for every image and stylesheet to finish loading first
- System button long-press threshold reduced from 5 seconds to 2 seconds
- Firmware update (`/update`) receive buffer increased from 256 to 1024 bytes, speeding up firmware transfer
- System button initialization moved from early in the boot sequence to the very end, after the network, bridge (or web interface), and beacon have all started - the button is not responsive until this point
- Web server request handling rewritten from synchronous (one request fully processed before the next is even accepted) to asynchronous - every handler now hands off to a small pool of worker tasks and returns immediately, so one slow request can no longer block the whole server
- System log storage restructured from separate variables into a single struct (text buffer, length, and a new build-number "magic" marker), and grown from 32KB to 128KB, retaining substantially more history before it fills and clears. The build-number marker is checked at the very start of boot: if it doesn't match the running firmware's build (a genuine cold boot, or a fresh firmware update), the whole log is explicitly cleared; if it matches (any other restart), the existing log is left completely untouched and continues appending - replacing an earlier, less precise approach that could only tell whether the length value looked plausible, not whether it was genuinely left over from this same firmware's last run

## Removed

- TLS/HTTPS support removed entirely from both the TCP bridge and the web server - the web server is plain HTTP only
- Third-party `led_indicator` component removed after repeated issues; status LEDs are now driven directly (plain GPIO / LEDC)
- `"** hidden **"` password/EAP-credential masking removed from the web interface - this is a closed system, credentials are now read and written as plain text
- Firmware upload progress bar (percentage tracking) and the Chromium-browser check that hid the firmware upload section entirely on other browsers
- Per-call error count previously returned by `ESP_LOGx_SAVE()` (`someErrorFound`) - unused elsewhere in the codebase

## Deprecated

- `html/settings`: Serial baud rate setting removed from the web interface

## Fixed

- Default/config-mode Access Point SSID now derived from `sysInfo.wifiName`, the field intended for this purpose, rather than `sysInfo.hostname` - previously tracked as an unwired field, not yet used for AP SSID selection
- System button long-press threshold corrected to the intended 5 seconds (previously misconfigured far shorter)
- Crash caused by placing FreeRTOS task stacks in external PSRAM
- Internal SRAM exhaustion caused by oversized WiFi receive buffers, which was starving RS485/USB
- IPv6 address formatting call using a non-existent API function
- Duplicate, unreachable `sta_encryption` web API handler (a second, dead branch sitting behind the original one)
- `espressif/cjson` dependency was pinned to a stale version (`1.2.2`, latest is `1.7.19`) and missing from the build's component requirements despite being listed as a dependency
- Web server task stack size increased from the 4096-byte default to 12KB - too small for the JSON `/config` responses this server now sends
- Web interface: selecting Access Point mode showed neither the Access Point nor Station settings fields (both stayed hidden) - `showHideStationWiFiOption()` had two identical conditions (checking Station's value twice) rather than one condition per mode, leaving the Access Point branch unreachable
- System log messages on the serial console ran together with no line break between them - the underlying `esp_log_write()` call was missing a trailing newline that the standard `ESP_LOGx()` macros normally add automatically

## Security

- [x] SBOM created and checked
- No known security vulnerabilities

<div class="page"/>

## Testing Status

**Core services**

- [x] Firmware update & rollback
- [x] WiFi Station
- [x] WiFi SoftAP
- [x] WiFi SoftAP Config mode
- [x] Config mode html/settings
- [x] Config mode log file
- [x] mDNS (WiFi Station, Enterprise & SoftAP)
- [x] Socket server
- [x] Websocket server
- [x] Status LEDs

**Bridge paths**

- [ ] RS485 → USB-CDC
- [ ] RS485 → TCP Sockets
- [ ] RS485 → Websockets
- [ ] TCP Sockets → RS485
- [ ] TCP Sockets → USB-CDC
- [ ] TCP Sockets → Websockets
- [ ] TCP Socket → TCP Sockets
- [ ] USB-CDC → RS485
- [ ] USB-CDC → TCP Sockets
- [ ] USB-CDC → Websockets
- [ ] Websockets → RS485
- [ ] Websockets → USB-CDC
- [ ] Websockets → TCP Sockets
- [ ] Websocket → Websockets

**Protocol**

`DyNet`

- [x] Packet structure aware
- [x] Websockets Dynet filter
- [x] Broadcast beacon

`None`

- [x] Passthrough

**© Copyright 2026 [Atkin Engineering](https://www.atkin.engineering). All Rights Reserved.** [^copyright]

---

[^copyright] © Copyright 2026 [Atkin Engineering](https://www.atkin.engineering). All Rights Reserved. ABN: 42 715 025 348.
_Specifications are subject to change without notice. No representation or warranty as to the accuracy or completeness of the information included herein is given and any liability for any action in reliance thereon is disclaimed._
