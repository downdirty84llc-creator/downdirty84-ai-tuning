# DD84 Calibration Studio — Windows preview 0.10.1

An offline Windows x64 workbench for local calibration evidence and simulation editing. Real HPT files are read only. Readable VCM Scanner CSV exports can be inspected, reviewed and saved; native HPL measurements are not decoded. Learning and real ECU writes remain disabled.

## Start here

Extract the entire `DD84-Calibration-Studio-win32-x64` folder and run `DD84-Calibration-Studio.exe` inside it. Keep supporting files together. Node is not required on the target computer. This is an unsigned portable development preview, not a signed installer; do not bypass Windows security warnings.

Use the workflow below that matches your task. Each panel stores a separate kind of record; saving one panel does not save the others. Retain source HPT, HPL and CSV files separately. Evidence reports contain fingerprints and notes, not backups of those source files.

Save actions open a Windows dialog. Finish the dialog and verify the resulting file before closing. The renderer cannot detect save cancellation, so the unsaved-work warning is conservative. If you change inputs while an export is being prepared, that export may be canceled; finish your edits and save again.

## Inspect a VCM Scanner CSV

1. Under **Recorded log inspection**, choose **Readable datalog CSV** and select a supported text export. The accepted header is `HP Tuners CSV Log File`, `Version: 1.0`, with channel IDs, names, units and `Offset` in seconds. Renaming an HPL file to CSV does not convert it.
2. Review **Measurement checks** and **Full recorded channel inventory**. Missing cells stay missing; zero stays numeric. Constant values and nonnumeric entries remain visible. Duplicate candidate channels are not selected automatically.
3. If you can identify a candidate, expand **Choose channels for review**, choose it and explain the selection. A channel with no finite numeric readings cannot be selected. Labels and units identify candidates, not verified sensors. Custom-label role mapping is not implemented.
4. Optionally enter the exact calibration SHA-256 and explain how you know that calibration ran during the recording. Leave the calibration association blank if unknown. The CSV does not prove this association.
5. Choose **Save log inspection**. Keep its JSON together with the source CSV. It includes full-recording statistics, candidate checks, documented channel selections and association notes, but no raw samples.
6. To resume, import the CSV first and choose **Reopen saved log review**. Confirm replacing the current review. Matching contents restore notes and selections; renamed CSVs are allowed. Changed contents, incompatible selections and unsupported release gates are rejected. Failed reopening preserves current choices.

Commanded lambda cannot substitute for measured lambda, MAF voltage for frequency, or spark advance for knock retard. No sensor validation, unit conversion, time alignment, interpolation, calibration correction or automatic learning is performed.

### Inspect and save a time segment

1. Choose **Channel to view**. Channels are inspected independently; viewing a channel does not select its measurement role.
2. Enter start/end recording-offset seconds and choose **Show time range**. Both endpoints are included. Equal bounds include all rows at that timestamp. **Show full recording** resets the bounds.
3. Review the independent minimum/maximum marks and **Timeline interval values**. At most 240 equal-duration intervals are shown. Empty intervals stay empty; there are no connecting lines or inferred samples.
4. Enter a **Segment review note**, then choose **Save selected segment**. This creates a separate source-bound report with channel metadata, inclusive bounds, interval summaries and the note. It does not contain raw samples, calibration associations or full-log channel selections.
5. To resume, load the CSV and choose **Reopen saved segment**. After confirmation, matching source contents restore channel, bounds and note. Statistics and metadata are recomputed from the CSV rather than trusted from saved summaries.

Channel/range changes, reapplying a range, full-recording reset and CSV replacement clear the segment note. Editing bounds clears the previous chart until applied. An invalid range is rejected; a range with no numeric readings never borrows neighboring values. Full-log inspection exports still use the entire recording, regardless of the visible range. Full-log reviews and segment reports are not interchangeable.

## Keep original/final tune evidence

Under **Real calibration file pair**, enter the vehicle/build notes and select original/final HPT files. **Save file-pair case** records the descriptions and file identities. The observed `HPT ` header is only a preliminary format check, not proof of validity, compatibility or authenticity. Different hashes do not establish which tables changed or that both files belong to the same vehicle.

**Reopen file-pair case** requires reselecting both source files and matching size/hash before export. Renaming is allowed when contents match. A mismatch clears that slot and blocks export. **Clear file-pair case** starts another pair. This panel cannot decode or edit HPT tables, and HPL logs are rejected as calibration files.

Under **Learning preparation**, record displacement, exact cam specifications/source, build notes and the original/intermediate/final tune and earlier/before-final/after-final log references. Explicitly identify the calibration running during each log only when known. Recording order does not prove an association. Replacing a tune clears associations to its former fingerprint. Reopening a learning case restores references only; it does not automatically verify or back up files.

The learning panel remains blocked pending measurements: its HPL attachments are fingerprinted only, and the separate CSV inspector is not connected to an adaptive learning engine. Cam/displacement notes provide context, not calculated tuning values. MAF, VE and timing require validated measurements and controller-specific definitions before any correction capability can be developed.

## Review exported tune differences

Under **Imported comparison evidence**, select a detailed Differences CSV and a saved file-pair reference. Names-only exports are rejected. Leave numeric direction unknown until a setting has been checked in both source views; then choose the verified convention and record that check.

The independently authored parser preserves supported scalar/vector/matrix differences and unsupported blocks without guessing their meaning. Axis differences are not actual operating coordinates. Text transitions retain source notation; diagnostic-code entries do not establish enabled/disabled behavior. Reports omit description prose but retain parsed difference rows for review. The association to a tune pair is operator supplied. No changes are applied to the simulation editor or a vehicle.

## Practice simulation editing

1. Choose **New sample project**, then **Export original backup** and complete the save dialog.
2. Change a working airflow value and leave the cell. Compare it with the unchanged original.
3. Use **Undo** or **Restore original values** as needed.
4. Choose **Save project copy**. Reopen the JSON with **Open DD84 project**.
5. Enter a review note and choose **Export review draft**. This includes changes, the project and a fingerprint of the original table and identity. Review notes are not stored in project copies.

Only `DD84_STUDIO_V1`, `SIM-ECM-01` and `Airflow.MAF.Curve` are supported for editing. Values are synthetic examples, not engine recommendations. Imported originals are supplied by the file and are not authenticated. A local draft is not cloud approval or a signed installation package.

## Saved records and limits

| Record | Contains | Needed to resume |
|---|---|---|
| `DD84_STUDIO_V1` | Simulation original and working table | Project JSON |
| `DD84_FILE_PAIR_V1` | Vehicle/build notes and two file identities | Case JSON and both matching HPT files |
| `DD84_LEARNING_CASE_V1` | Tune/log timeline, build notes and stated associations | Case JSON; retain and separately verify source files |
| `DD84_DIFFERENCES_V1` | Comparison evidence, direction and source identity | Evidence report; keep comparison CSV and tune pair separately |
| `DD84_LOG_INSPECTION_V1` | Full-recording summary, channel choices and notes | Review JSON and matching CSV |
| `DD84_LOG_SEGMENT_V1` | One channel/range summary and note | Segment JSON and matching CSV |

HPT pair inputs are bounded to 32 MiB each; learning evidence to 64 MiB each. Detailed Differences CSV inputs are bounded to 2 MiB. Log CSV inputs are bounded to 16 MiB, 100,000 data rows, 256 columns, 4,096 characters per field and five million cells. Saved log reviews and segment reports are bounded to 256 KiB. Invalid structure, duplicate channel IDs, decreasing/nonfinite timestamps and unsupported units/formats are rejected; repeated timestamps are preserved and counted.

Source CSV fingerprints cover decoded UTF-8 text. They establish matching content, not authenticity, vehicle identity, sensor accuracy or tuner approval. Raw VIN/creation metadata is not copied into log reports; operator-entered notes and filenames can still contain private information. Review those before sharing.

## Compatibility and next release gate

There is no proprietary HPT/HPL decoding, real-controller editing, diagnostic/emissions defeat editing, cloud connection, hardware read/write/recovery, signed installer or updater in this desktop preview. Existing platform owner-release and `SIMULATION_ONLY` gates remain unchanged. Each real-controller adapter will need controller/OS identity, legally accessible definitions and units, checksums and round-trip fixtures; real writes additionally require interruption/recovery bench validation.

See [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) for the current validation record and remaining acceptance work. A package build or a scoped native smoke test does not establish comprehensive release acceptance.

## Development

Use Node 22 for parity with CI. In this directory run `npm ci`, `npm test` and `npm start`. `npm run package` creates the Windows x64 portable folder under `dist/`. The [Windows workflow](../../.github/workflows/desktop.yml) installs dependencies, runs tests and the dependency audit, packages the app and retains its preview artifact for 14 days. Web/backend checks run separately.

The renderer has no Node integration, preload bridge, remote content, network access or granted device permissions. Context isolation and sandboxing remain enabled; navigation, webviews and new windows are denied. See [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security).
