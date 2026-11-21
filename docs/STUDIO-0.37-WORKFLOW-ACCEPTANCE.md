# Studio 0.37 expanded workflow acceptance

November 21, 2026, Windows 11 Home build 26300. These results use synthetic
files on the development PC. No customer data, vehicle or board was accessed.
Application runtime ASAR remains
`cdcf4d8bd42ec669ac811798162600cbb6b9e92b2cb8d60b64ecb146ee084aa9`.

## Installed application and distribution

The extended native harness and complete installer lifecycle passed against
both the previously qualified r3 installer and the new unsigned r4 build.
All 86 portable and installed payload files matched each manifest.
The r3 download remains unchanged; r4 is a packaging-validation candidate.

| r4 artifact | Bytes | SHA-256 |
|---|---:|---|
| `DD84-Calibration-Studio-0.37.0-Windows-x64-preview-Setup.exe` | 110928118 | `b2f54f7b0191b71c82a828f151341645cc80f4c2b942e9b2c483f6197cb81b4c` |
| `DD84-Calibration-Studio-0.37.0-Windows-x64-preview.zip` | 154937674 | `dee41d8b92cc8cac22c059da044caea4fe06abf68401d7e31f3cd14db7d1a7d6` |

The installed-app harness verified full saved JSON contents and reopening for
synthetic file-pair identities, CSV log review/channel mappings, selected log
segments, learning cases and editable exported-value drafts. It also verified
detailed comparison export, rejection of a mismatched CSV, read-only unverified
Holley candidate values, and an eight-frame **software** bench rehearsal report.
Source files stayed unchanged and learning remained blocked. Synthetic `.hpt`
fixtures exercise file identity only; they do not test proprietary decoding.

Project/review recovery, measured-case source checks/comparisons, app zoom and
minimum-window checks also passed with zero renderer errors. Installer tests
verified the Start menu target/icon, refusal to install/remove while an unsaved
session runs, same-version reinstall, downgrade refusal using a registry fixture,
rejection of the data-deletion option, preservation of saved files and removal of
the test registration/shortcut. These use silent setup and controlled native
save destinations, not an interactive installer or clean Windows guest.

Evidence under `c/outputs/studio-release-2026-11-21/`:
- `dd84-installer-G0lLM5/`: existing r3 distribution proof and installed-app outputs.
- `dd84-installer-POMCS3/`: new r4 distribution proof and installed-app outputs.
- Each nested `dd84-native-*` folder contains complete workflow JSON and
  `native-proof.json`, including candidate ASAR hash, source identities and output
  hashes. The manifest is in `products/dd84-desktop/dist/installer-0.37.0-r4/`.

## Manual Windows picker and keyboard observation

Using the same runtime in a separate profile at **200% Windows display scale**
and 100% app zoom, keyboard navigation created/named a synthetic sample and
changed the first MAF value from 10 to 12. Focus indicators and scroll-into-view
were observed. Real Windows Save/Open dialogs saved, reopened and saved the
project again. The reopened UI showed original 10 and edited 12. Both full files
matched the expected complete project and were byte-identical:

- `keyboard-project.json`, 2155 bytes.
- `keyboard-project-reopened.json`, 2155 bytes.
- SHA-256 for both: `d5280ddf66893c467b74ddf0c9b1205595fa3002cd147a06c05fdaf9afb8af11`.
- `keyboard-native-proof.json` records scope and results in the evidence root.

Mouse actions were used for section navigation and some buttons. This is **not**
a full keyboard-only workflow pass or all-workspace accessibility acceptance.
The synthetic session closed normally after saving.

## Test totals and remaining gates

All **271 Studio tests** and **7 payload/signing checks** passed locally, including
the actual unsigned EXE's rejection by Windows Authenticode policy. A valid
Windows system executable was also read as a positive signature-query control.
These checks do not establish cloud signing.

The build now has an explicit [Artifact Signing path](WINDOWS-SIGNING.md) that
requires a trusted public publisher and timestamp and refuses unsigned fallback.
No account, certificate, paid resource or signed candidate exists yet. The owner
confirmed no signing account and no second PC. The [clean Windows VM test route](WINDOWS-CLEAN-TEST.md)
is prepared but unexecuted. Full keyboard-only use, remaining human file-dialog
flows, broader OS/display support and a genuine cross-version migration remain
open in the [release handoff](WINDOWS-RELEASE-HANDOFF.md).

No native HPT/Holley writing, automatic learning or vehicle flashing is enabled
by these tests. CI artifacts are separate builds and must use their own hashes
and acceptance proofs.
