# Measured reviews in Studio 0.35 and the web workspace

Open Troubleshoot, describe the vehicle and checks, then expand **Compare measured differences and record the outcome**. Work remains local until you save a JSON and explicitly attach it to a job. Native tune files are fingerprinted only; their tables are not decoded or edited by this workflow.

1. Export the earlier and later recordings as CSV from their original software. In VCM Scanner choose **Export Log File → Comma Separated Text → Entire Log**, and disable **Interpolate Data Gaps** when preserving original missing readings. Record any export interpolation or resampling in the conditions notes. Keep native files.
2. Select each CSV. Review its time window and optionally filter on up to four exported channels per recording; expand **Additional filters (3–4)** when needed. A row must contain numeric values inside every selected filter. Missing filter readings are excluded and counted, never filled. Different export rates or sparse asynchronous channels can still prevent useful comparison.
3. Optionally select the corresponding native tune to compute its SHA-256 fingerprint, then explain how you know that exact tune ran during that recording. A filename suffix or timestamp alone does not establish this relationship. Replacing a CSV clears its prior tune binding.
4. Record why changes were made, what changed, relevant conditions, the success criterion, what was observed, next action and reviewer. Reported improvement is an operator statement; it does not establish horsepower or safety.
5. Choose **Build and attach measured review**, then **Save troubleshooting case**. Pending edits block saving until applied or discarded. A saved summary can be reopened without sources; recomputation requires reselecting the original CSVs and tunes. Retain source files separately.
6. On My jobs, select the correct job, choose the saved case, inspect its preview and confirm its job association before attaching. Failed requests retain the snapshot for retry. The shop sees the same immutable snapshot; attachment does not start analysis or release a tune.

## Continue from a saved job snapshot

In My jobs or the shop workspace, open a saved case and choose **Open in Troubleshooting**. The link contains only the job ID, case ID and access scope. The web workspace fetches the exact snapshot through the existing authenticated customer or shop endpoint, verifies both identifiers, and recalculates the case assessment. Shop access still requires the server's admin permission; the link never grants access by itself.

The opened copy retains all measured summaries, source identities, filters and outcome notes. Edit the local copy, save its JSON, then explicitly attach the revision to the matching job when appropriate. Opening or editing does not modify the saved attachment, upload evidence, run analysis or release a tune. Source CSVs and native tune files are not downloaded or reverified; use the existing source-check/resume tools to reselect originals.

If the workspace has unsaved work, **Keep current case** is the default focused choice; **Replace current case** opens the incoming copy. Replacement waits for an in-flight save. An expired session, denied access, missing case, malformed response or failed request leaves the current case untouched. Retry after resolving the failure. If you edit or choose another case while loading, the delayed response cannot overwrite it. Leaving the handoff cancels its pending replacement; opening a local JSON or New case clears the completed handoff link. No automatic fallback to a different job or snapshot occurs.

The Windows app remains offline: download the saved JSON from the web and open it in Studio. Its shared editor also prevents replacement during a pending save and ignores late file reads after New case. Replacing a case closes its previous print preview.

## Recheck a saved source

In a saved review, expand **Earlier/Later source, filters and complete channel inventory**, then select the original CSV under **Recheck earlier/later source**. This works in Studio, the web editor, and customer/shop case previews. The CSV is processed locally and is not uploaded.

- **Source and saved statistics match** means the selected bytes have the saved SHA-256 and the saved window, filters, channel identities, coverage counts and every statistic were reproduced. Identical bytes with a different filename are accepted and explicitly identified.
- **Different CSV selected** means the byte fingerprint differs. Select the original export; even different newline encoding produces different bytes.
- **CSV bytes match, but summary items differ** identifies stored statistics, channel metadata or counts that cannot be reproduced. Rebuild the review from its sources and inspect the differences. Structural validity alone cannot establish that statistics came from the CSV.

Checks apply only to the displayed summary in the current session. Opening/rebuilding a case, clearing a check, choosing a different file or encountering a read error cannot retain an earlier success. A delayed check from a replaced case is ignored. No verification claim is written into the saved case, and its notes, selections, hashes and reported outcome remain unchanged. Check both sides separately; a successful check does not establish sensor accuracy, tune-to-log association, matched test conditions, power improvement, calibration approval or learning readiness. Changing notes or measurements still uses the existing explicit build/save workflow.

## Update a saved outcome without reloading recordings

Open the saved case, edit the reported outcome or its explanation, conditions, success criterion, next action and reviewer, then choose **Update outcome notes**. Both source summaries, tune fingerprints and associations, windows, filters, channel statistics and calculated differences stay unchanged. Choose **Save troubleshooting case** to retain the revision. A previously attached job snapshot remains immutable; attaching the revision creates a separate snapshot.

Recording edits cannot be silently discarded by updating notes: build those changes first, or use **Discard pending measured changes** and enter the notes again. Rebuilding a saved review requires each previously saved CSV. To intentionally remove one side, choose **Clear earlier/later recording**, then build; the missing recording becomes an evidence gap. Selecting a single CSV does not remove an unloaded saved side.

Outcome changes remain operator statements. They do not authenticate stored measurements or establish improvement. Source checks reset for the updated display and can be rerun against the original CSVs.

## Resume a saved comparison for editing

Open the saved case and choose **Resume saved earlier/later CSV** within each recording. Select its original CSV. The local check requires matching SHA-256, source metadata, all channel statistics and counts, and the saved filter identities. A wrong CSV or altered summary is refused; existing editing inputs and the attached report remain unchanged. A read that finishes after another edit or case replacement cannot overwrite that newer work.

Successful resume restores the saved start/end times, all filters and their bounds, and the stored tune fingerprint and association note. A renamed byte-identical CSV is accepted and identified; the saved original source name is retained. The native tune file is not rechecked, and its association remains an operator statement. Source contents stay local.

Resume both saved sides before rebuilding, review or change the selections, choose **Build and attach measured review**, then **Save troubleshooting case**. Resuming alone does not change the attached report. An unchanged rebuild preserves the complete normalized case. Editing a filter recomputes measurements from the selected source; no automatic learning or tuning approval is added.

The regular **Earlier/Later CSV** selector remains the replacement workflow: it starts at the full recording window, clears filters and removes the prior tune association. Use it when intentionally replacing a source or rebuilding a summary that did not pass verification. It does not claim that mismatched evidence has been verified.

## Explore channels in a saved review

**Review individual channels** is available in Studio, the web editor, and customer/shop case snapshots. Search by channel name, exported unit or channel ID; select an exact unit, statistic and channel view. Available views include comparable channels, a changed/increased/decreased statistic, incomplete numeric readings and unpaired channels. Direction filters apply to the selected statistic only. They do not rank changes across units or classify performance improvements.

Choose a channel to inspect all five statistics, earlier/later windows and filters, source filenames and IDs, and exact numeric/missing/nonnumeric counts. Numeric coverage uses each recording's included rows as the denominator. Percentages are truncated to one decimal place so incomplete readings never round up to 100%; exact counts remain visible. Coverage does not measure elapsed-time sampling, sensor quality, or simultaneous acquisition. No-data windows and absent sides remain explicit.

Duplicate labels, different units, unspecified units, blank labels and channels without numeric pairs remain separate unpaired entries, with the pairing reason. They are never combined through the display controls. Time/index columns remain in the complete source inventory. A difference beyond the numeric range is unavailable, not zero.

Search, selection and display filters do not alter the case, its evidence gaps, source checks or reported outcome. Saving still includes the complete review. View settings reset when opening or rebuilding a case; no search or inspection state is persisted or sent to the API.

## Prepare a printable handoff

Choose **Preview printable case report** in Troubleshooting or a customer/shop case snapshot. The local preview uses the full normalized case, including context, checklist findings, retained checks from other issues, outcome notes, evidence gaps, source fingerprints, windows and filters. Current assessment and source references are recalculated from the trusted catalog. Pending measured edits must be built/applied or discarded first; the preview never silently prints an older attached review.

Full channel tables are included by default. Every source channel is represented, with all five statistics, numeric/missing/text counts and the available differences. Time/index columns are inventoried separately. Channel search and view filters do not limit the report. Uncheck **Include full channel tables** for a shorter summary; the document explicitly states that measurements were omitted and retains its evidence gaps and limitations.

**Print / Save as PDF** opens the system print dialog. Choose a printer or a PDF destination if supported. The application cannot verify completion; canceling does not save a report. Only the report prints, excluding navigation, editing controls, other job data and private shop notes. Review your own case notes for information you do not intend to share. Printing does not send anything, save the editable case or attach it to a job. Save the JSON separately; PDFs cannot reopen as cases.

The document includes a SHA-256 of the full normalized case serialized as UTF-8 `JSON.stringify(caseReport, null, 2)` without a trailing newline. The fingerprint identifies contents, not authenticity or approval, and is independent of the full-table display choice. It is not the server's attachment identifier. Session-only source checks are not exported as verification claims. Close or Escape returns to the previous control without changing the case.

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
