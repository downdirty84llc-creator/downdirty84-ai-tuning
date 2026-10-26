# Studio 0.28.0 preview acceptance — 2026-10-26

This records the checks completed for the branded workspace and troubleshooting release. It is not a claim that every controller, file format or vehicle operation is supported.

## Exact Windows artifact

- Source commit: `11bc984f71db0ca3319bafdacd22eca2c1698608`, clean at packaging.
- Package: `DD84-Calibration-Studio-0.28.0-Windows-x64-preview.zip` (159,197,624 bytes).
- ZIP SHA-256: `d95d340c5bdc7bd7f60f9a04a1a74b7ec58b3747cb6fa19b6fbb4d132ecb5fa1`.
- Application ASAR SHA-256: `b6c562a29b8a4a1240efe087bf82bee87c958dc6b26066096faa6a4fd0e1dac1`.
- All 60 application files match source. All 75 ZIP entries match the verified package and verification report. The package allowlist excludes customer tunes, logs, environment files and tests.
- Electron 44.9.3; Windows x64 native serial binding loaded successfully. Runtime smoke checks passed with system Node removed from PATH. No hardware was accessed.
- Portable, unsigned preview. A separate clean-machine acceptance run and signed installer remain outstanding.

## Native Windows observations

The actual packaged executable was opened on the development computer. The existing DD84 logo, green theme, version badge and workspace navigation were inspected. Home and Troubleshooting navigation worked.

A synthetic troubleshooting case was opened through the Windows file picker. Canceling its native Save dialog left the case open and reported that no file was written. Saving to a new JSON file then displayed verified-save feedback. The original and saved files matched byte for byte (2,384 bytes; SHA-256 `67603d3ab6799200ceabeb7a435a8d41cb0b6109f69957105b667272e543f833`). Reopening that saved file through the native picker restored its case reference, vehicle, symptom and unresolved supply concern, with an explicit recalculated-assessment message. The app was left on Home.

These native observations cover the new case workflow. They do not constitute a fresh native walkthrough of every older workspace. Local screenshots, synthetic fixtures and machine-readable reports are retained outside the repository in the `studio-028-brand` acceptance output folder.

## Automated validation

- 207 desktop tests; 148 backend tests; frontend/backend typechecks and builds passed.
- 12 synthetic browser workflow groups passed, with no JavaScript runtime errors. Coverage includes navigation preserving edits, full-object saved-case round trips, malformed input preserving current work, untrusted assessment recomputation, inline replacement cancellation, mobile/small-window layout, stale job responses, duplicate submissions, retryable failures, analysis status and sign-in form submission.
- Eight audit-reporter tests and dependency audits passed. The reporter now runs on Windows through npm's JavaScript entry point.
- Package runtime checks saved and reopened an edited project while preserving its original and recomputed saved learning evidence and comparisons.
- [CI run 40328926379](https://github.com/downdirty84llc-creator/downdirty84-ai-tuning/actions/runs/40328926379) passed, including real Postgres migrations, API integration, ownership/job-association regressions, browser tests, C firmware guards and capture tests. The development computer lacks a C compiler; the C checks were validated on Linux CI.
- [Windows run 40328926388](https://github.com/downdirty84llc-creator/downdirty84-ai-tuning/actions/runs/40328926388) passed.

## Scope retained

Ten troubleshooting workflows use manufacturer references and a documented qualitative community sample. See [research and access limitations](TUNING-PROBLEM-RESEARCH-2026-10-26.md). Checklist results are operator statements for human review; they are not automatic diagnosis, training data or permission to change calibration values. Cases save locally and are not automatically attached to customer jobs.

Native HPT/Holley writing, native HPL decoding, autonomous tuning and vehicle flashing remain unavailable without validated definitions and the applicable bench acceptance. Simulation-only and owner-release controls remain enforced. No customer source files or vehicle/device state were changed during this acceptance.
