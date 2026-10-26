# DD84 Calibration Studio — Windows preview 0.26.0

An offline Windows x64 workbench for local calibration evidence, simulation editing and real exported-value drafts. Captured complete Sierra MAF/spark/cooling and VE zone boundaries are editable in separate DD84 drafts. VE coefficients remain read-only with named mode rows while their physical units and scaling are unverified. Captured controller identity can be attached to the exact source fingerprint. Native HPT/Holley files remain read only; this preview has no validated native decoder or writer. Readable VCM Scanner CSV exports can be inspected, reviewed and saved; native HPL measurements are not decoded. Learning and real ECU writes remain disabled.

## Start here

Extract the entire `DD84-Calibration-Studio-win32-x64` folder and run `DD84-Calibration-Studio.exe` inside it. Keep supporting files together. Node is not required on the target computer. This is an unsigned portable development preview, not a signed installer; do not bypass Windows security warnings.

Use the workflow below that matches your task. Each panel stores a separate kind of record; saving one panel does not save the others. Retain source HPT, HPL and CSV files separately. Evidence reports contain fingerprints and notes, not backups of those source files.

Save actions open a Windows dialog, then show **Saved**, **Save canceled** or **Save failed** in the pinned status area. A successful save flushes and checks the complete JSON contents before replacing the destination. Cancellation writes nothing; a write or verification failure leaves an existing destination intact. A changed destination detected during preparation is rejected. The bridge accepts bounded DD84 JSON records only and refuses native tune extensions. Choose a different name to keep an older JSON copy.

Only one save can run at a time, and normal closing is blocked while its dialog or disk write is pending. Wait for the result, then close again. Saving captures a copy of that panel at the time of the request; later edits and other panels need separate saves. Panel unsaved-work warnings remain conservative, including after a successful save. If inputs change while a report is being prepared, its existing validation may cancel that export; finish your edits and save again.

These safeguards are not crash recovery, autosave or a power-loss guarantee. A force-quit or disconnected drive can leave a temporary file; keep your source files and backups. Browser development previews retain an explicitly unconfirmed download fallback.

When closing with unsaved work, **Keep editing** is the default and Escape also keeps the window open. Keyboard focus returns to the active field so you can continue editing. Only **Discard and close** allows the pending changes to be discarded.

## Move around the workbench

The navigation bar stays visible as you scroll. Choose **Open project**, **Recorded logs**, **Learning case**, **Edit parameters**, **Review changes** or **Save** to move directly to that section. Project actions appear after a project is open. Activating a shortcut focuses the section heading; Tab continues into its controls.

In the Windows app, **View size** enlarges the interface from 100% to 200%.
Use **Reset view** or Ctrl+0 to return to 100%; Ctrl+Plus and Ctrl+Minus move
through the available sizes. Each launch starts at 100%. View size changes
presentation only and is not saved in a calibration project. On a short window
at high zoom, the navigation area scrolls independently; Tab also brings its
focused controls into view. Browser previews use the browser's own zoom.

Editor status and validation messages stay in the bar until replaced or dismissed. Tab and Shift+Tab commit a numeric cell through the normal validation rules and move to the next or previous control, including after a rejected value. A rejected value restores the last accepted value. Wide tables have a keyboard-focusable scroll region: Tab to the outlined region and use the arrow keys to scroll, or Tab again to enter its cells.

## Edit captured real parameters

Open a prepared real-value DD84 project, or select the captured export stage and readable export JSON. Edit any defined value, compare with its preserved original, undo and save a draft copy. Recheck its native source fingerprint when needed. Unknown Holley candidate definitions remain read-only. See [Real parameter drafts](REAL_PARAMETER_DRAFTS.md) for supported inputs, complete workflow and the remaining native-controller requirements.

## Adjust a table range

For an editable curve or map, use **Edit a table range** below the table. Choose the first/last columns and, for a map, first/last rows in displayed order. Both endpoints are included, and blue outlines identify the selection. Named axis labels remain visible.

Choose **Set to value**, **Add amount**, or **Scale by percent**. For example, +5 percent multiplies each selected working value by 1.05; zero remains zero and negative values keep their sign for a positive percentage. These are manual calculations, not suggested tuning corrections. Values use JavaScript numeric precision without deliberate rounding or native-controller quantization.

Choose **Preview range adjustment**, inspect before/after values, then **Apply previewed adjustment**. One invalid result rejects the entire adjustment. Changing the selection or amount invalidates the preview. One **Undo** reverses the whole range, preserving originals and fixed axes. A preview with no changed values cannot be applied. The preview lists up to 200 cells; its total count and applied change include the full selection (up to the existing 4,096-cell table limit).

Range editing supports the same defined numeric curves/maps as single-cell editing. Scalars, switches and choices keep their existing individual controls; unknown and unverified tables remain read-only. Save/reopen uses the existing project formats. Native HPT/Holley editing and vehicle writing remain unavailable.

## Compare real tune stages

With a real draft open, choose **Reference DD84 draft** under **Compare real tune stages**. The comparison uses the open draft's working values minus the reference draft's working values. It checks parameter labels, units and exact axes; missing tables and incompatible metadata are reported separately. Controller compatibility is not established by this comparison.

Select a parameter to see its changed cells. Add a comparison note and choose **Save tune-stage comparison** for all changes, both draft snapshots and their hashes. Editing either loaded stage clears the note; replacing the open project clears the reference. Project saves do not include this separate comparison. The reference is read only and never overwrites the open draft.

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

### Attach reviewed CSV measurements to a learning case

1. Include the tune in the learning case. Under **Recorded logs**, import its readable CSV, enter that tune's exact SHA-256 and explain the association. Select at least one supported channel and record why you selected it.
2. Return using **Learning case**, select **CSV timeline role**, explain why the recording belongs in that stage, and choose **Attach current reviewed CSV**. The association must match an included tune. An after-final CSV must match the final tune; the same CSV contents cannot occupy multiple stages.
3. Review numeric, missing and nonnumeric counts, channel flags and unselected roles. These counts are recomputed from the CSV; sparse cells are not filled, and constant values remain flagged without being declared failed sensors.
4. Save the learning case. Reopening it restores references and notes only. Use **Recheck CSV** for each saved stage to match its contents and recompute coverage. Renamed matching CSVs are accepted. Changed contents or incompatible channel choices are rejected without replacing current evidence.
5. Replacing a native tune clears CSV references and native-log associations tied to its previous fingerprint. Replacing a native HPL timeline slot clears its CSV stage. **Remove … CSV** removes only that case reference.

New saves use `DD84_LEARNING_CASE_V2`, up to 256 KiB. Legacy V1 cases open and upgrade with no invented measurements. Older Studio versions do not support V2 cases; keep a separate legacy copy if needed. Saved cases contain source fingerprints, channel choices and notes, not raw CSV/HPT/HPL contents, computed statistics or persistent source-verification claims. Retain the source files separately.

CSV placement and calibration associations remain operator statements. Matching timeline roles do not verify that a CSV was exported from an attached HPL. Rechecking CSV bytes does not reverify a native tune, authenticate sensors, establish comparable runs or prove performance improvement. The learning panel remains blocked: no adaptive learning engine, automatic corrections or ECU writes are enabled. Cam/displacement notes provide context, not calculated tuning values. MAF, VE and timing still require validated measurements and controller-specific definitions.

### Compare two reviewed log windows

1. Attach or recheck two CSV stages in the same learning case. Choose **Earlier comparison stage** and **Later comparison stage** in timeline order. Earlier-to-before-final comparisons are allowed when no after-final recording exists; they do not assess the final tune.
2. Choose a **Shared reviewed channel** selected in both CSVs. Channel IDs may differ, but exported units must match exactly. Units are not converted.
3. Set each recording's own start/end offset seconds. Both endpoints are included. Enter a **Window comparison note** explaining the chosen windows and known differences in operating conditions.
4. Choose **Compare log windows**. The table shows each source, channel, range, export-row counts, missing/nonnumeric counts, repeated timestamps and observed minimum/maximum. Empty and missing-only windows stay empty; adjacent readings are never borrowed.
5. **Save log-window comparison** writes a separate report. Keep the learning case and both original CSVs. To reopen, open that same case, recheck both CSVs, then use **Reopen log-window comparison**. The whole case fingerprint must match, including its notes. Saved statistics and labels are discarded and recomputed from the checked sources.

Changing case details, attachments, stage choices, channel or time windows clears the comparison and its review note. Changing the note clears the displayed result until compared again. A failed report reopen retains the current comparison. This report is not included in a learning-case save.

These are independent window summaries, not synchronized or load-matched samples. Minima/maxima are not paired differences, correction factors or evidence of performance improvement. There is no sensor-delay correction, interpolation, inferred sampling rate, automatic tuning or ECU writing. Source text stays private in memory and is not copied into the report.

### Review operating context

Preview 0.24 includes an **Operating context** table below each window comparison. It uses only the RPM, manifold absolute pressure, intake-temperature and coolant-temperature roles already selected and documented in each CSV review. It does not automatically select candidate channels.

Each side shows its observed range and numeric/missing/nonnumeric counts inside the chosen time window. When both selections have identical exported units and finite readings, the review intersects their independent minimum/maximum ranges and counts readings inside that inclusive interval. It distinguishes disjoint ranges, a single shared value, ordinary overlap, and overlapping bounds with no readings inside on one side. Unselected channels, empty windows and mismatched units remain explicit.

These counts include repeated timestamps and are not dwell time or independent sample counts. Overlapping ranges do not prove simultaneous RPM/load/temperature coverage or comparable conditions: asynchronous channels, sensor accuracy, fuel, hardware and ambient conditions remain unverified. The review never marks conditions matched or enables learning.

### Review a selected RPM / pressure band

Preview 0.25 adds **Also review a shared RPM / pressure band**. Review RPM and MAP in both source CSVs, recheck the sources, choose the comparison stages and channel, then enable the band. Enter RPM and manifold **absolute** pressure minimum/maximum limits using the displayed exported units. The same inclusive limits apply to both time windows. Pressure is not gauge boost; no conversion is performed.

After entering the comparison note, choose **Compare log windows**. A separate band table shows total window rows, rows excluded for missing/nonnumeric RPM or pressure, rows outside the band, included rows, repeated timestamps and numeric/missing/nonnumeric readings for the selected comparison channel. Its minimum/maximum use only included rows. The original whole-window and independent-context tables remain visible. Empty bands and missing target readings are explicit.

RPM and pressure must both be finite and inside the band on the same CSV row. Channels may be asynchronous or repeat older values, so this filter does not establish simultaneous acquisition, steady state or matched conditions. Counts are not dwell time or independent samples; ranges do not demonstrate an improvement or suggest corrections. No values are filled or interpolated. Changing band limits or toggling the band clears the result and review note; changing stages or rechecking sources also resets the band.

New comparison saves use `DD84_LEARNING_COMPARISON_V4`. Existing V1/V2 reports reopen and upgrade with no band selected; V3 retains its band. All older formats upgrade with unknown run setup. Reopening requires the matching case and checked CSVs. Context, band counts, setup comparisons and channel statistics are recomputed; saved derived results are never trusted. Older Studio versions cannot reopen V4 comparison reports. The learning-case format remains V2 and does not embed this separate comparison.

### Record each run's setup and sensor notes

Preview 0.26 adds **Earlier run setup** and **Later run setup** under **Run setup and sensor notes**. Record the controller family, operating-system ID, displacement in liters, cam specifications/installation, hardware, fuel and sensor checks separately for each run. Leave unknown fields blank. Any entered setup detail requires a **Source and sensor-check evidence** note explaining its source and any check methods. Vehicle-wide notes are never copied into these fields.

After comparing, **Run setup review** shows missing details, different reported values and identical reported values. Text equality only ignores outer whitespace; different wording is not interpreted as a hardware change, and identical wording is not verified compatibility. Sensor notes remain operator statements, not authenticated check results. The report binds each setup to the selected stage, CSV fingerprint and associated tune fingerprint without claiming those notes were decoded from either source.

Setup notes are saved only in the separate comparison report. Editing a setup detail clears the result and window note. Changing the stage or rechecking/replacing a source also clears both setup records to prevent notes moving to another recording. Channel, time-window and band changes retain setup notes but clear the result and window note. Reopening a valid V4 report restores its complete notes and recomputes the review; incomplete records or unsupported verification claims are rejected while retaining the current view. No setup entry or equality enables learning or automatic application.

## Review exported tune differences

Under **Imported comparison evidence**, select a detailed Differences CSV and a saved file-pair reference. Names-only exports are rejected. Leave numeric direction unknown until a setting has been checked in both source views; then choose the verified convention and record that check.

The independently authored parser preserves supported scalar/vector/matrix differences and unsupported blocks without guessing their meaning. Axis differences are not actual operating coordinates. Text transitions retain source notation; diagnostic-code entries do not establish enabled/disabled behavior. Reports omit description prose but retain parsed difference rows for review. The association to a tune pair is operator supplied. No changes are applied to the simulation editor or a vehicle.

## Multi-parameter simulation editing

1. Choose **New sample project**. The library has six synthetic definitions: a MAF curve, VE and spark maps, an idle scalar, a demonstration selection list and a demonstration switch. These are not decoded vehicle parameters or tuning recommendations.
2. Search by label, group or path and select a parameter. Maps use X across columns and Y down rows. Axes remain fixed. Each cell shows original/working values; changed cells are highlighted. Format bounds and units come from the bundled definition set, not the imported file.
3. Edit a working value and leave the cell. **Undo** reverses the last project edit (up to 100 in the current session). **Restore selected original** resets that parameter; **Restore all editable originals** resets known parameters. Unknown definitions stay visible and read-only, including any imported differences.
4. **Export original backup** writes all supplied originals, including unknown parameters. **Save project copy** preserves every original/working value and fixed axis. Reopen using **Open DD84 project**. Legacy V1 projects upgrade to a one-parameter V2 project without inventing additional tables.
5. Enter a note and **Export review draft**. It includes changes across all parameters, coordinates, units and a SHA-256 fingerprint of the complete original baseline. Numeric changes from zero omit a multiplier. Switches and choices have no numeric multiplier. Changing data or notes while a review is prepared cancels that export.

In V2 simulation projects, only the bundled synthetic controller and definitions are editable. Real exported-value drafts use a separate schema described above. HPT, BIN and Holley tune files are not decoded or converted to V2. Unknown definition paths are preserved read-only; an imported file cannot supply executable definitions or authorize writes. Supplied originals and their hashes establish matching content, not authenticity. Review notes appear in review drafts, not project copies; undo history is session-only.

See [PARAMETER_PROJECT.md](PARAMETER_PROJECT.md) for the V2 format and the requirements for extending the editor to real controllers.

## Saved records and limits

| Record | Contains | Needed to resume |
|---|---|---|
| `DD84_STUDIO_V2` | Simulation parameters, fixed axes, original and working values | Project JSON; V1 also accepted and upgraded |
| `DD84_STUDIO_REVIEW_V2` | Multi-parameter differences, baseline fingerprint, note and embedded project | Review-only report; reopen the separately saved project |
| `DD84_FILE_PAIR_V1` | Vehicle/build notes and two file identities | Case JSON and both matching HPT files |
| `DD84_LEARNING_CASE_V2` | Tune/log timeline, build notes, CSV references and stated associations | Case JSON; V1 upgrades; retain and recheck source files |
| `DD84_LEARNING_COMPARISON_V4` | Independent channel windows, context, optional RPM/pressure band, per-run setup/source notes, case fingerprint and note | Matching case and both rechecked CSVs; V1–V3 upgrade with unknown setup; V1/V2 without a band; up to 1 MiB |
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

Packaging now uses ASAR and an explicit application-file allowlist. It excludes
local customer data, test fixtures and build scripts; production dependencies
are pruned separately. Native serial bindings are unpacked for loading. The
build fails if required files, source bytes, displayed version or manifest do
not match. Seven archive tests exercise positive validation and rejection of
changed code, missing modules/bindings, extra files, tune data inside dependencies
and a wrong version.

On Windows, the package check runs the packaged executable in non-GUI runtime
mode with system Node and Node search/options variables excluded. It loads the
native serial binding without opening a port, edits a synthetic project, saves
and reopens its complete contents, checks the preserved original, and runs a
four-frame software rehearsal through the bundled shared modules. The resulting
`dist/package-verification.json` records the source commit, working-tree status,
archive hash and check results; CI retains it with the preview.

Existing builds are never overwritten. For another build, use
`npm run package -- --out dist/your-new-build-name`. To recheck one against current
source, run `npm run verify:package -- dist/your-new-build-name/DD84-Calibration-Studio-win32-x64`.
Runtime isolation on a development PC does not establish clean-machine,
Windows display-scaling, native-dialog or complete release acceptance.

The renderer has no Node integration, remote content, network access or granted device permissions. Narrow preload bridges support the three USB bench operations described below and saving a bounded DD84 JSON snapshot through a native file chooser. The renderer cannot choose a destination path or read arbitrary local files through the save bridge. The main process verifies the calling frame, limits saves to 32 MiB, stages a new sibling file, flushes and checks its bytes, and renames it into place. It never truncates or deletes the destination as a fallback. The offline CAN workspace uses a local module worker with no hardware API. Context isolation and sandboxing remain enabled; navigation, webviews, generic downloads and new windows are denied. See [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security).

`pretest`, `prestart` and `prepackage` stage the canonical Link wire decoder and
bench comparator into the ignored `link-shared/` directory. The package includes
these copies; it does not need the repository beside it. Edit the originals in
`products/dd84-link/shared/`, not generated copies. No extra runtime dependency
is added for the CAN test workspace.

## USB bench board — 0.11.0

Connect the FRDM-A-S32K344 running DD84 Bench 0.1.0, click **Find board**, select
its OpenSDA COM port, then **Test DD84 board**. The app checks the versioned
handshake and closes the port. Other serial applications must release the port.
The UI reports the result of that check, not a continuously connected session.

This uses the native `serialport` dependency through a narrow Electron preload
and main-process IPC API. Only NXP/PEmicro VID 1357 / PID 0089 ports are eligible;
there is no renderer API for arbitrary serial commands. Receive output is bounded
and handshake waits time out after five seconds. No PowerShell policy changes
are needed. Device identity is self-reported compatibility information, not
cryptographic authentication. Vehicle access remains unavailable.

Validation: 45 automated desktop tests passed; the production board transport
successfully queried the physical board on COM8. See the link firmware bench
README for hardware test scope and known limits.

## Internal CAN loopback — 0.12.0

With Bench 0.2.0 on the board and only USB attached, select **Find board**, then
**Test DD84 board**. A compatible handshake enables **Run internal CAN self-test**.
Studio displays the eight received frames, their fixed ID/payload and software
observation times. **Save test report** exports a clearly labeled local JSON copy.
Failure stays a failure and includes the firmware stage; no file is uploaded.

The internal test does not validate wiring, transceiver operation or vehicle
data. Reports remain ineligible for calibration learning. No real CAN capture
or ECU writing is enabled. Version 0.12.0 has 49 passing desktop tests; the new
hardware loopback and repeated restarts have been exercised on the USB board.

## Offline CAN test workspace — 0.13.0

1. In **CAN test workspace**, set 1–10000 frames and choose **Create test pattern**.
   Save its JSON. The pattern alternates standard/extended classic CAN frames at
   a declared 500 kbit/s, with a fresh random run tag. It is a test specification,
   not a PCAN-View import or a command that transmits anything.
2. Choose **Run software rehearsal** to exercise generation, decoding, comparison
   and reporting without hardware. It creates synthetic bytes with session 1.
   The label **Software rehearsal** remains on the result and in its saved report.
3. For an existing D84W binary capture, open its saved pattern, select the capture
   and enter its actual recording session as a decimal integer. Choose **Compare
   saved capture**. Imported captures are explicitly unverified sources, even if
   they contain synthetic bytes or claim a valid session.
4. Review expected/received/matched counts, issue totals (with at most 20 details),
   and a preview of at most 20 decoded frames. A byte match does not prove silent
   mode, correct wiring, bus timing or absence of hardware loss. Missing status
   is not interpreted as measured zero loss.
5. **Save comparison report** exports `DD84_STUDIO_BENCH_REVIEW_V1`, containing
   capture SHA-256, canonical-pattern SHA-256, session, results and limited preview.
   Keep the capture and pattern separately; report reopening is not implemented.
   Filenames may contain private information; review reports before sharing.

Captures are bounded to 16 MiB and saved patterns to 4 MiB. Imported patterns must
match the supported generated structure, including frame bytes and disabled
learning flags. Comparison runs in a cancellable worker. Changing the pattern,
frame count, session or capture clears the old result and cancels pending work;
start comparison again after the change. Closing the app discards this workspace's
unsaved pattern/results. Complete save dialogs before closing.

Bench 0.2.0 cannot record external CAN yet; its internal-loopback JSON is not a
D84W capture. This workspace neither opens a hardware connection nor feeds
calibration learning. External bench firmware/acceptance and controller-specific
calibration adapters remain separate milestones.
