# DD84 Calibration Studio for Windows

**0.37.0 unsigned preview · Windows 11 x64**

Choose one of the two downloads. Both contain the same Studio program files.
Keep the accompanying SHA-256 file for identifying your download when requesting
help. No Node.js or developer tools are required to run Studio.

## Install with a Start menu shortcut

1. Save your work and close all Studio windows.
2. Open the file ending in **preview-Setup.exe** and follow the setup wizard.
   It installs for your Windows account without requesting administrator access.
3. Open **DD84 Calibration Studio** from the Start menu.

To update this preview later, close Studio and run the newer installer. There is
no automatic updater. Setup refuses to replace a newer installed version or close
a running Studio. Real cross-version upgrade acceptance is still pending.

To remove Studio, use Windows **Settings → Apps → Installed apps**. Saved work
and application data are retained. Store ordinary project files in your own
Documents folder and keep backups.

## Use the portable ZIP

1. Right-click the ZIP and choose **Extract All** into a new folder.
2. Open **DD84-Calibration-Studio.exe** from that extracted folder.
3. Keep all companion files together. Do not run the app from inside the ZIP.

The portable edition does not add a Start menu shortcut. Avoid running it at the
same time as the installed edition.

## Try the editor without a vehicle

Open **Calibration projects → New sample project**. Change the first MAF value
from 10 to 12 and press Tab. These are demonstration numbers, not tuning advice.
Choose **Save → Save project copy** and select a new filename in a test folder.
Reopen it and verify that the edited value is 12 and the original remains 10.

Studio supports local evidence review and defined calibration drafts. Native
HPT/Holley writing, universal controller definitions, automatic tuning and vehicle
flashing are unavailable in this preview.

## If something stops you

Record the Windows version, Studio version, download filename, exact error and
the step that failed. Keep your original tune/log files. Do not attach customer
files automatically when requesting support.

This download is unsigned. If Windows blocks it or shows a security warning,
stop and report that message; do not disable protections to complete a test.
Signing and a separate-computer acceptance pass remain required before a final
customer release.
