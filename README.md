<img src="https://atkin.engineering/images/AtkinEngineering_logo_final_webRGB.png" style="width:150px">

# interfaceNode

**Wireless RS-485 / USB / TCP / WebSocket bridge**

[![Latest](https://img.shields.io/github/v/release/AtkinEngineering/interfaceNode?label=Latest&color=brightgreen)](https://github.com/AtkinEngineering/interfaceNode/releases/latest)
[![Latest Alpha](https://img.shields.io/github/v/release/AtkinEngineering/interfaceNode?include_prereleases&filter=*alpha*&label=Alpha&color=orange)](https://github.com/AtkinEngineering/interfaceNode/releases)
[![Latest Beta](https://img.shields.io/github/v/release/AtkinEngineering/interfaceNode?include_prereleases&filter=*beta*&label=Beta&color=yellow)](https://github.com/AtkinEngineering/interfaceNode/releases)
[![Latest RC](https://img.shields.io/github/v/release/AtkinEngineering/interfaceNode?include_prereleases&filter=*rc*&label=RC&color=blue)](https://github.com/AtkinEngineering/interfaceNode/releases)   

[![Documentation](https://img.shields.io/badge/Documentation-blue)](https://github.com/AtkinEngineering/interfaceNode#documentation)
[![Website](https://img.shields.io/badge/Website-atkin.engineering-lightblue)](https://www.atkin.engineering)
[![Licence](https://img.shields.io/badge/Licence-Proprietary-lightgrey)](https://github.com/AtkinEngineering/interfaceNode#licence)

## Overview

interfaceNode is Atkin Engineering's wireless RS-485 bridge. It bridges
USB CDC, RS-485, TCP sockets, and WebSockets - data arriving on any one
interface is forwarded to the other three, live, with no PC or gateway
software in between.

With `Protocol aware` set to `Dynet`, traffic is validated as complete
DyNet 1/DyNet 2 frames (checksummed, re-synchronised on invalid data)
before being forwarded. Set to `None`, bytes pass through verbatim with no
validation, for any other RS-485-based protocol.

The device is configured entirely through its own web interface - no
companion app or desktop software required.

## Features

- **Bridge**: USB CDC ↔ RS-485 ↔ TCP (multiple clients) ↔ WebSocket (multiple clients), DyNet-aware or raw passthrough
- **Web configuration UI**: JSON-based `/config` API, reachable only in configuration mode (mutually exclusive with normal bridge operation)
- **WiFi**: Access Point or Station mode, including WPA2/WPA3-Enterprise (EAP, with EAP-FAST and uploadable RADIUS/CA certificate)
- **System log**: recent log output, colour-coded by severity, viewable at `/systemlog.html` in configuration mode - a 128KB in-memory buffer that survives a normal reboot and clears only on a genuine cold boot or a fresh firmware update
- **DyNet discovery beacon**: independent UDP responder (port 9998), separate from the bridge
- **Status LEDs**: per-interface RGB (RS485, WiFi), a system-mode status LED (starting / config / AP / STA), LEDC-driven with configurable colour sequences
- **OTA firmware updates** via the web UI
- **IPv4 + IPv6** dual-stack

## Supported Interfaces

| Interface | Notes |
|---|---|
| **USB CDC** | Direct USB CDC, no separate USB-serial driver required |
| **RS-485** | Full or half duplex, set via a hardware jumper |
| **TCP** | Multiple simultaneous clients, port configurable in the web UI |
| **WebSocket** | `/ws`, multiple simultaneous clients, its own dedicated server separate from the config UI - see [Network Services](#network-services) |

Every interface is bridged the same way - a frame received on any one is
forwarded to every other, never back out the interface it arrived on.

## Firmware

### Download Firmware

Firmware releases are published through [GitHub Releases](https://github.com/AtkinEngineering/interfaceNode/releases).

Each release contains:

- Firmware `.bin`
- SHA-256 checksum
- Release changelog
- Supporting documentation, where applicable

**[View Firmware Releases →](https://github.com/AtkinEngineering/interfaceNode/releases)**

## Firmware Update

To update the firmware, enter configuration mode with a single press of
the system button, then open the device's web interface and upload the
downloaded `.bin` from the Firmware section. No serial connection or
additional software required.

## Configuration

The device is configured entirely through its own web interface, only
reachable while in configuration mode:

- **Entering configuration mode**: a short press of the system button
  reboots the device into it
- **Factory reset**: holding the button for 2 seconds resets all settings
  to their defaults and reboots
- Every setting available in configuration mode is documented in the
  [Manual](documents/MANUAL.pdf)

Configuration mode and normal bridge operation are mutually exclusive -
the device runs as one or the other, and switching between them requires
a reboot.

## Network Services

Alongside the bridge itself, interfaceNode runs several independent
network services:

- **Web configuration UI** - JSON `/config` API, configuration mode only
- **WebSocket bridge** (`/ws`) - a dedicated server, separate from the config UI, always available during normal bridge operation. DyNet 1/DyNet 2 frames can each be independently filtered from WebSocket delivery
- **System log** (`/systemlog.html`) - configuration mode only
- **DyNet discovery beacon** - UDP responder on port 9998, independent of the bridge
- **mDNS** - device reachable by hostname on the local network

## Protocol Support

- **DyNet 1 & DyNet 2** - complete frames are checksum-validated and
  re-synchronised on invalid data before being bridged
- **Raw / passthrough** - `Protocol aware` set to `None` forwards every
  byte verbatim, for any other RS-485-based protocol

## Hardware

interfaceNode features a physical RS-485 transceiver (duplex mode set via
a hardware jumper), USB CDC, and per-interface RGB status LEDs. Full
electrical and mechanical specifications are in the
[Datasheet](documents/DATASHEET.pdf).

## Documentation

- **Manual** ([`documents/MANUAL.pdf`](documents/MANUAL.pdf)) - operation, configuration, every setting available in configuration mode
- **Datasheet** ([`documents/DATASHEET.pdf`](documents/DATASHEET.pdf)) - hardware specifications

## Release Verification

Each release lists a SHA-256 checksum alongside its `.bin`. To verify a
download before flashing it:

```
# Linux
sha256sum interfaceNode.bin

# macOS
shasum -a 256 interfaceNode.bin
```

Compare the result against the checksum published on the release page.

## Support

For product and general support enquiries, visit
[www.atkin.engineering](https://www.atkin.engineering).

To report a security vulnerability, do not open a public issue - see
[SECURITY.md](SECURITY.md) for how to report it directly.

## Licence

interfaceNode is proprietary firmware belonging to Atkin Engineering. The
repository and its releases are publicly viewable and downloadable, but
no permission is granted to copy, modify, distribute, reverse engineer,
or commercially exploit this software except as expressly authorised by
Atkin Engineering - see [LICENSE](LICENSE) for the full terms.

**© Copyright 2026 [Atkin Engineering](https://www.atkin.engineering). All Rights Reserved.** [^copyright]

---

[^copyright] © Copyright 2026 [Atkin Engineering](https://www.atkin.engineering). All Rights Reserved. ABN: 42 715 025 348.   

_Specifications are subject to change without notice. No representation or warranty as to the accuracy or completeness of the information included herein is given and any liability for any action in reliance thereon is disclaimed._
