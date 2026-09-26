# Windows preview release acceptance

Current implementation: **0.10.1**. Updated: **2026-09-26**. Status: **development preview; comprehensive release acceptance incomplete**.

This record distinguishes tests of the current source from historical native checks. A historical pass is not a claim that every workflow was retested in the latest executable. Customer files and machine-specific evidence paths stay outside the repository.

## Evidence already recorded

| Scope | Result | Boundary |
|---|---|---|
| Desktop automated suite, 0.10.1 | 40 tests passed | Parsers, validation, model/report behavior and regression coverage; not a native UI test |
| Full-log save race, 0.10.1 | Regression reproduced before fix, passed afterward | Selections copied before asynchronous hashing |
| Browser workflow, 0.10.1 | Delayed hashing plus note edit/CSV reload canceled stale saves; subsequent save kept current note | Controlled browser check, not native race reproduction |
| Packaged 0.10.1 source/version | Verified against build source | Unsigned local portable preview |
| Native Windows 0.10.1 | Synthetic CSV import and full-log save passed; saved JSON exactly matched verified baseline | Blank calibration association and no selected roles; source hash, statistics, candidates and disabled-learning flags matched |
| Native Windows 0.10 | Segment reopen and resave passed with exact JSON equality | Synthetic RPM, inclusive 2–3 second bounds and exact note |
| Native Windows 0.9 | Required-note gating, segment save and channel-change note clearing passed | Synthetic full-recording segment |
| Native Windows 0.8 | Range controls, channel switching, reset and full-review save/reopen passed | Synthetic data; saved full-recording report matched browser baseline |
| Native Windows 0.7 | Timeline gaps, channel switching and review restore/save passed | Synthetic RPM/temperature; saved review matched source fixture |
| Native Windows 0.6 | Review import/restore/save passed | Synthetic saved-review workflow |
| Native Windows 0.3 | Sample editing, undo and save smoke checks passed | Simulation editor only |

The 0.10.1 implementation head had successful main CI and Windows packaging checks before this documentation revision. Future commits must use their own check results; this statement does not pre-approve a later build.

## Next milestone: candidate acceptance on Windows

Use one identified candidate build and synthetic fixtures. Record its commit, displayed version, archive SHA-256, Windows version, tester, date and each result. Do not overwrite another version's evidence. Keep files in a dedicated local test folder.

- [ ] Extract and launch the candidate on a clean supported Windows x64 environment without Node installed. Record OS/build and any launch/security failure; do not bypass warnings.
- [ ] Create a sample project, export original, edit, undo, reset, save and reopen. Confirm original data is preserved and review-note requirements work.
- [ ] Import synthetic original/final HPT evidence, save/reopen the case and verify a changed source is rejected. Header acceptance alone must not claim a valid controller calibration.
- [ ] Save/reopen a synthetic learning case. Change a tune fingerprint and verify obsolete log associations clear; readiness remains blocked.
- [ ] Import synthetic detailed comparison evidence. Verify unknown direction, required direction evidence, names-only rejection and saved report contents.
- [ ] Import a synthetic CSV containing numeric, missing and text values. Review duplicate role candidates, evidence requirements and unsupported roles. Confirm the saved full-log report exactly preserves documented choices and notes.
- [ ] Reopen that full-log review with matching, renamed and altered CSV contents. Verify altered contents are rejected without losing current choices.
- [ ] Apply a narrow range, equal-time bounds, empty window and full-recording reset. Switch channels; verify counts, missing intervals and bounds. Reject reversed/out-of-recording bounds.
- [ ] Save/reopen a noted segment and compare JSON. Verify channel/range changes clear the note, unsupported reports fail and failures preserve the current view.
- [ ] Cancel a native save dialog, retry with a new filename, and verify the successful output on disk. Exercise overwrite cancellation using disposable synthetic files only. Confirm closing with unsaved work defaults to keeping the app open.
- [ ] Check keyboard-only import/edit/save navigation, focus visibility, minimum window size and Windows display scaling. Record any clipped or unreachable controls.
- [ ] Rerun desktop tests, dependency audit, main CI and Windows packaging for the candidate commit. Inspect the package for unexpected customer/source data and verify packaged source/version.

Mark steps only after execution; retain expected/actual results. Deliberately delayed asynchronous race checks should continue in automated/browser tests, where timing can be controlled reliably.

## Separate public distribution gate

- [ ] Decide and document supported Windows versions and support/issue-reporting route.
- [ ] Choose a signing/distribution approach and resolve any cost or account requirements before purchase or enrollment.
- [ ] Produce a signed release and validate download, extraction/install, launch and removal on clean supported environments.
- [ ] Publish version-specific release notes, checksum and exact limitations after candidate acceptance and owner release approval.

A signed installer/updater, controller adapters, adaptive learning and physical ECU writes are separate capabilities, not implied by completing the preview checks. The authoritative DD84 LINK handoff still requires controller-specific bench interruption/recovery validation before real writes.
