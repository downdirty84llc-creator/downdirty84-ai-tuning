# Windows release handoff

Studio 0.37 is a portable, unsigned preview. The calibration sample's native
save/cancel/overwrite/reopen and keep-editing paths have passed on the development
PC. [Exact artifact and evidence](STUDIO-0.37-ACCEPTANCE.md).
Measured-case source rechecks, note-only revisions, comparison export and native
save/reopen also passed on this candidate on November 20:
[measured-case acceptance](STUDIO-0.37-MEASURED-ACCEPTANCE.md).

## Next test: a separate Windows 11 x64 computer

Use a computer that has not run Studio and does not have its development tools
installed. Do not install Node or other development tools to make the test pass.
The existing PC's Windows 11 Home build 26300 is the only OS/build qualified by
the recorded manual pass; broader supported-OS claims remain pending.

1. Transfer the exact `DD84-Calibration-Studio-0.37.0-Windows-x64-preview.zip`
   and its companion `.sha256` file. Confirm the ZIP SHA-256 is
   `10b5021b8cf43fa6f4c625e0fe265911639d15dafbcfa62ec57920bf8a158473`.
2. Use **Extract All** to a new folder. Keep all extracted companion files together.
   Open `DD84-Calibration-Studio.exe` from that folder.
3. If Windows blocks launch, stop and record the exact message. Do not disable
   protections or bypass a warning to mark the launch test as passed. Signing is
   a separate unresolved distribution gate.
4. Confirm the DD84 logo, green theme and preview version 0.37.0. Open
   **Calibration projects → New sample project**. Change the first MAF value
   from 10 to 12, then Tab away; verify the original remains 10.
5. Choose **Save → Save project copy**, select a new disposable filename, then
   cancel. Confirm the edit stays open. Retry and save to a new test folder.
   Reopen the saved file and confirm 12 remains, original 10 remains, and Undo
   starts empty. These numbers are synthetic test inputs only.
6. Enter a review note and try closing. Choose **Keep editing** and confirm the
   note remains. Save the review separately, then close normally.
7. Record the Windows edition/build, display scale, ZIP hash, displayed version,
   launch result, saved filenames and any failure. A successful launch alone does
   not complete the entire workflow checklist.

Only use synthetic files for acceptance. Keep this test's folder separate from
customer files. A support report needs the exact error, workspace and file type;
do not upload customer tunes or logs automatically.

## Remaining release work

| Gate | Current position | Evidence required to close it |
|---|---|---|
| Calibration sample native file workflow | Passed on the identified development-PC candidate | Retain its exact hashes; rerun affected paths after application changes |
| Measured-case native file workflow | Scoped source rechecks, note editing, case/comparison saves and byte-identical reopening passed | Retain candidate and output hashes; automated Windows coverage now repeats these paths |
| Clean-machine first launch and workflow | Not completed | Separate Windows environment, no development dependency installation, recorded extraction/launch/save/reopen results |
| Accessibility and display coverage | Scoped keyboard focus and app zoom checks passed | Full keyboard-only workflows and Windows display scaling on declared supported configurations |
| Every workspace on the final candidate | Automated coverage and scoped historical native passes | Exact-candidate native import/save/reopen checks for the remaining workflows |
| Signing and distribution | Unsigned portable preview only | Owner-selected signing/distribution method, any required account/purchase approval, signed artifact and verified first launch |
| Installer/updater | Not implemented or accepted | Agreed delivery approach, install/update/removal acceptance without losing saved work |
| Controller support | Only defined simulation and supported exported-value drafts are editable | Validated controller/OS definitions, authorized format access, full round-trip/checksum tests and original preservation |
| Physical vehicle writes | Unavailable | Controller-specific bench communication plus interrupted-write/recovery validation before vehicle use |

Keep version-specific notes and hashes with each candidate. A new build must not
inherit an older executable's manual acceptance merely because its version label
is unchanged. Signing or passing a desktop UI test does not enable native tune
writing or automatic learning.
