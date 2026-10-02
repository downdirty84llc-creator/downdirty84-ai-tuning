# DD84 Bench 0.1.0 — FRDM-A-S32K344

USB-only development milestone. No CAN driver is initialized; there is no ECU
read/write, calibration installation, cloud identity, or device authentication.
The reported board name is a model, not a unique hardware serial number.

## Build

Use S32 Design Studio 3.6.5 and installed S32K3 RTD 7.0.0 QLP03 D2512.
Import NXP's `nxp-appcodehub/dm-uart-button-s32k344` at
`7b4fdedafd6f767fc7a86078575738836a839401`, generate and build its board
configuration, then copy this directory's `main.c` and `console.h` into `src/`.
Build Debug_FLASH and use its S32K344 PEMicro debug launch. Preserve the original
demo ELF for rollback. This repository does not redistribute NXP RTD or its
generated board configuration; obtain those under NXP's applicable license.

`main.c` uses the generated clock/pin/UART configuration, copies the UART config
to install a callback, and installs NXP's UART6 ISR in the startup RAM vector
table. Receive callbacks rearm one-byte reception immediately and queue into
a 1024-byte ring. Foreground parsing and TX do not block receive interrupts.
On driver errors, foreground restarts reception. On loss, queued input and the
partial command are discarded through the next delimiter.

## Protocol

115200 baud, 8N1, no flow control. ASCII lines, LF or CRLF; no per-character delay.
Maximum command length is 95 bytes. Invalid bytes and oversized lines yield
`ERR LINE` at the delimiter. Unknown commands yield `ERR COMMAND`. Receive loss
yields `ERR RX_LOSS`; send a newline before retrying. Use request/response pacing
for normal operation; the finite buffer cannot guarantee unlimited pipelining.

Send `DD84 HELLO 1` for a single-line JSON response containing protocol
`DD84-BENCH/1`, board `FRDM-A-S32K344`, firmware `0.1.0`, mode `bench`,
capabilities `ping`, `led`, `status`, and `vehicleAccess:false`.
Other versions yield `ERR VERSION`. Commands `ping`, `led on`, `led off`, and
`status` return PONG, LED acknowledgments, and current software LED state.
The old demo's button handling is not part of this firmware.

## Verification

Compile/run `console_test.c` with a host C compiler. In the desktop directory,
run `npm test`; for an explicitly connected bench board run
`node board-hardware-test.cjs COM8` (select its actual port).
The hardware test changes only the bench LED and finishes with it off.

2026-10-02: ARM build passed without warnings; physical board passed handshake,
bulk LED/status commands, 100-command burst, oversized/invalid line rejection,
unsupported version rejection, fragmented handshake, and recovery after a
1500-command receive load. Electrical framing/noise fault injection and physical
LED observation remain unverified. This milestone does not validate CAN or ECU use.
