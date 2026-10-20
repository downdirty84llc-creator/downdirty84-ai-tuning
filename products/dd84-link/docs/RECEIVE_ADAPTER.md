# Receive adapter milestone — 2026-10-05

Implemented: a host-tested adapter between the board receive callbacks, existing
capture queue and D84W encoder. **Not yet a FlexCAN peripheral driver or physical
CAN capture release.** USB-only Bench 0.2.0 is on the test board; its internal
loopback does not enable external CAN capture. See [external bench preparation](EXTERNAL_BENCH.md).

## Behavior

`dd84_receive_start` requires the existing application health gate to be READY,
all board callbacks, a zeroed unused adapter and a nonzero session ID. It never
constructs health PASS values or bypasses provisioning. Trusted platform startup
must provide real health evidence. Missing evidence remains blocking.

The board callback configures listen-only operation; a separate callback checks
fresh peripheral/transceiver state. Readback is checked before receiving and
after every poll. Configuration, readback, clock regression, transport failure
or sequence exhaustion stops the controller and latches an adapter fault.
The callback interface deliberately contains no CAN transmit operation.

Each foreground step handles at most 32 events and one USB write. The existing
256-frame capture queue supplies frame validation and overflow counters. A popped
frame becomes a retained 112-byte wire record until all bytes are accepted by the
transport. Partial writes and zero-byte backpressure do not pop another frame.
Sequence numbers cannot wrap. `drained` means removed from the software queue,
not delivered to the PC; include `pending_length` / `pending_offset` when recording
session shutdown diagnostics. Transport failures preserve the pending record.
Stopped/faulted sessions cannot resume through this API; export diagnostics then
start a new, independently provisioned session after resolving the fault.

The board supplies a common monotonic 64-bit microsecond clock. Current stamps
are **foreground observation times**, not CAN bus arrival timestamps. Do not use
them to claim bus-level timing accuracy. Hardware arrival timestamps and their
counter-wrap handling remain a board-driver task. `hardware_overrun_events`
counts notifications, not a known number of lost frames, and remains separate
from software queue drops and transport failures. This adapter currently emits
frame records; diagnostic counters are local and need a versioned status extension
before end-to-end loss reporting is complete.

## FRDM hardware work still required

The installed RTD 7.0.0 exposes `FlexCAN_Ip_SetListenOnlyMode`,
`FlexCAN_Ip_GetListenOnlyMode`, RX mailbox configuration, receive and polling APIs.
They have been inspected but are not wired to this portable adapter yet.
Generate the correct clock, pin and FlexCAN configuration in S32 Config Tools
for the actual board revision; verify the connector/transceiver mapping against
[NXP's board documentation](https://www.nxp.com/design/design-center/development-boards-and-designs/FRDM-A-S32K344).
Do not infer routing from a different S32K344 evaluation board.

Implement each callback against that generated configuration. Configure silent
mode before the peripheral ever leaves freeze/stop. Read back the controller
mode and relevant transceiver state from hardware, not a remembered boolean.
Do not replace the production health checks with synthetic evidence to make a
bench test start. Bench capture, if needed before provisioning, must be a separate
explicitly labeled build and cannot advertise production readiness.

## Physical acceptance procedure (pending)

1. Confirm board revision, CAN connector, supply, transceiver control pins,
   bus bitrate and termination against the schematic and actual equipment.
2. Use an isolated bench bus with known traffic and correct termination. A
   silent receiver does not acknowledge frames: use a generator that supports
   no-ACK test operation or another active bench node to acknowledge traffic.
3. Verify with a scope/analyzer that DD84 sends no data, ACK or error frames.
4. Compare known standard and extended frames, payloads, ordering and counts at
   declared rates/durations. Validate FD separately only with compatible hardware.
5. Test disconnect, reconnect, wrong bitrate, receive overrun and USB backpressure.
   Record observable losses separately; never infer completeness from queue count.
6. Confirm each capture has a fresh session, closeout diagnostics and correct
   timing labels before any vehicle connection.

Host tests cover gates, fresh mode checks, bounded polling, partial writes,
queue overflow, overrun events, clock regression, transport errors and sequence
exhaustion. CI adds address/undefined-behavior sanitizers. These tests use mock
board callbacks and do not establish electrical correctness.
