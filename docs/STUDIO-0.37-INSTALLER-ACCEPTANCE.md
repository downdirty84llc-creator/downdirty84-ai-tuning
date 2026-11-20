# Studio 0.37 Windows distribution acceptance

On November 20, 2026, the branded per-user installer and portable ZIP passed the
checks below on the existing Windows 11 Home development PC, build 26300. This
adds the requested installer alongside the portable edition. It is not a final
release or a separate-computer acceptance pass.

## Exact local candidate

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| `DD84-Calibration-Studio-0.37.0-Windows-x64-preview-Setup.exe` | 110,928,072 | `e8c99491b434d9cdfc201ce4c2772c3421f72f2980a800e9df8e2c1bc6be1bff` |
| `DD84-Calibration-Studio-0.37.0-Windows-x64-preview.zip` | 154,937,674 | `730ec6c669ce992bb62719c46e5810ac896bbda740b90525ac4f6ee8be49fa6b` |

Both artifacts contain the same 86 program files. Application ASAR SHA-256 remains
`cdcf4d8bd42ec669ac811798162600cbb6b9e92b2cb8d60b64ecb146ee084aa9` from runtime
source `d0fd05220ac4f5db3487c1102d2946d79ceac5e8`. No application runtime changed.
The distribution tools and wizard branding were committed in `39665c0`.

The earlier 164,723,144-byte portable ZIP remains unchanged. This new ZIP has a
different archive layout/hash and excludes the tested folder's root diagnostic
`debug.log`; no program bytes were changed. Original and staged file inventories
were verified after building. The payload policy rejects unexpected files.

Candidate downloads are grouped in `Downloads/DD84-Studio-0.37.0-Preview/` with
individual checksum files, the distribution manifest and the
[customer quick-start guide](STUDIO-PREVIEW-QUICKSTART.md). The original top-level
download is retained. GitHub CI artifacts are separate builds: use their own
manifests and acceptance proof, not the local hashes above.

## Passed checks

- Verified all 86 installed program files and all 86 files extracted from the
  portable ZIP against the same manifest, with no extra ZIP contents.
- Installed per-user without elevation. Created a Start menu shortcut whose
  target and branded icon both point to the installed executable.
- Ran the complete native Studio harness from the installed location, including
  project/review saves, byte-identical reopening, original-value preservation,
  abrupt-exit recovery, single-instance behavior, measured CSV/case/comparison
  workflows, app zoom and minimum window. Zero renderer errors were recorded.
- Attempted install and uninstall with an unsaved sample edit open. Both refused
  with exit code 2; the same process, unsaved value and installed bytes survived.
- Closed only the synthetic test session, reinstalled the same version and
  verified program bytes and saved synthetic work.
- Rejected the `--delete-app-data` uninstaller switch. A controlled registry
  fixture with version 999.0.0 also rejected downgrade; the fixture was restored.
- Removed the test installation and verified program files, registration and
  shortcut were removed. Unknown synthetic saved work within the install folder
  and outside it survived. Only the owned test installation was removed.
- Opened the actual setup welcome page: existing DD84 logo, green/black sidebar,
  correct preview version, readable text and buttons. Canceled before installing
  through the wizard and confirmed its window closed.
- All 271 Studio tests and three distribution-policy tests passed locally.
  The isolated distribution-tool audit reported zero vulnerabilities.

Local evidence is retained in `c/outputs/studio-installer-2026-11-20/`, including
`distribution-manifest.json`, `installer-proof.json`, the installed app's native
proof and its synthetic saved outputs. Windows CI repeats distribution building,
ZIP/file verification and lifecycle acceptance, retaining candidate-specific
artifacts and proof for 14 days.

## Limits and next gates

The lifecycle harness uses silent installation/removal and controlled native save
destinations. The welcome page was inspected interactively; that does not imply
the entire installer wizard or Windows Settings removal was manually accepted.
The higher-version registry fixture tests refusal, not real version-to-version
data migration. No automatic updater is configured.

Setup and application remain unsigned. Separate-computer first launch, interactive
install/removal, broader OS display/accessibility coverage, signing and a genuine
future-version upgrade remain open in the [release handoff](WINDOWS-RELEASE-HANDOFF.md).
No customer tunes/logs or vehicle hardware were used. Native HPT/Holley writing,
automatic learning and vehicle flashing remain unavailable.
