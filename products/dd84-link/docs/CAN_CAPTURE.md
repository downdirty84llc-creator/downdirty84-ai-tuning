# EVT-0 CAN capture contract

Status: host-tested queue and validation, not a board driver or physical capture.
The API is declared in `firmware/include/dd84_can_capture.h`.

## Receive path

The future board driver must verify receive-only mode, gather fresh health results,
update the startup gate, and submit decoded data frames to `dd84_can_capture_push`.
Only READY admits frames. This module offers no transmission operation and cannot
enable physical ECU writes. Reporting PASS is not proof of hardware configuration;
the board adapter must implement and validate that configuration.

There are two zero-based channels (0 and 1). Standard identifiers are at most
0x7ff; extended identifiers are at most 0x1fffffff. Classic CAN accepts DLC 0-8
with matching length. CAN-FD uses encoded DLC 0-15 with byte lengths
0,1,2,3,4,5,6,7,8,12,16,20,24,32,48,64. BRS is allowed only on FD frames.
Remote request frames are unsupported and rejected; they are not transmitted or
coerced into data frames. Error/status events need a separate future adapter path.

The adapter supplies a common, monotonic 64-bit microsecond timestamp across both
channels. It must extend hardware timer wraps and merge channel observations in
timestamp order before submission. Equal timestamps are permitted. A backwards
timestamp is rejected even if the previous valid frame was dropped due to a full
queue. Invalid or not-ready submissions do not advance the timestamp watermark.
These checks detect ordering errors; they do not prove timestamp accuracy.

## Queue and accounting

The fixed 256-frame FIFO owns a copy of each accepted frame. Unused payload bytes
are cleared. A full queue rejects the newest frame and increments `dropped_full`;
it never silently overwrites the oldest unconsumed frame. The caller receives a
distinct result for accepted, not-ready, invalid, out-of-order and full.

`dd84_can_capture_pop` reads the oldest frame. NULL output or an empty queue returns
false without consuming data or modifying output. Drain is allowed after a health
fault for diagnostics; new capture remains blocked. This is a local memory API,
not permission to upload data without authenticated ownership/session checks.

Stats report accepted, drained, queued, high-water mark, full-queue drops and
rejection categories. Between resets, accepted = drained + queued. Counters are
64-bit. Hardware FIFO overruns and transport losses are NOT measured by this
module; the board/bridge must report those separately for end-to-end loss accounting.

Reset clears frames, timestamps and counters. It must be called only at capture
session boundaries, with the driver stopped and pending data/stats handled. The
bridge must give each session a separate identity; counters alone are not an
upload deduplication key. Reset does not authorize capture or clear application
faults. Reinitializing application health is also not a substitute for resetting
the capture session.

## Integration restrictions

All capture calls and application health changes must run in one serialized
execution context. This implementation is intentionally not ISR/task concurrent.
The NXP port must either dispatch events into one task or protect all operations
with a reviewed critical-section strategy. Do not call this API directly from
multiple interrupts and a drain task without that integration work.

Do not send raw C structs over USB: alignment, padding, bool representation and
endianness are not a wire protocol. The future bridge must encode individual
fields, version messages, bound message sizes, authenticate the device, and bind
uploads to the correct vehicle session. Raw CAN frames are not the numeric
engineering-unit samples accepted by the existing telemetry API. No cloud schema,
raw-frame ingestion endpoint or decoder is introduced here.

## Evidence and next gate

Host tests cover frame limits and FD lengths, both channels, startup/fault gating,
FIFO drain/wrap, overflow without overwrite, timestamp wrap extension/regression,
payload clearing, reset and statistics. CI also runs address/undefined-behavior
sanitizers. These are synthetic fixtures; they do not demonstrate CAN bus behavior.

Next: identify the physical board revision, install/pin NXP RTD/toolchain, implement
receive-only CAN and clock adapters, and compare known generator traffic against
the queue at declared rates/load/duration. Then implement the authenticated wired
bridge. Secure boot, wired recovery and real ECU writes remain governed by the
original handoff; physical writes stay disabled.
