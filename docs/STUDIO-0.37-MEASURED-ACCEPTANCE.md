# Studio 0.37 measured-case Windows acceptance

On November 20, 2026, the existing unsigned Windows 0.37.0 preview passed the
scoped measured-case checks below on Windows 11 Home, build 26300. This extends
[the calibration sample acceptance](STUDIO-0.37-ACCEPTANCE.md); it does not qualify
another executable or complete the final-release gates.

## Exact candidate

- Runtime source: `d0fd05220ac4f5db3487c1102d2946d79ceac5e8`. Subsequent acceptance
  documentation and test harness changes do not alter the application files.
- ZIP: `DD84-Calibration-Studio-0.37.0-Windows-x64-preview.zip`, 164,723,144 bytes.
- ZIP SHA-256: `10b5021b8cf43fa6f4c625e0fe265911639d15dafbcfa62ec57920bf8a158473`.
- `resources/app.asar` SHA-256:
  `cdcf4d8bd42ec669ac811798162600cbb6b9e92b2cb8d60b64ecb146ee084aa9`.

## Actual Windows UI checks

These actions used the existing executable and real Windows Open/Save dialogs,
without dialog mocks or renderer injection. Only generated synthetic fixtures
were opened. Project recovery remained off in the normal profile.

1. Opened a saved V2 measured case. Its stored RPM filter included two of three
   rows on each side. Earlier Spark values 10/20 and later values 12/16 produced
   a mean delta of -1 degree. No vehicle, power gain or tuning advice is implied.
2. Rechecked the earlier CSV under a different filename. Matching bytes and all
   saved statistics were recognized; the filename difference remained explicit.
3. Selected a deliberately changed CSV. The prior success was replaced by a
   fingerprint-mismatch message, and the stored measurements remained unchanged.
4. Edited only the observation note and chose **Update outcome notes**. The
   displayed measurements stayed intact; source-check state was reset.
5. Canceled the native case save. Cancellation was reported and the note remained
   open. Retried to a new file and verified the complete JSON against the expected
   case, including filters, measurements, sources, assessment and capability flags.
6. Compared the saved original with the revised case. Exactly one changed item
   described the observation note. Saved the comparison through the native dialog;
   all changes and both complete snapshots matched the independently prepared
   comparison. The original reference remained unchanged.
7. Reopened the saved revision through the native Open dialog, then saved to a
   separate name. The two case files were byte-identical. Closed normally after
   saving; no Studio test window remained.

Evidence is local in `c/outputs/native-cases-2026-11-20/`: `prepare.mjs`,
`verify.mjs`, `file-verification.json`, synthetic inputs and saved outputs.

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| `reference.json` | 8,834 | `bec3171846db562efb436f515e11074da31d25d418a7ef70abc6fe762c6a09ec` |
| `current.json` and `reopened.json` | 8,849 each | `a3c2b9df122561b7099ec53de27e8313ca66c4188a0587ce30477a6ee8f37877` |
| `comparison.json` | 20,957 | `aedb067361fe725c0a1c53c5bb0196cfdf858a4133ee58bbba2b02c6cc1dd133` |

## Repeatable packaged-app coverage

`scripts/test-native-cases.mjs` extends the existing Windows packaged-app harness.
It builds a measured case through the CSV import UI, applies source-bound filters,
checks that pending measurements cannot reach native save, exercises cancellation,
and verifies actual files written through preload IPC. It also checks renamed and
wrong sources, note-only revisions, complete comparison export, invalid-reference
preservation, reopening and byte-identical resaving. Windows CI retains the
synthetic saved JSONs, comparison screenshot and candidate-specific proof.

The extended harness passed locally against the ASAR above on November 20, with
zero renderer errors. The existing recovery, forced-exit/restore, single-instance,
minimum-window and app-zoom checks passed in that run too. The harness uses a
separate profile and controls native destination selection; its results are
separate from the actual Windows dialogs tested above. `automated-native-proof.json`
and `automated-comparison.png` retain the local result.

## Still pending

Clean-machine first launch, full keyboard and OS scaling coverage, the remaining
workspace-specific native checks, signing and distribution remain open in the
[Windows release handoff](WINDOWS-RELEASE-HANDOFF.md). No runtime changes or new
ZIP were required by this pass. Native HPT/Holley writing, automatic learning and
vehicle flashing remain unavailable. These tests use no customer files or hardware.
