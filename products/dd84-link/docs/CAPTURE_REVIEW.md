# Wired capture review

The signed-in LINK workspace can open `synthetic-capture.jsonl` from the wired host rehearsal. Choose **Review a wired capture**, then select the file, or use **Load example capture** for a two-frame example. **Clear file review** removes the current result. Leaving or reloading the page also clears it.

The browser reads the file locally; this feature sends no file contents to the backend and does not persist them. It reports frame totals, channel and CAN/CAN-FD counts, elapsed microseconds, missing sequence numbers and queue losses. The scrollable preview retains only the first 50 frames.

## Accepted format and limits

- At most 8 MiB, 20,000 records and 2,048 characters per record.
- JSONL frame/status records emitted by the wired rehearsal, declaring `SYNTHETIC_HOST_REHEARSAL` and one nonzero uint64 session.
- Increasing uint32 sequences and nondecreasing uint64 timestamps, represented as decimal strings to preserve precision.
- Valid CAN IDs, flags, DLC, payload lengths and hexadecimal data; valid, consistent queue counters.
- Parser diagnostic/event records are not supported in this first viewer. Import the frame/status rehearsal export. Invalid input reports its line number and shows no partial result.

Missing sequences, missing final status, undrained frames, rejected frames and software queue drops produce warnings. Hardware overruns remain unknown. File labels do not authenticate a device, and a clean file does not establish physical timing or hardware readiness. Raw frames are not engineering-unit telemetry samples and are not submitted to the log-analysis API. This feature does not connect to hardware or enable ECU writes.

## Validation

`npm run test:capture-review` checks malformed files, limits, exact large timestamps, ordering and loss accounting, then builds the existing C fixture and imports all 10,000 frames through the wire parser. Set `CC` to a C compiler when it is not available as `cc`. CI runs this test alongside the existing frontend state tests, production build, backend integration checks and firmware guard tests.

Browser verification used the built frontend with an empty local overview fixture: the built-in example and actual 10,000-frame rehearsal file both displayed the expected totals and bounded preview. Authentication is covered separately by the existing application pipeline.
