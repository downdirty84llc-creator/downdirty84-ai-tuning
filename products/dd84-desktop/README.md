# DD84 Calibration Studio — Windows preview

This Windows x64 desktop workbench runs offline. Preview 0.2 adds read-only HPT file-pair cases alongside the simulation table editor.

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
