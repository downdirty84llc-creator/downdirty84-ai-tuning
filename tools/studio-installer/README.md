# Windows distribution tools

Build an unsigned per-user installer and a portable ZIP from an already verified
Studio package. These build dependencies are separate from the app and are never
included in its ASAR. The existing green DD84 icon is used for Setup and shortcuts.
The wizard sidebar uses the existing DD84 logo; `sidebar.ps1` reproduces the
committed bitmap from that logo using Windows drawing libraries.

From the repository root on Windows:

```powershell
npm --prefix tools/studio-installer ci --ignore-scripts
npm --prefix tools/studio-installer audit --audit-level=low
node --test tools/studio-installer/payload-files.test.mjs
node tools/studio-installer/build.mjs products/dd84-desktop/dist/DD84-Calibration-Studio-win32-x64 products/dd84-desktop/dist/distribution
node scripts/test-studio-installer.mjs products/dd84-desktop/dist/distribution/distribution-manifest.json
```

Choose a new output directory for each build; existing directories are rejected.
The tools version must match the application version. The builder verifies the
ASAR and bundled runtime, copies it to an isolated payload, and verifies all
original and staged file hashes after packaging. An explicit payload policy
rejects extra customer/developer files and omits only the known root `debug.log`,
without modifying the source folder. Each artifact gets a SHA-256
file. `distribution-manifest.json` records the exact runtime and payload hashes.
Use the locked electron-builder version and its checksum-verified build tools.
The minimatch override patches the affected modern dependency versions without
changing the older function-style API used by legacy build dependencies.

## Installation behavior

- Stable application ID/GUID; current Windows account only, no elevation.
- Assisted wizard, Start menu shortcut, no desktop shortcut or automatic launch.
- Windows build 22000 or newer; Windows 11 x64 is the customer test target.
- All Studio processes must be closed before installation/removal. Failure to
  establish that the process is absent also stops the operation. The NSIS process
  check replaces the framework's automatic-close/terminate behavior.
- A higher registered version blocks downgrade. Updates are manually installed;
  no update service, background downloader or automatic updater is configured.
- Removal deletes the enumerated program files and empty program directories.
  Unknown files and directories survive, including saved work placed inside the
  installation folder. Application data is retained. The `--delete-app-data`
  uninstaller switch is rejected. Keep ordinary backups of source files and work.
- No file associations, credentials, cloud configuration or vehicle drivers.

## Acceptance scope

The integration test refuses an existing Studio registration or shortcut. It
uses a uniquely created test directory, verifies that the extracted ZIP and
installed bytes match the same manifest, launches the
installed application through the existing native harness, and tests running-app
refusal, same-version reinstall, retained synthetic work, downgrade refusal with
a controlled registry fixture, and removal of registration/shortcut/program files.
It preserves its synthetic evidence and cleans only its own installation.

It does not certify another Windows computer, interactive OS warnings, a signed
download, or a real future application's cross-version data migration. A genuine
version-to-version upgrade must be tested when a newer runtime is released.

Customization references: [electron-builder v26 NSIS](https://www.electron.build/v26/docs/nsis/)
and [NSIS process check result codes](https://nsis.sourceforge.io/NsProcess_plugin).
Only the normal NSIS template's documented hooks are customized.
