# Windows release handoff

Studio 0.37 is available as an unsigned per-user installer and portable ZIP.
The [installer acceptance](STUDIO-0.37-INSTALLER-ACCEPTANCE.md) records exact
distribution hashes and automated install/reinstall/removal results.
The calibration sample's native
save/cancel/overwrite/reopen and keep-editing paths have passed on the development
PC. [Exact artifact and evidence](STUDIO-0.37-ACCEPTANCE.md).
Measured-case source rechecks, note-only revisions, comparison export and native
save/reopen also passed on this candidate on November 20:
[measured-case acceptance](STUDIO-0.37-MEASURED-ACCEPTANCE.md).
November 21 expanded installed-app workflow checks and verified a keyboard
sample edit with real save/reopen dialogs at 200% Windows display scale:
[workflow acceptance](STUDIO-0.37-WORKFLOW-ACCEPTANCE.md).

## Next test: a clean Windows 11 x64 environment

Use a computer or new Windows guest that has not run Studio and has no development
tools. The owner has no second PC; the prepared
[one-computer VM route](WINDOWS-CLEAN-TEST.md) has not been installed or run.
Do not install Node or other development tools to make the test pass.
The existing PC's Windows 11 Home build 26300 is the only OS/build qualified by
the recorded manual pass; broader supported-OS claims remain pending.

1. Transfer the Setup executable or portable ZIP and its companion `.sha256`.
   Match the exact filename and hash in the installer acceptance document.
   Preserve the earlier qualified ZIP separately; the new ZIP has identical
   program bytes but a new archive layout/hash and omits a diagnostic log.
2. For Setup, close Studio, install for the current account and launch from the
   **DD84 Calibration Studio** Start menu shortcut. For ZIP, use **Extract All**
   to a new folder, keep companion files together and open
   `DD84-Calibration-Studio.exe`. Do not launch directly inside the ZIP.
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
7. Record the Windows edition/build, display scale, artifact hash, displayed version,
   launch result, saved filenames and any failure. A successful launch alone does
   not complete the entire workflow checklist. For Setup, also reinstall the same
   candidate, reopen saved work, then uninstall through Windows Settings. Confirm
   the shortcut is removed and the saved project/review files remain usable with
   the portable copy. Test only disposable synthetic work.

Only use synthetic files for acceptance. Keep this test's folder separate from
customer files. A support report needs the exact error, workspace and file type;
do not upload customer tunes or logs automatically.

## Remaining release work

| Gate | Current position | Evidence required to close it |
|---|---|---|
| Calibration sample native file workflow | Passed on the identified development-PC candidate | Retain its exact hashes; rerun affected paths after application changes |
| Measured-case native file workflow | Scoped source rechecks, note editing, case/comparison saves and byte-identical reopening passed | Retain candidate and output hashes; automated Windows coverage now repeats these paths |
| Clean-machine first launch and workflow | Not completed | Separate Windows environment, no development dependency installation, recorded extraction/launch/save/reopen results |
| Accessibility and display coverage | Scoped keyboard sample editing and native save/reopen at 200% OS scale, plus automated app zoom checks passed | Full keyboard-only workflows and additional Windows display configurations |
| Every workspace on the final candidate | Expanded installed-app save/reopen checks passed for file pairs, CSV logs/segments, learning records, exported-value drafts and software bench reports | Remaining human native-dialog workflows, including learning measurements, and clean-environment checks |
| Signing and distribution | Unsigned installer plus ZIP; explicit [signing integration prepared](WINDOWS-SIGNING.md), no account/certificate yet | Recurring-cost approval, owner identity validation, actual public signing and signed-candidate acceptance |
| Installer lifecycle | Installed bytes, Start menu, launch, running-app refusal, same-version reinstall and removal passed locally | Repeat interactive installation/removal in clean Windows; test a real cross-version migration when a newer runtime exists |
| Updating | Manual installer updates; no automatic updater | Version-to-version migration and recovery acceptance before promising unattended updates |
| Controller support | Only defined simulation and supported exported-value drafts are editable | Validated controller/OS definitions, authorized format access, full round-trip/checksum tests and original preservation |
| Physical vehicle writes | Unavailable | Controller-specific bench communication plus interrupted-write/recovery validation before vehicle use |

Keep version-specific notes and hashes with each candidate. A new build must not
inherit an older executable's manual acceptance merely because its version label
is unchanged. Signing or passing a desktop UI test does not enable native tune
writing or automatic learning.
