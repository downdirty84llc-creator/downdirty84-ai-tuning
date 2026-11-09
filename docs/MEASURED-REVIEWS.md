# Measured reviews in Studio 0.30 and the web workspace

Open Troubleshoot, describe the vehicle and checks, then expand **Compare measured differences and record the outcome**. Work remains local until you save a JSON and explicitly attach it to a job. Native tune files are fingerprinted only; their tables are not decoded or edited by this workflow.

1. Export the earlier and later recordings as CSV from their original software. In VCM Scanner choose **Export Log File → Comma Separated Text → Entire Log**, and disable **Interpolate Data Gaps** when preserving original missing readings. Record any export interpolation or resampling in the conditions notes. Keep native files.
2. Select each CSV. Review its time window and optionally filter on up to two exported channels per recording. A row must contain numeric values inside every selected filter. Missing filter readings are excluded and counted, never filled. Different export rates or sparse asynchronous channels can still prevent useful comparison.
3. Optionally select the corresponding native tune to compute its SHA-256 fingerprint, then explain how you know that exact tune ran during that recording. A filename suffix or timestamp alone does not establish this relationship. Replacing a CSV clears its prior tune binding.
4. Record why changes were made, what changed, relevant conditions, the success criterion, what was observed, next action and reviewer. Reported improvement is an operator statement; it does not establish horsepower or safety.
5. Choose **Build and attach measured review**, then **Save troubleshooting case**. Pending edits block saving until rebuilt or discarded. A saved summary can be reopened without sources; recomputation requires reselecting the original CSVs and tunes. Retain source files separately.
6. On My jobs, select the correct job, choose the saved case, inspect its preview and confirm its job association before attaching. Failed requests retain the snapshot for retry. The shop sees the same immutable snapshot; attachment does not start analysis or release a tune.

## Recheck a saved source

In a saved review, expand **Earlier/Later source, filters and complete channel inventory**, then select the original CSV under **Recheck earlier/later source**. This works in Studio, the web editor, and customer/shop case previews. The CSV is processed locally and is not uploaded.

- **Source and saved statistics match** means the selected bytes have the saved SHA-256 and the saved window, filters, channel identities, coverage counts and every statistic were reproduced. Identical bytes with a different filename are accepted and explicitly identified.
- **Different CSV selected** means the byte fingerprint differs. Select the original export; even different newline encoding produces different bytes.
- **CSV bytes match, but summary items differ** identifies stored statistics, channel metadata or counts that cannot be reproduced. Rebuild the review from its sources and inspect the differences. Structural validity alone cannot establish that statistics came from the CSV.

Checks apply only to the displayed summary in the current session. Opening/rebuilding a case, clearing a check, choosing a different file or encountering a read error cannot retain an earlier success. A delayed check from a replaced case is ignored. No verification claim is written into the saved case, and its notes, selections, hashes and reported outcome remain unchanged. Check both sides separately; a successful check does not establish sensor accuracy, tune-to-log association, matched test conditions, power improvement, calibration approval or learning readiness. Changing notes or measurements still uses the existing explicit build/save workflow.

## Supported data and calculations

- HP Tuners CSV version 1.0 with Channel Information, unique channel IDs, names, units, and Offset in seconds.
- Holley CSV with `Point Number,RTC` and a bracketed units row with RTC in `[sec]`; UTF-8 and observed Windows-1252 exports are supported. Blank channel labels remain in the inventory.
- Each file is limited to 32 MiB, 100,000 data rows, 512 channels and 8 million cells. Backward or invalid times, malformed quoting and inconsistent row widths are rejected. Split separate recordings in the originating tool.
- Every channel retains numeric, missing and nonnumeric counts; numeric values receive minimum, maximum, mean, median and nearest-rank 95th percentile. These are weighted by exported rows, not elapsed time. Repeated timestamps are counted and retained. Boolean/status text is not converted to numbers.
- Comparisons require an unambiguous identical nonempty label and explicit identical units. Every delta is later statistic minus earlier statistic. No cross-vendor mapping, unit conversion, interpolation or calibration correction is inferred. Unpaired, constant and incomplete channels remain explicit.
- Time and row-index columns are inventoried but excluded from comparison. Equal CSV fingerprints are flagged as insufficient independent evidence. No-data windows never borrow neighboring readings.

## Persistence and trust

V1 troubleshooting cases remain readable with their existing 128 KiB limit. V2 includes a measured review and permits up to 1 MiB; the measured report itself is capped at 768 KiB including pretty-printed output. The API revalidates counts, bounds, gates, source fingerprints and filter identity, and recomputes deltas and evidence gaps. Imported status/comparison claims do not override recomputation. The server cannot authenticate raw sensor statistics from submitted summaries; reports explicitly carry `SOURCE_SUMMARIES_NOT_SERVER_VERIFIED`.

No raw CSV or native tune bytes are embedded. Reports contain source filenames, sizes, hashes, summaries and operator notes. Owner scoping, exact-job lookup, idempotent retry, shop permissions and existing immutable snapshots remain enforced. No new database migration is required.

`SIMULATION_ONLY`, `learningReady: false` and `automaticApplication: false` remain mandatory. Different load, fuel, temperature, hardware, sensor scaling or recording setup can explain differences. A complete worksheet means documented evidence for human review; it does not establish an optimized calibration or enable learning, ECU writes or release.

## Verification

Synthetic tests cover HP/Holley parsing, encoding, missing/text readings, filters, windows, signed deltas, import tampering, size limits, V1/V2 persistence and the native save allowlist. Browser checks exercise desktop-to-web round trips, pending-edit protection, invalid import recovery, mobile layout, owner job attachment/retry and shop review. The database pipeline verifies V2 persistence and canonical hashes through actual JSONB storage. Real customer files remain outside the repository and CI fixtures.
