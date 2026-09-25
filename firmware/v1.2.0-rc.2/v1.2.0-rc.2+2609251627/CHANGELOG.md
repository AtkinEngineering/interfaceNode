<img src="https://atkin.engineering/images/AtkinEngineering_logo_final_webRGB.png" style="width:150px">

# interfaceNode - **_Changelog_**

<!-- VERSION_INFO_START -->
![Release Candidate](https://img.shields.io/badge/Release Candidate-1.2.0--rc.2-blue)   
**Version:** `1.2.0-rc.2+2609251627`   
**Built:** `2026-09-25 16:27`   
**SDK:** `6.2.0-048ec57`   
**CMake:** `3.28.3`   
<!-- VERSION_INFO_END -->

## Added

- `bridge`: Full bridge support across USB, RS485, and TCP
- `protocol aware`: DyNet 1 & 2 parsing and validation
- `led`: Initial status LED support
- `enterprise`: WPA2/WPA3-Enterprise (EAP) authentication for Station mode, inc. EAP-FAST
- `network`: Static IP for Station mode; configurable custom IP range for Access Point mode
- `network`: IPv6 dual-stack support alongside IPv4
- `led`: Configurable per-LED colour sequences (idle/activity, independently editable)
- `build`: `sdkconfig.defaults` added for reproducible builds
- `debug`: Colour-coded, level-aware debug console logging
- `enterprise`: RADIUS/CA certificate upload and validation for EAP
- `button`: Short press enables configuration mode and reboots into it
- `button`: Short press in configuration mode reboots back into operating mode (toggle)
- `network`: AP mode encryption now configurable (previously fixed to WPA2-PSK)
- `build`: `espressif/cjson` dependency added for JSON parsing/generation (`/config` API)
- `led`: All-LEDs white state shown momentarily before every reboot
- `beacon`: DyNet discovery beacon - UDP port 9998, independent of the USB/RS485/TCP bridge
- `web`: `Cache-Control`/`Pragma`/`Expires` headers on static files - prevents stale UI after updates
- `web`: Upload status message shown while firmware is still writing to flash
- `web`: System log (`/systemlog.html`) - recent log output kept in RAM, served as a colour-coded HTML page
- `bridge`: WebSocket bridge interface (`/ws`, dedicated server, port 8080), separate from config UI
- `bridge`: Per-type WebSocket forwarding switches for DyNet 1 and DyNet 2 frames, saved with the device settings (not yet in the web interface)
- `bridge`: WebSocket DyNet 1 and DyNet 2 opcode filters - only the listed opcodes (e.g. `0-255`, `1, 5, 20-30`) are sent to WebSocket clients; USB, RS485 and TCP are unaffected
- `system`: `reboot_is_pending()` - lets other code skip starting new work once a reboot is already requested
- `button`: System button now ignores presses while a reboot is already pending
- `system`: Per-task stack usage report (`dump_task_stacks()`) - logged once at end of boot
- `mdns`: TXT record now advertises the WebSocket bridge port (`websocket` key)
- `web`: DyNet opcode filters editable from the configuration page (`sys_dynet1_filter`/`sys_dynet2_filter` in `/config`); lists are checked by both the page and the device before saving
- `web`: Unsaved-changes bar and leave-page warning on the configuration page
- `debug`: WebSocket client connects, disconnects and deliveries shown on the debug console, including why a frame was not sent to WebSocket clients (type forwarding off, or opcode not in the filter)

## Changed

- `settings`: Persistence switched from INI-based file to binary struct with CRC validation
- `led`: Status LED now indicates system mode (starting / config / AP / STA) instead of USB activity
- `led`: WiFi LED narrowed to TCP socket status only
- `mbedtls`: Configured for client-only operation (nothing acts as a TLS server anymore)
- `html`: `/config` API rewritten to single JSON GET/POST, replacing ~30 per-field requests
- `html`: Config values now fetched only after page structure is parsed, not after every asset loads
- `firmware update`: `/update` receive buffer increased 256 → 1024 bytes
- `button`: Initialisation moved to the very end of boot - not responsive until everything else has started
- `html`: Web server request handling rewritten synchronous → asynchronous, via a worker task pool
- `systemlog.html`: Storage restructured into a single struct (text/length/build-number "magic" marker) and grown 32KB → 128KB. Survives a normal reboot; cleared only on a genuine cold boot or firmware update
- `html`: Configuration page redesigned into Device, Network, Protocol, Bridge, Maintenance and Firmware sections, showing only the settings for the selected WiFi mode and protocol
- `html`: Save, reboot, factory reset and firmware install each ask for their own confirmation, replacing the shared "Please confirm" checkboxes
- `bridge`: Raw passthrough is selected only when no protocol is enabled, checked against each protocol's enable setting
- `bridge`: DyNet 2 frames are not forwarded to WebSocket clients by default
- `systemlog.html`: Dark page background for easier reading of the colour-coded log
- `code`: Source comments standardised and updated throughout for maintainability (no functional change)
- `bridge`: TCP and WebSocket each limited to 5 simultaneous clients; a further TCP client is disconnected straight away
- `network`: lwIP socket pool raised 16 → 20 (`CONFIG_LWIP_MAX_SOCKETS`), with a build-time check that the client limits fit

## Fixed

- `bug`: Default/config-mode AP SSID now derived from the correct field (`sysInfo.wifiName`, not `sysInfo.hostname`)
- `bug`: System button long-press (factory reset) threshold corrected to the intended 2 seconds
- `bug`: Crash caused by placing FreeRTOS task stacks in external PSRAM
- `bug`: Internal SRAM exhaustion from oversized WiFi receive buffers, starving RS485/USB
- `bug`: IPv6 address formatting call using a non-existent API function
- `bug`: Duplicate, unreachable `sta_encryption` web API handler
- `build`: `espressif/cjson` was pinned to a stale version and missing from component requirements
- `html`: Web server task stack increased 4096B → 12KB - too small for JSON `/config` responses
- `html`: Access Point mode showed neither AP nor Station settings fields (duplicate condition bug)
- `systemlog.html`: Serial console messages ran together - `esp_log_write()` was missing a trailing newline
- `settings`: Restoring default settings (first boot after an update, or factory reset) now applies protocol settings straight away, not after the next reboot
- `html`: TCP port field raised a script error on every change and never showed its range message
- `html`: Pressing Enter in a settings field reloaded the page and discarded unsaved edits
- `bridge`: WebSocket clients received no bridged data - clients were only recorded at connection, which the ESP-IDF 6 web server no longer reports; delivery now goes to every open WebSocket connection
- `rs485`: RS485 transmit never reached the bus - the transceiver's driver was switched off before the data had left the UART, and was assigned to the wrong GPIO
- `systemlog.html`: Boot log labelled the web server start step as `network_init`
- `bridge`: Small frames on TCP and WebSocket connections could be held back by up to ~200 ms during bursts (Nagle's algorithm); `TCP_NODELAY` is now set on every client connection
- `bridge`: A TCP client connecting beyond the client limit appeared connected but was never serviced

## Removed

- `tls`: TLS/HTTPS removed entirely - TCP bridge and web server are now plain HTTP/TCP only
- `led`: Third-party `led_indicator` component removed; LEDs now driven directly (GPIO/LEDC)
- `html`: `"** hidden **"` password/EAP-credential masking - closed system, credentials now plain text
- `html`: Firmware upload progress bar and the Chromium-only browser check
- `systemlog.html`: Per-call error count from `ESP_LOGx_SAVE()` (`someErrorFound`) - unused elsewhere
- `html`: USB baud rate setting removed from the web interface & code

## Firmware Verification

<!-- FIRMWARE_SHA256_START -->
**Firmware SHA-256:** `0f29d6acc473c093bc95f6b111507e6d46d5bcc8660108d7739917bb4996b202`
<!-- FIRMWARE_SHA256_END -->

## Security

- SBOM created and checked
- No known security vulnerabilities

## Compatibility

- Hardware revision: interfaceNode `vB.0.x`

## Feature Validation

### Tested
- `core` Firmware update & rollback
- `core` WiFi Station
- `core` WiFi SoftAP
- `core` WiFi SoftAP Config mode
- `core` Config mode html/settings
- `core` Config mode log file
- `core` mDNS (WiFi Station, Enterprise & SoftAP)
- `core` Socket server
- `core` Websocket server
- `core` Status LEDs
- `protocol:` `DyNet` Packet structure aware
- `protocol:` `DyNet` Broadcast beacon
- `protocol:` `None` Passthrough
- `websocket:` `DyNet` Dynet 1 & 2 op-code filter

- `bridge` RS485 → TCP Sockets
- `bridge` RS485 → USB-CDC
- `bridge` RS485 → Websockets
- `bridge` TCP Sockets → RS485
- `bridge` TCP Sockets → USB-CDC
- `bridge` TCP Sockets → Websockets
- `bridge` TCP Socket → TCP Sockets
- `bridge` USB-CDC → RS485
- `bridge` USB-CDC → TCP Sockets
- `bridge` USB-CDC → Websockets
- `bridge` Websockets → RS485
- `bridge` Websockets → USB-CDC
- `bridge` Websockets → TCP Sockets
- `bridge` Websocket → Websockets

**© Copyright 2026 [Atkin Engineering](https://www.atkin.engineering). All Rights Reserved.** [^copyright]

---

[^copyright]: © Copyright 2026 [Atkin Engineering](https://www.atkin.engineering). All Rights Reserved. ABN: 42 715 025 348.

*Specifications are subject to change without notice. No representation or warranty as to the accuracy or completeness of the information included herein is given and any liability for any action in reliance thereon is disclaimed.*
