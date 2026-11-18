# Studio 0.37.0 acceptance — 2026-11-18

This pass exercises the real Windows file pickers and close prompt on the existing
development computer. It advances the release acceptance checklist; it does not
certify a clean installation or every workspace. No application code changed and
no replacement download was produced.

## Identified candidate

- Source commit: `d0fd05220ac4f5db3487c1102d2946d79ceac5e8`, clean when packaged.
- ZIP: `DD84-Calibration-Studio-0.37.0-Windows-x64-preview.zip`, 164,723,144 bytes.
- ZIP SHA-256: `10b5021b8cf43fa6f4c625e0fe265911639d15dafbcfa62ec57920bf8a158473`.
- ASAR SHA-256: `cdcf4d8bd42ec669ac811798162600cbb6b9e92b2cb8d60b64ecb146ee084aa9`.
- Windows 11 Home, version/build `10.0.26300` / `26300`.
- Operator: Codex using Computer Use against native Windows UI. No save-dialog
  mock, renderer injection or automated destination override was used in this pass.
- All inputs and outputs were synthetic and local. No customer files, accounts,
  uploads or hardware were used. Recovery remained off in the normal app profile.

## Observed native workflow

1. Opened the identified executable and inspected the existing DD84 green branding,
   Home, workspace navigation and displayed version 0.37.0.
2. Created the built-in sample and changed its first MAF value from 10 to 12 g/s.
   The original stayed 10 and the displayed change was +2 / 20%. This is a synthetic
   input for testing, not a vehicle calibration recommendation. Tab advanced to
   the next 25 g/s cell with visible focus.
3. Opened the native Save dialog, entered a disposable filename and canceled with
   Escape. Studio reported cancellation, retained the edit and its unsaved state,
   and no file appeared at the selected path.
4. Retried to a different filename. Studio reported a verified save and cleared
   the project warning. The entire saved project matched the expected sample
   with exactly one working-value edit; originals and all other fields matched.
5. Attempted to export the original backup to that disposable saved-project path.
   Windows displayed its overwrite warning. Choosing **No** retained the existing
   file's SHA-256 and modification timestamp. A subsequent backup save to a new
   filename contained the complete untouched sample.
6. Entered a synthetic review note; Studio marked it unsaved. Alt+F4 opened
   **Close with unsaved work?**, with **Keep editing** selected. Enter kept the app
   open and restored visible focus to the intact note. Tab continued to Save.
7. Exported the review through the native picker. Its complete expected JSON
   matched, including the original fingerprint, one changed item, coordinates,
   units, delta, multiplier, note and full project snapshot. The timestamp fell
   within the observed export-action interval. The saved-work warning cleared.
8. Reopened the saved project through the Windows Open dialog. The edit remained,
   the review note was empty and Undo was disabled. Saving to another filename
   produced a byte-identical project. Alt+F4 then closed the fully saved session
   without an unsaved-work prompt.

## Output verification

Four complete JSON outputs were compared against independently assembled expected
contents. Both project copies were also byte-identical. The canceled destination
was absent. The original saved project's hash and timestamp remained unchanged
after overwrite rejection. ZIP and ASAR hashes remained unchanged after the pass.

| Synthetic output | Bytes | SHA-256 |
|---|---:|---|
| Edited project and reopened/resaved project | 2,158 each | `8d3c512e31b868d03445b4f89d11b9db93d36da87d41d6627ed0be887cf52ae1` |
| Original backup | 2,158 | `7fadae73328fd77abec6d58917b1ec602a91fbbda3f1a87344e6d8be4f18c859` |
| Review draft | 3,234 | `3f4184ff09ccdf29f32a97e636c18f94f12843aa5d7192d8d0f1d70507bf45f3` |

Machine-readable proof, the verification script and synthetic outputs are retained
locally outside the repository in the `studio-037-native-2026-11-18` evidence folder.

## Earlier automated acceptance

The release's 2026-11-16 results remain scoped to their recorded runs:

- 271 desktop tests, 69 browser/workspace checks and the production build passed.
- 235 backend tests and real-PostgreSQL/end-to-end checks passed in CI.
- The desktop dependency audit reported zero vulnerabilities at check time.
- Packaging verified 75 application files against source; 86 ZIP files matched
  their packaged counterparts. Bundled runtime checks ran without system Node
  on PATH and did not access hardware.
- The packaged GUI test verified incremental recovery after forced process-tree
  termination, single-instance behavior, complete saves, byte-identical project
  resave, minimum 700×550 window and 100/125/150/200% app zoom. That automation
  controlled native destination selection; today's picker observations are separate.
- [PR CI](https://github.com/downdirty84llc-creator/downdirty84-ai-tuning/actions/runs/43902476392),
  [Windows CI](https://github.com/downdirty84llc-creator/downdirty84-ai-tuning/actions/runs/43902476206)
  and [merged-source CI](https://github.com/downdirty84llc-creator/downdirty84-ai-tuning/actions/runs/43902822971)
  succeeded. This document does not imply a fresh run of those suites on November 18.

## Remaining gates

This computer has development tools installed. Clean-machine extraction/first
launch, OS display scaling, comprehensive keyboard-only use and native acceptance
of every workspace remain incomplete. No signing, installer, updater, native
HPT/Holley writing, native HPL decoding, automatic learning or vehicle flashing
is established by these checks. Recovery after drive failure or arbitrary power
loss is not guaranteed. Follow [the release handoff](WINDOWS-RELEASE-HANDOFF.md)
for the next gate without repeating already-qualified observations.
