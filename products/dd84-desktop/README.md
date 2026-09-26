# DD84 Calibration Studio — Windows preview

This Windows x64 desktop workbench runs offline. Preview 0.7 includes read-only HPT file-pair cases, learning evidence preparation, detailed comparison CSV imports and readable datalog inspection with measurement checks and documented channel selections alongside the simulation table editor.

## Real-file case workflow

Enter the vehicle description and build/change notes, then select the original and final `.hpt` files. Each file is bounded to 32 MiB, checked for the observed `HPT ` header, and fingerprinted with SHA-256. That header is a preliminary format check, not proof of validity, compatibility or authenticity. The app does not decode HPT tables or write to source files.

**Save file-pair case** exports notes and both file identities as `DD84_FILE_PAIR_V1`. It contains no calibration payload, absolute paths, approval or file backups. Keep your source files separately. **Reopen file-pair case** requires reselecting both source files and matching their size/hash before re-export. Renaming a file is allowed if its contents match. A mismatched file clears that slot and blocks export. Clear the case to start a different pair. HPL logs are rejected as calibration files.

Original/final roles and vehicle/build descriptions are supplied by the operator. Different hashes do not establish which tables changed or prove both files belong to the same vehicle. These cases remain `READ_ONLY_NOT_RELEASED` and their table-comparison status is `NOT_DECODED`.

For simulation editing, open or create a simulation project, preserve its original, edit MAF airflow values, undo changes, compare against the original, save a project copy and export an unsigned review draft.

## Run the packaged preview

Extract the entire `DD84-Calibration-Studio-win32-x64` folder and run `DD84-Calibration-Studio.exe` inside it. Keep its supporting files together. This is a portable development preview, not a signed installer. It requires no Node installation on the target computer. Do not bypass Windows security warnings; public distribution needs a signed, tested release.

1. Choose **New sample project**, then **Export original backup** and finish the save dialog.
2. Edit a working value and leave the cell. The original and comparison show the change.
3. Use **Undo** or **Restore original values** as needed.
4. Choose **Save project copy** to save a `.json` project. Use **Open DD84 project** to reopen it.
5. Enter a review note and choose **Export review draft**. This includes changes, the project, and a SHA-256 fingerprint of the original table and identity.

Save cancellation is not detectable by the renderer, so it conservatively keeps the unsaved-edits warning. Verify your saved file before closing. Review notes are included in review exports, not project files.

## Compatibility and boundaries

| Capability | Status |
|---|---|
| Windows x64 portable package | Build implemented |
| DD84_STUDIO_V1 JSON / SIM-ECM-01 | Import, editing and export |
| HPT original/final files | Read-only fingerprint and case notes; no table decoding/editing |
| Airflow.MAF.Curve | Original/working values in g/s, axis in Hz |
| Local draft review | Implemented; not cloud approval |
| Real controller binaries / proprietary tuning formats | Unsupported pending user inventory and format adapters |
| Cloud sign-in, jobs, log analysis and owner release | Existing web application; not connected from this offline preview |
| Hardware read/write/recovery | Not implemented here; existing simulation-only gate preserved |
| Signed installer / updater | Future release milestone |

The user's target is every controller and calibration format used in their business. The repository does not identify that inventory. Each adapter needs actual controller/OS identifiers, representative legally accessible original files, table definitions and units, checksum specifications and round-trip fixtures. Unknown files are rejected, never guessed. Real write support separately requires controller-specific interruption/recovery bench validation. File hashes show content consistency, not authenticity or tuner approval.

This preview does not support diagnostic/emissions defeat editing. It preserves the platform's current `Airflow.MAF.Curve` editing scope. Numeric limits are serialization bounds, not recommendations for safe engine operation. Original data in an imported project is supplied by that file and is not authenticated.

## Development and checks

Run `npm ci`, `npm test`, `npm start` in this directory. `npm run package` builds the portable Windows x64 folder under `dist/`. The desktop workflow produces a downloadable build artifact for each PR. The main web/backend CI continues to run separately.

The renderer has no Node integration, preload bridge, remote content, network access or granted device permissions. Electron isolation and sandboxing remain enabled; navigation and new windows are denied. These follow Electron's security recommendations: https://www.electronjs.org/docs/latest/tutorial/security

Automated tests cover immutable edits, comparison, JSON save/reopen, original recovery, draft fingerprints, unsupported controllers, malformed input and review requirements. Browser UI testing covers sample load, edit, comparison, undo and draft download using the same packaged renderer files. Native Windows installation/launch acceptance remains a separate check; a successful package build is not proof of that check.

## Learning preparation

The current source adds a separate `DD84_LEARNING_CASE_V1` reference record for original/intermediate/final tunes and earlier/before-final/after-final HPL logs. It records displacement, cam/build notes, bounded local file hashes and explicit owner-supplied log-to-calibration associations. It does not decode HPL channels or learn numerical corrections. These features are included in preview 0.3.0.

Reopening imports references only; files are not automatically verified or backed up. Replacing a calibration clears associations to its prior fingerprint. Chronology never creates an association. Readiness stays blocked even when every file is present because measurement import and validation are not implemented here. The panel distinguishes MAF, VE and timing evidence requirements without extending the backend editable-table allowlist, approval flow or physical-write gate.

Learning-case tests cover invalid inputs, dangling associations, forged release status, file limits and round trips. Browser verification opened the locally prepared five-file case and checked the missing-measurement status. No customer files are included in the repository.

## Read-only comparison import

The source now imports detailed vendor-exported Differences CSV files into `DD84_DIFFERENCES_V1` evidence reports. Import the detailed CSV and a saved `DD84_FILE_PAIR_V1` reference. Select the numeric sign convention only after checking an actual setting in both source views, and record that check. Unknown direction keeps raw differences. This is an operator-supplied association: the CSV cannot authenticate its tune pair.

The independently authored parser handles bounded quoted CSV, scalar changes and observed rectangular/single-column difference tables. It preserves unsupported blocks without interpretation, rejects names-only exports, strips description prose from native reports, fingerprints decoded source text and retains rows for audit. Axis differences are never used as actual operating coordinates. Text transitions retain source notation; diagnostic-code entries do not imply enabled/disabled behavior. No values are applied to the simulation editor or a vehicle.

Validation: 14 desktop tests pass, including malformed/oversized CSV, sign handling, single-column tables, names-only rejection, unsupported shape preservation and report provenance. The browser imported the local real export and pair, blocked export without sign evidence, then showed correct signed differences and requested the evidence download. Customer exports and reference values remain outside the repository. Preview 0.3.0 includes this importer; CI packages the same source.

## Readable datalog inspection

The current source adds a read-only CSV log inspector. It accepts the observed HP Tuners CSV Log File version 1.0 export, requiring channel IDs/names/units and Offset in seconds. Limits are 16 MB, 100,000 data rows, 256 columns, 4,096 characters per field and five million cells. Unsupported structure, duplicate channel IDs, nonfinite time, width mismatches and decreasing timestamps are rejected. Equal timestamps are counted and preserved.

Each channel reports numeric/text/missing counts and observed finite extrema. Blank cells are never filled or interpolated; zero remains a real recorded value. Text and nonfinite tokens are not silently coerced into numbers. Names and units stay unchanged, and no sensor-role mapping or sample-rate inference occurs. No raw VIN or creation metadata is copied into the report.

Save log inspection exports DD84_LOG_INSPECTION_V1 with a decoded-text SHA-256, channel summary and optional operator-stated calibration hash/association note. It does not include raw samples or prove that calibration ran during the log. Retain the source CSV. Learning readiness stays false: measurement validation, sensor mapping, steady-state filtering and correction proposals remain future work. Preview 0.4.0 includes datalog inspection; CI packages the same source.

Validation: all 19 desktop tests pass. The local customer export produced 51,166 rows and 63 channels spanning 511.695 seconds. Only synthetic fixtures are committed.

## VCM Scanner measurement candidates

The current source identifies candidate roles by exact export labels and units, and includes them in log inspection reports. Duplicate candidates remain ambiguous; nothing is automatically selected. Unsupported units, no numeric samples, constant values and nonnumeric entries are visible for review. Constant values are not automatically classified as broken sensors. The channel inventory remains available for custom labels that this initial mapping does not recognize.

Commanded lambda cannot substitute for measured lambda, MAF voltage cannot substitute for frequency, and spark advance cannot substitute for knock retard. Units are retained without conversion. Sensor validation, operator channel selection, time alignment and correction calculations are not implemented. Learning remains disabled even when candidate roles are present.

Validation: 22 tests pass. Applied locally to the existing VCM Scanner export, the checks identify duplicate RPM and temperature sources, a constant intake-temperature channel, voltage rather than MAF frequency, and no recognized measured-lambda or knock-retard channel. Customer measurements remain outside git. Preview 0.5.0 includes these checks.


## Documented channel selection

Preview 0.5 lets the operator choose among compatible candidate channels and document each selection. Each selection is validated against the current CSV and saved inside its fingerprinted inspection report. Selecting a different channel clears its prior explanation; loading a CSV clears all selections. Channels with no finite numeric samples cannot be selected. Existing flags remain in the record, and no selection grants sensor validation or learning readiness. Custom-label mapping is not implemented. Saved-review reopening is described below.

Validation: 24 tests pass. Browser verification with the local VCM Scanner export showed duplicate RPM choices, unavailable unsupported roles and preserved flags. Export without an explanation was rejected; an explicitly test-only selection was saved for artifact verification. Native Windows testing of 0.5 remains outstanding.

## Reopen a saved log review

Select the original exported CSV, then choose **Reopen saved log review**. After replacement confirmation, the app checks the decoded-text SHA-256 and restores channel choices, selection explanations and calibration association notes. A CSV rename is allowed; changed contents are rejected. Current choices remain intact on failure. Older inspection reports without channel selections reopen with no roles selected.

The parser accepts only bounded evidence-only reports, reconstructs statistics/candidates/flags from the selected CSV, and validates every restored channel choice. Saved summaries cannot override computed measurements or enable learning. A fingerprint establishes matching content, not authenticity of notes or calibration identity. Concurrent channel/note edits or a new CSV invalidate a pending restore.

Validation: 26 tests pass, including altered contents, forged release gates and stale/malformed channel selections. The actual VCM export and prior test-only downloaded selection report were reopened through the same module; 51,166 rows and the saved test RPM selection were preserved. Browser interaction testing restored the synthetic CSV review, selected RPM channel and exact evidence note after fingerprint verification. Preview 0.6.0 includes reopening. Native Windows testing of 0.6 remains outstanding.


## Recorded channel timeline

Preview 0.7 adds a read-only timeline for any non-time channel with finite numeric readings. Choose a channel after loading the CSV. At most 240 equal-duration intervals show independent observed minimum/maximum marks; empty intervals have no mark. Missing and nonnumeric counts are retained, zero is numeric, and the final interval includes the recording endpoint. There is no interpolation, connecting line, average, synchronized sensor model or correction calculation. A text interval listing accompanies the chart. Viewing a channel does not select it for a measurement role or save it into the review.

Validation: 29 tests pass, including gaps, repeated timestamps, zero-duration and long recordings, endpoint preservation and numeric-range time rejection. Local VCM RPM and intake-temperature channels were processed successfully. A synthetic browser renderer harness verified marks, an empty interval, labels and accessible text. Native Windows 0.7 synthetic CSV import, channel switching, timeline gaps and saved-review restore/save passed; the saved report matched the fixture exactly. Native 0.6 import/restore/save passed previously. No customer data is packaged.


## Focus on a time range

Preview 0.8 adds start/end times in recording-offset seconds. Choose a channel, enter bounds and select **Show time range**. Both endpoints are included; equal bounds show all rows at that timestamp. **Show full recording** resets the bounds. Channel switching keeps the entered range; loading another CSV resets it. Editing bounds clears the prior chart until applied, avoiding a stale view.

Counts and extrema are recalculated only from rows inside the chosen range. Empty or nonnumeric windows explicitly show no numeric readings and never borrow neighboring values. Invalid, reversed or out-of-recording bounds are rejected. The full CSV is still validated. The view is temporary: saved log reviews retain full-recording statistics and documented channel roles. This does not identify steady-state operation or calculate corrections.

Validation: 33 desktop tests pass, covering inclusive boundaries, duplicate timestamps, absent readings, invalid ranges and full-range equivalence.
Browser verification with synthetic data passed import, range application, channel switching, gaps, invalid/blank bounds, full-range reset, full-recording report save and CSV reload with no renderer errors. The Windows 0.8 package source/version were verified and customer files excluded. Native Windows 0.8 synthetic import, time filtering, channel switching, full-range reset, saved-review export and reopening passed. The saved report matched the browser baseline exactly.


## Save selected segment evidence

Preview 0.9 adds **Save selected segment** after applying a channel and time range. Enter a review note, then save the separate DD84_LOG_SEGMENT_V1 JSON report. It contains the full source CSV text fingerprint, filename, inclusive bounds, unchanged channel name/unit, interval counts/extrema and the operator note. It includes no raw samples, sensor validation, calibration association or correction proposal. Keep the source CSV separately. Missing-only ranges remain explicitly missing.

Changing channels, editing bounds, reapplying the range, resetting to the full recording or importing another CSV clears the segment note and disables export until a new note is provided. Changes during report generation invalidate the pending export. Full-log inspection reports keep their existing format and full-recording statistics. Segment reports cannot be reopened as full-log reviews.

Validation: 36 desktop tests pass. Synthetic browser testing verified imported range export, exact source hash, extrema, required notes, note clearing on channel/range/CSV changes and absence of renderer errors, alongside the previous time-range workflow. Native Windows 0.9 synthetic import, required-note gating, full-range segment export and channel-change note clearing passed. The saved report exactly matched the expected source-bound output.


## Reopen segment evidence

Preview 0.10 adds **Reopen saved segment**. Select the original CSV first, then the segment JSON and confirm replacing the current view. Matching decoded-text fingerprints restore channel, inclusive bounds and note; CSV renaming is allowed. Current summaries, channel metadata and flags are recomputed, so saved measurements cannot override the CSV. Full-log channel choices and calibration notes remain separate.

Reports are bounded to 256 KiB. Unsupported formats, released/learning-enabled reports, unknown units/endpoints, invalid channels/ranges, missing notes and mismatched contents are rejected without replacing the current segment. Any newer input invalidates pending restoration. Fingerprints verify matching content, not authenticity of the operator note or vehicle identity.

Validation: 39 desktop tests pass. Synthetic browser testing restored and re-exported a segment with exact JSON equality, rejected a mismatched source without losing the current view, and prevented a delayed restore from replacing a newly typed note. Existing import, timeline, save and note-clearing flows passed. Native Windows 0.10 testing remains outstanding.
