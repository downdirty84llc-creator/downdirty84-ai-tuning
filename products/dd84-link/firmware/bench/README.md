# DD84 Bench 0.2.0 — FRDM-A-S32K344

USB bench development milestone with a fixed internal CAN self-test. There is
no normal-mode CAN transmit command, ECU read/write, calibration installation,
cloud identity, or device authentication. Use USB only, with CAN disconnected.
The reported board name is a model, not a unique hardware serial number.

## Build

Use S32 Design Studio 3.6.5 and installed S32K3 RTD 7.0.0 QLP03 D2512.
Import NXP's `nxp-appcodehub/dm-uart-button-s32k344` at
`7b4fdedafd6f767fc7a86078575738836a839401`, generate and build its board
configuration, then copy `main.c`, `console.h` and `loopback.h` into `src/`.
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
`DD84-BENCH/1`, board `FRDM-A-S32K344`, firmware `0.2.0`, mode `bench`,
capabilities `ping`, `led`, `status`, `can-loopback`, and `vehicleAccess:false`.
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

## Internal CAN self-test (0.2.0)

`can loopback` runs eight fixed classic standard-ID frames (ID 0x321, eight bytes)
inside CAN0. `loopback.h` is DD84 application code using NXP SDK register
definitions and clock/timer APIs, not a replacement for the production FlexCAN
receive driver. It initializes mailbox RAM while frozen, enables LPB and self
reception, verifies LPB before each transmission, compares mailbox RX ID/DLC/data,
then freezes/disables CAN0 and gates its clock. No CAN pins are muxed and no
transceiver is enabled by this module. There is no host-supplied ID/payload/rate.
Register waits time out after 100 ms. Failure reports the stage and cannot pass
without all eight matching frames and successful stopped-state readback.

The single JSON response is `type:loopback`, `source:INTERNAL_CAN_LOOPBACK`, with
`passed`, `canStopped`, `stage`, `received`, `tickHz` and `frames`. Each frame has
sequence 0–7, ID 801, observation `timestampTicks`, and 16 hex payload characters.
Ticks are accumulated software observation times since the test began, not
hardware CAN arrival timestamps. Divide by tickHz for seconds.

Studio performs a fresh compatible handshake before issuing the fixed command,
checks each returned frame independently, and marks exported reports
`vehicleData:false` and `learningEligible:false`. A report is a self-test result,
not proof of bus traffic, transceiver operation, authenticated identity, or
vehicle compatibility. It is separate from the production D84W capture stream.

2026-10-05: physical S32K344 passed 8/8 frames on the initial run and five repeat
runs, with CAN stopped after every run. USB regression tests also passed. External
pin activity has not been measured with a scope; the board remained USB-only.
Reference: [NXP S32K344 loopback explanation](https://community.nxp.com/t5/S32K/FlexCAN-Ip-Example-S32K344-Rx-interrupt-problem/m-p/1782464).
