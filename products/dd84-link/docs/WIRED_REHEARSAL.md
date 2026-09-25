# Wired capture rehearsal v1

Local synthetic host rehearsal, not a USB driver or authenticated device link.
It uses the existing capture FIFO. Startup checks, physical ECU-write prohibition
and cloud authorization are unchanged. Requires Node 20+ and a C11 compiler.

From repository root:

```sh
npm --prefix products/dd84-link run test:wired
npm --prefix products/dd84-link run demo:wired
```

Set CC to a compiler executable if cc is unavailable (PowerShell example:
`$env:CC = 'C:\path\to\tcc.exe'`). CI uses GCC with address/undefined-behavior
sanitizers. The demo prints a temporary output directory containing
synthetic-capture.jsonl and report.json. An optional directory argument after --
is resolved from the product directory by npm. Existing files are not overwritten.
All output is labeled SYNTHETIC_HOST_REHEARSAL. The host-only C fixture supplies
test health evidence, pushes/pops 10,000 classic/FD frames through the FIFO and
encodes them. Node parses 317-byte chunks. Tests compare every field/payload to
independent expected values, a frozen vector and the standard CRC check vector.
Never include host_wire_fixture.c in a production firmware build.

## Format

All multibyte fields are unsigned little-endian. No native-struct serialization.
Exactly 112 bytes per record, with all unused and reserved bytes zero:

| Offset | Bytes | Meaning |
| --- | --- | --- |
| 0 | 4 | Exact ASCII magic D84W |
| 4 | 1 | Version 1 |
| 5 | 1 | Type 1 frame; 2 software queue status |
| 6 | 2 | Total size, exactly 112 |
| 8 | 8 | Nonzero capture session identifier |
| 16 | 4 | Sequence shared across both types, starting at 0 |
| 20 | 8 | Monotonic microseconds, shared across both channels |
| 28 | 80 | Body and zero padding |
| 108 | 4 | CRC-32/ISO-HDLC over bytes 0 through 107 |

CRC: reflected polynomial 0xedb88320, initial/final XOR 0xffffffff. CRC detects
corruption; it is NOT authentication or replay security.

Frame body: ID at 28 (4 bytes), channel 0/1 at 32, flags at 33 (bit 0 extended,
bit 1 FD, bit 2 BRS; others prohibited), encoded DLC at 34, byte length at 35,
payload at 36 (up to 64 bytes). Remaining bytes through 107 are zero. Validation
matches CAN_CAPTURE.md; remote frames are unsupported.

Status body: eight 64-bit counters at offsets 28,36,44,52,60,68,76,84: accepted,
drained, dropped_full, rejected_invalid, rejected_not_ready, rejected_timestamp,
queued, high_water. Remaining bytes 92 through 107 are zero. Require accepted =
drained + queued and queued <= high_water <= 256. Hardware overruns are unknown
(null in host output); these are software queue counters only. Status timestamps
must not predate frames.

The stateless C encoder validates before touching output. It does not consume
frames, allocate sequences, change health or transmit. The future board adapter
must serialize queue access, retain popped frames during transport backpressure,
and account separately for actual transport loss.

## Sessions and loss

Caller owns session and sequence allocation. Use a fresh nonzero session on
capture reset/reboot; production uniqueness/provisioning is future adapter work.
The fixture identity is fixed only for deterministic tests. After sequence
0xffffffff, start a new session; wrapping in the same session is rejected as stale.
64-bit values are decimal strings in JSON, preserving precision.

WireParser binds to one expected session; foreign sessions are rejected/reported.
Feed at most 4096 bytes per call. Retained stream state is at most 112 bytes;
returned events are bounded by input size. Invalid records emit an error and
resynchronize one byte later on exact magic. Discarded bytes are counted. Partial
records never emit frames. On EOF/loss call disconnect() to report/discard the
partial tail. Keep that parser for same-session reconnects to retain sequence
history. New sessions require explicitly new parsers and separate capture files.
After host restart, start a new capture session unless durable checkpoints are
implemented; this rehearsal does not persist deduplication state.

Forward gaps emit a range/count; sequences below the next expected value emit
duplicateOrStale and are discarded. Late arrivals do not revise earlier gaps.
Backwards timestamps are rejected without advancing sequence. Gap counts, queue
drops and hardware overruns are distinct; they must not be conflated.

## Remaining gates

No raw-frame cloud upload, engineering-unit decoder, physical USB adapter or
write command is added. Raw CAN is not existing numeric telemetry. Production
bridging needs authenticated identity, owner/session authorization, reviewed
persistence/privacy and validated board adapters. The rehearsal does not prove
electrical performance, USB throughput, secure identity or actual CAN timing.
Wi-Fi/BLE follows a stable wired path. ECU writes remain SIMULATION_ONLY.
