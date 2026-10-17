# Windows preview release acceptance

Current implementation: **0.19.0**. Updated: **2026-10-16**. Status: **development preview; comprehensive release acceptance incomplete**.

This record distinguishes tests of the current source from historical native checks. A historical pass is not a claim that every workflow was retested in the latest executable. Customer files and machine-specific evidence paths stay outside the repository.

## Evidence already recorded

| Scope | Result | Boundary |
|---|---|---|
| Desktop automated suite, 0.19.0 | 100 tests passed | Atomic curve/map range operations, stale/forged previews, signed/zero values, full 4,096-cell table, fixed axes, originals and read-only protection |
| Browser workflow, 0.19.0 | Curve percent, map add/set, preview invalidation, whole-range rejection, one-step undo, labeled real-draft ranges and simulation save/reopen passed | Synthetic fixtures; both saved project types exactly match independently assembled expected values; fresh-origin stylesheet verified |
| Desktop dependency audit, 0.19.0 | No reported vulnerabilities | Audit result at check time |
| Native Windows UI, 0.19.0 | Core draft workflow passed: native import, labeled range preview/apply, one-step Undo, note rejection, save cancellation/retry, save/reopen, original backup, review export, overwrite cancellation and default keep-editing close guard | Candidate `1ade437`; synthetic fixtures on Windows 11 Home build 26300; saved project/backup/review contents verified. Read-only coefficient controls stay protected. Clean-machine and remaining full-workflow acceptance are still incomplete |
| Native comparison and log review, 0.19.0 | Draft comparison export, CSV quality flags, required channel-selection evidence, full-log save/reopen, renamed-source round-trip, changed-source rejection and narrow segment export passed | Same candidate and development machine; synthetic data only. Complete saved reports checked against expected objects, with independently specified changes/counts/ranges. A rejected review preserved the current note and unselected roles |
| Native timeline and segment review, 0.19.0 | Narrow, equal-time, missing-only and empty ranges; invalid-range rejection; full reset; channel switching; note clearing; segment save/reopen; mismatched/unsupported report rejection passed | Same candidate and synthetic CSV; 12 observed UI checks, 3 complete native output comparisons and unchanged archive/ASAR identity. Initial, reopened and post-rejection segment reports are byte-identical. Clean-machine and remaining workflow acceptance are still incomplete |
| Desktop automated suite, 0.18.0 | 91 tests passed | Complete coefficient/boundary imports, displayed precision agreement, categorical axes, source-bound identity, malformed input, merge preservation and comparison exclusion |
| Browser workflow, 0.18.0 | Import/merge, read-only coefficient display, labeled boundary edit/undo, note clearing, identity mismatch rejection, source verification, save/reopen and comparison export passed | Saved project/report exactly match independently assembled drafts; native Windows acceptance remains pending |
| Local capture validation, 0.18.0 | 2,334 values matched 27 raw table captures; 3 identity captures checked; 720 coefficient differences checked against independent vendor export | Source hashes unchanged; coefficients remain read-only; no physical scaling or performance validation |
| Desktop dependency audit, 0.18.0 | No reported vulnerabilities | Audit result at check time |
| Native Windows UI, 0.18.0 | Partial: launch, native project open, labeled edit/undo, empty-note rejection and save-dialog cancellation passed | Isolated synthetic fixtures on Windows 11 Home build 26300; Windows Update prompt interrupted save/reopen. Existing development machine, not clean-machine acceptance |
| Desktop automated suite, 0.17.0 | 85 tests passed | Remaining spark stages and cooling imports; evidence, source, units, zones, dimensions, malformed input and draft round-trips |
| Browser workflow, 0.17.0 | Cooling import, spark merge, ten-table comparison, edit/undo, note clearing, project save/reopen and report export passed | A blocking browser discard dialog required native dismissal; native Studio UI acceptance remains pending |
| Local captured-table validation, 0.17.0 | 15 spark and 6 cooling captures checked; 6,816 cell differences checked against independent vendor exports | Displayed precision with explicit rounding tolerances; source tune hashes unchanged; no performance validation |
| Desktop dependency audit, 0.17.0 | No reported vulnerabilities | Audit result at check time |
| Native Windows UI, 0.17.0 | Pending | Browser checks do not establish native-dialog or clean-machine acceptance |
| Desktop automated suite, 0.16.0 | 81 tests passed | Added stage comparison, missing/incompatible coverage, identity conflicts, typed changes and report snapshot binding |
| Browser comparison workflow, 0.16.0 | Load reference, 140-change display, missing-table display, required note, export, live edits, note clearing, undo and clear passed | Downloaded full report exactly matched independently generated result; no native tune writing |
| Local captured-table validation, 0.16.0 | Nine additional stage tables imported; 5,544 cell differences checked against independent VCM exports | Final minimum-spark capture absent; left missing. Native source hashes unchanged |
| Desktop dependency audit, 0.16.0 | No reported vulnerabilities | Audit result at check time |
| Native Windows UI, 0.16.0 | Pending | Browser checks do not establish native-dialog or clean-machine acceptance |
| Desktop automated suite, 0.15.0 | 74 tests passed | Real draft types, provenance, malformed inputs, source verification, merging and read-only unknown definitions |
| Browser real draft workflow, 0.15.0 | Source match/mismatch, edit/undo, required note, save/reopen, complete map display, import/merge and mixed-source rejection passed | Captured local exports; no native tune output or controller validation |
| Local actual-export validation, 0.15.0 | Five prepared drafts; all five source fingerprints matched | Three Sierra stages and two read-only Holley candidates; sources unchanged and excluded from distribution |
| Native Windows UI, 0.15.0 | Pending | Browser tests do not establish native dialog or clean-machine acceptance |
| Desktop automated suite, 0.14.0 | 64 tests passed | All five parameter shapes, V1 migration, units/bounds, unknown read-only paths, dimensions, original fingerprints and review snapshots |
| Browser editor workflow, 0.14.0 | Six-parameter editing, switch undo, review-note gate, save/reopen, legacy migration, search and unknown read-only display passed | Synthetic only; project, backup and review downloads exactly matched independent expected values |
| Desktop dependency audit, 0.14.0 | No reported vulnerabilities | Audit result at check time |
| Native Windows UI, 0.14.0 | Pending | Browser validation does not establish native dialogs or clean-machine acceptance |
| Desktop automated suite, 0.13.0 | 55 tests passed | Includes pattern validation, import limits, source-bound reports and disabled hardware/learning claims |
| Link automated suite, 0.13.0 source | 16 tests passed | Portable decoder cross-checked against 10,000 C-encoded records and golden fixture |
| Browser workflow, 0.13.0 | 1,000-frame rehearsal, plan save/reopen, import comparison, wrong-session/corruption rejection and clearing stale results passed | Synthetic fixtures only; downloaded rehearsal report exactly matched independent calculation |
| Desktop dependency audit, 0.13.0 | No reported vulnerabilities | Audit result at check time, not a guarantee |
| Packaged worker, 0.13.0 | 1,000-frame rehearsal passed in Electron 44.4.5 from packaged ASAR modules | Hidden integration harness with sandbox, context isolation, no Node integration, local file origin and restrictive CSP; no hardware opened |
| Native Windows UI, 0.13.0 | Pending | Browser and worker checks do not establish native save-dialog acceptance or clean-machine release acceptance |
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

## Native 0.19 candidate record

The tested portable candidate was built from `1ade4379c6b87ebb2ca5221522454f93df31e798`.
Its archive SHA-256 is `d691506a87c102ef5962b8c5a462007d205957a14eb935af8790cf722aaa5818`;
its packaged `app.asar` SHA-256 is `5daad033ffa80e212593c70f35998e0ffa7a54939a0106c442afa23ad3fff827`.
Testing on 2026-10-16 used a synthetic exported-value draft with eight editable labeled boundary values and four read-only unknown coefficients. A 2×2 range received +100 rpm as one transaction. Saving, undoing and reopening preserved the expected originals, edits, axes and evidence. Native backup and review exports matched complete expected JSON objects. Declining an overwrite preserved both backup content and modification time. The default close choice kept the app open.

The 0.18 test interrupted by Windows Update remains a historical partial result; these results belong to the separate 0.19 candidate. No product code changed during this acceptance pass, and no replacement archive was generated. The machine already has development tools installed. Do not treat this as clean-machine or comprehensive release acceptance.

The follow-up native review pass on 2026-10-16 used the same ASAR hash. Comparing the saved four-cell edit against its original produced the expected four +100 rpm differences; the unknown coefficient parameter remained not comparable. The saved report preserved both draft snapshots and matched the complete expected report.

A six-row synthetic CSV contained two RPM candidates, one missing RPM value, one nonnumeric RPM value, a duplicate timestamp, a text channel and an unsupported airflow unit. Selection remained explicit, and saving a selected channel without an explanation was rejected. The full-log export preserved the chosen channel and explanation, counts, flags and source fingerprint. Reopening worked with matching contents and with an identical renamed CSV; the resaved report changed only the source filename. Changing one RPM sample from 800 to 801 caused the old review to be rejected. A subsequent save verified that the current note and unselected roles survived the failed restore.

The inclusive 2–3 second segment contained two numeric readings (1,200–1,600 rpm) and one nonnumeric reading. Its native export matched the complete expected range, note, counts and fingerprint. The subsequent timeline pass below completed the corresponding range and segment checklist steps. These checks did not exercise a board or vehicle, and did not change product code or the archive.

The native timeline pass on 2026-10-16 used the altered six-row synthetic CSV. Equal-time bounds at 1 second showed one missing cell and no numeric readings; equal-time bounds at 2 seconds retained both the numeric and nonnumeric rows at that timestamp. The empty 1.1–1.9 second window showed zero readings with no numeric chart. Reversed 2–1.9 second bounds and out-of-recording 2–5 second bounds were rejected with segment saving disabled. The full-recording interval list preserved the missing 1–2 second interval without numeric extrema. Switching to the second RPM channel retained 0–4 second bounds and showed all six numeric readings.

Full reset, channel switching and manual range editing cleared the segment note; changing range inputs also invalidated the displayed segment until applied. Reopening a saved segment restored channel 1, inclusive 2–3 second bounds and its exact note after fingerprint verification. A segment tied to the original CSV and a full-log report presented as a segment were both rejected without changing the active segment or its note. The full-log association note also remained present in the observed UI. The initial segment, resaved reopened segment and resaved post-rejection segment each matched a complete expected JSON object independently assembled from the synthetic rows; all three files were byte-identical. Twelve observed UI checks, three output comparisons and the unchanged candidate hashes passed. This was an acceptance/documentation pass only; no automated product suite rerun or new package is implied.

## Next milestone: candidate acceptance on Windows

Use one identified candidate build and synthetic fixtures. Record its commit, displayed version, archive SHA-256, Windows version, tester, date and each result. Do not overwrite another version's evidence. Keep files in a dedicated local test folder.

- [ ] Extract and launch the candidate on a clean supported Windows x64 environment without Node installed. Record OS/build and any launch/security failure; do not bypass warnings.
- [ ] Create a sample project, export original, edit, undo, reset, save and reopen. Confirm original data is preserved and review-note requirements work.
- [ ] Import synthetic original/final HPT evidence, save/reopen the case and verify a changed source is rejected. Header acceptance alone must not claim a valid controller calibration.
- [ ] Save/reopen a synthetic learning case. Change a tune fingerprint and verify obsolete log associations clear; readiness remains blocked.
- [ ] Import synthetic detailed comparison evidence. Verify unknown direction, required direction evidence, names-only rejection and saved report contents.
- [x] Import a synthetic CSV containing numeric, missing and text values. Review duplicate role candidates, evidence requirements and unsupported roles. Confirm the saved full-log report exactly preserves documented choices and notes. Passed 2026-10-16 on candidate `1ade437`.
- [x] Reopen that full-log review with matching, renamed and altered CSV contents. Verify altered contents are rejected without losing current choices. Passed 2026-10-16 on candidate `1ade437`; the altered-source test preserved an intentional unselected mapping and current note.
- [x] Apply a narrow range, equal-time bounds, empty window and full-recording reset. Switch channels; verify counts, missing intervals and bounds. Reject reversed/out-of-recording bounds. Passed 2026-10-16 on candidate `1ade437` with missing-only and duplicate-time cases included.
- [x] Save/reopen a noted segment and compare JSON. Verify channel/range changes clear the note, unsupported reports fail and failures preserve the current view. Passed 2026-10-16 on candidate `1ade437`; native reports before reopening, after reopening and after both rejected imports were byte-identical and matched independent expected JSON.
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
