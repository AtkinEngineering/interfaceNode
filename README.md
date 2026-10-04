<img src="https://atkin.engineering/images/AtkinEngineering_logo_final_webRGB.png" style="width:150px">

# interfaceNode

**Wireless RS-485 / USB / TCP / WebSocket bridge**

[![Stable](https://img.shields.io/github/v/release/AtkinEngineering/interfaceNode?label=Stable&color=brightgreen)](https://github.com/AtkinEngineering/interfaceNode/releases/latest)
[![RC](https://img.shields.io/github/v/release/AtkinEngineering/interfaceNode?include_prereleases&filter=*rc*&label=RC&color=blue)](https://github.com/AtkinEngineering/interfaceNode/releases)
[![Beta](https://img.shields.io/github/v/release/AtkinEngineering/interfaceNode?include_prereleases&filter=*beta*&label=Beta&color=yellow)](https://github.com/AtkinEngineering/interfaceNode/releases)

[![Documentation](https://img.shields.io/badge/Documentation-blue)](https://github.com/AtkinEngineering/interfaceNode/blob/main/documents/)
[![Website](https://img.shields.io/badge/Website-atkin.engineering-lightblue)](https://www.atkin.engineering)
[![Licence](https://img.shields.io/badge/Licence-Proprietary-lightgrey)](https://github.com/AtkinEngineering/interfaceNode#licence)

## Overview

interfaceNode is Atkin Engineering's wireless RS-485 bridge. It bridges USB CDC, RS-485, TCP sockets, and WebSockets - data arriving on any one interface is forwarded to the other three, live, with no PC or gateway software in between.

With `Protocol aware` set to `Dynet`, traffic is validated as complete DyNet 1/DyNet 2 frames (check-summed, re-synchronised on invalid data) before being forwarded. Set to `None`, bytes pass through verbatim with no validation, for any other RS-485-based protocol.

The device is configured entirely through its own web interface - no companion app or desktop software required.

## Features

- **Bridge**: USB CDC ↔ RS-485 ↔ TCP (up to 5 clients) ↔ WebSocket (up to 5 clients), DyNet-aware or raw passthrough
- **WebSocket DyNet filtering**: choose which DyNet 1 / DyNet 2 opcodes reach WebSocket clients, from the web interface
- **Web configuration UI**: HTTPS, login required, JSON-based `/config` API, reachable only in configuration mode (mutually exclusive with normal bridge operation)
- **Security**: see [Security](#security) - unique password per device, login and TLS on every network interface, encrypted settings, security event log
- **WiFi**: Access Point or Station mode, including WPA2/WPA3-Enterprise (EAP, with EAP-FAST and uploadable RADIUS/CA certificate)
- **System log**: recent log output, colour-coded by severity, viewable at `/systemlog.html` in configuration mode - a 128KB in-memory buffer that survives a normal reboot and clears only on a genuine cold boot or a fresh firmware update. Security events are marked `[security]`
- **Watchdog**: the device restarts itself if a data task stops responding
- **DyNet discovery beacon**: independent UDP responder (port 9998), separate from the bridge
- **Status LEDs**: per-interface RGB (RS485, WiFi), a system-mode status LED (starting / config / AP / STA), LEDC-driven with configurable colour sequences
- **OTA firmware updates** via the web UI, with automatic rollback if the new firmware fails to start
- **IPv4 + IPv6** dual-stack

## Supported Interfaces

| Interface     | Notes                                                                                                                                  |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **USB CDC**   | Direct USB CDC, no separate USB-serial driver required                                                                                 |
| **RS-485**    | Full or half duplex, set via a hardware jumper                                                                                         |
| **TCP**       | Up to 5 simultaneous clients, port configurable in the web UI; TLS and login (`AUTH user:pass`) on by default                          |
| **WebSocket** | `/ws`, up to 5 simultaneous clients, its own dedicated server separate from the config UI; WSS and login on by default - see [Network Services](#network-services) |

Every interface is bridged the same way - a frame received on any one is forwarded to every other, never back out the interface it arrived on.

## Firmware

### Download Firmware

Firmware releases are published through [GitHub Releases](https://github.com/AtkinEngineering/interfaceNode/releases).

Each release contains:

- Firmware `.bin`
- SHA-256 checksum
- Release changelog
- Software bill of materials (`SBOM.spdx`) and vulnerability report (`SBOM_report.md`)
- Supporting documentation, where applicable

The device never connects to the internet and can't tell you when new firmware is available. Use GitHub's **Watch → Custom → Releases** on this repository to be notified of new releases. Version numbers are `major.minor.patch`; security fixes are released as patch versions - see [Security updates](#security-updates).

**[View Firmware Releases →](https://github.com/AtkinEngineering/interfaceNode/releases)**

## Firmware Update

To update the firmware, enter configuration mode with a single press of the system button, then open the device's web interface and install the downloaded `.bin` from the Firmware section. No serial connection or additional software required.

> **Note:** all settings, including WiFi, are restored to their defaults after a firmware update. Note your settings before updating - see the [Manual](documents/).

## Configuration

The device is configured entirely through its own web interface, only reachable while in configuration mode:

- **Entering configuration mode**: a short press of the system button reboots the device into it
- **Logging in**: the web interface requires a login; the default password is unique to each device and supplied with it
- **Factory reset**: holding the button for 2 seconds (or `Factory reset` in the web interface) erases all user data - settings, WiFi details, passwords, certificates, the USB drive and the system log - and reboots into default mode
- Every setting available in configuration mode is documented in the [Manual](documents)

Configuration mode and normal bridge operation are mutually exclusive - the device runs as one or the other, and switching between them requires a reboot.

## Network Services

Alongside the bridge itself, interfaceNode runs several independent network services:

- **Web configuration UI** - `https://<device>` (port 80 redirects to HTTPS), JSON `/config` API, configuration mode only
- **TCP bridge** - port configurable (49152-65535); TLS and login on by default, each can be turned off for clients that can't use them
- **WebSocket bridge** (`wss://<device>:8080/ws`) - a dedicated server, separate from the config UI, available during normal bridge operation. Clients log in at `https://<device>:8080/auth` for a one-time token. DyNet 1 and DyNet 2 frames can be filtered by type and by opcode before delivery to WebSocket clients
- **System log** (`/systemlog.html`) - configuration mode only
- **DyNet discovery beacon** - UDP responder on port 9998, independent of the bridge
- **mDNS** - device reachable by hostname on the local network; only running services are advertised, with their TLS and login settings

## Protocol Support

- **DyNet 1 & DyNet 2** - complete frames are checksum-validated and re-synchronised on invalid data before being bridged
- **Raw / passthrough** - `Protocol aware` set to `None` forwards every byte verbatim, for any other RS-485-based protocol

## Security

- **No shared default password** - every device has its own, supplied with it
- **Login on every network interface** - web interface (session), WebSocket bridge (one-time token) and TCP bridge (login line); repeated wrong passwords lock the login for an increasing time
- **Encryption in transit** - TLS 1.2 (ECDHE, AES-GCM) for the web interface, WebSocket and TCP bridges, on by default, using a per-device certificate made on the device (or your own, uploaded)
- **Encryption at rest** - passwords stored only as salted hashes (PBKDF2-HMAC-SHA256); settings storage (NVS) encrypted
- **Security event log** - logins, lockouts, setting changes, certificate changes, firmware updates, factory resets and restart reasons are recorded on the device (never passwords or keys), with an opt-out
- **Full factory reset** - erases all user data, credentials and the device certificate
- **Debug interfaces** - JTAG disabled in release firmware

### Security updates

- Security updates are provided **free of charge for 7 years after the product's end of life**
- Security fixes are released as **patch versions** (`x.y.Z`) as soon as they are ready, separately from feature releases, on the [Releases](https://github.com/AtkinEngineering/interfaceNode/releases) page
- Each release includes an SBOM and a vulnerability report checked against the National Vulnerability Database
- Vulnerabilities are acknowledged within 1 week, assessed within 3 weeks and fixed within 8 weeks (3 weeks if actively exploited) - see [SECURITY.md](SECURITY.md)

## Hardware

interfaceNode features a physical RS-485 transceiver (duplex mode set via a hardware jumper), USB CDC, and per-interface RGB status LEDs. Full electrical and mechanical specifications are in the [Datasheet](documents/).

## Documentation

- **Manual** ([`documents`](documents/)) - operation, configuration, every setting available in configuration mode
- **Datasheet** ([`documents`](documents/)) - hardware specifications

## Release Verification

Each release lists a SHA-256 checksum alongside its `.bin`. To verify a download before flashing it:

```
# Linux
sha256sum interfaceNode.bin

# macOS
shasum -a 256 interfaceNode.bin
```

Compare the result against the checksum published on the release page.

## Support

For product and general support enquiries, visit [www.atkin.engineering](https://www.atkin.engineering) or email @ [temp-pocket-3g@icloud.com](mailto:temp-pocket-3g@icloud.com)

To report a security vulnerability, do not open a public issue - see [SECURITY.md](SECURITY.md) for how to report it directly. Security update commitments are under [Security updates](#security-updates).

## Licence

interfaceNode contains proprietary firmware belonging to Atkin Engineering. The repository and its releases are publicly viewable and downloadable, but no permission is granted to copy, modify, distribute, reverse engineer, or commercially exploit this software except as expressly authorised by Atkin Engineering - see [LICENSE](LICENSE) for the full terms.

**© Copyright 2026 [Atkin Engineering](https://www.atkin.engineering). All Rights Reserved.** [^copyright]

---

*Specifications are subject to change without notice. No representation or warranty as to the accuracy or completeness of the information included herein is given and any liability for any action in reliance thereon is disclaimed.*

---

[^copyright]: © Copyright 2026 [Atkin Engineering](https://www.atkin.engineering). All Rights Reserved. ABN: 42 715 025 348.
