# Clean Windows acceptance on one computer

Prepared November 21, 2026. The owner has one Windows 11 Home PC. No clean
Windows guest has been installed or tested. This is a prepared test route.

A new Windows 11 x64 guest can test first installation and missing dependencies.
It cannot qualify different physical hardware, USB/CAN or every display/GPU.
The host has about 31.5 GiB RAM and 737 GiB free disk. `HypervisorPresent` is true,
while processor virtualization/SLAT properties returned false. Those conflicting
indicators do not establish guest boot support. No VirtualBox/VMware installation
or ISO was found in the checked locations.

## Environment to prepare

Use Oracle VirtualBox's GPLv3 **Platform Package**, with a new Windows 11
Enterprise **90-day evaluation** guest from Microsoft. The separately licensed
Extension Pack is unnecessary for this software-only test. The owner completes
Microsoft registration and accepts the applicable evaluation terms directly.
Use the guest only within those terms and the evaluation period.

Suggested allocation: 8 GiB RAM, 4 virtual CPUs, 80 GiB dynamic virtual disk,
UEFI/TPM 2.0 and NAT networking. Verify guest boot support against the installed
hypervisor version. Install Windows into a new virtual disk, never over the host
OS. Schedule any administrator installation/reboot before installing host drivers.
Do not disable Windows protections or change firmware to force the test to pass.
No driver, hypervisor, guest OS or evaluation license was installed in this step.

## Test sequence

1. Complete normal guest setup/updates. Record Windows edition/build and security
   settings. Do not install Node, Git, Python, developer dependencies or a
   preconfigured Windows development image. Take a clean snapshot.
2. Transfer only the exact candidate Setup, ZIP, checksum files and manifest.
   Compare SHA-256 using `Get-FileHash -Algorithm SHA256 -LiteralPath <filename>`.
   For the signed candidate, download inside the guest through the intended
   customer delivery URL, verify its publisher/signature, and record Windows
   reputation warnings. Do not bypass a warning to record a pass.
3. Follow the [release handoff](WINDOWS-RELEASE-HANDOFF.md): interactive install,
   Start menu launch, synthetic edit, cancel/save/overwrite/reopen, review export,
   keep-editing on close, same-version reinstall and Windows Settings removal.
   Verify saved work survives removal and reopens in the portable copy.
4. Reset to the clean snapshot for an independent portable ZIP first launch.
   Test keyboard-only use and 100%, 150%, 200% Windows display scales separately.
   A successful sample does not qualify every workspace.
5. Retain the completed record and synthetic files outside the VM before reset.
   Repeat affected checks after changing or signing the candidate.

## Acceptance record

Fill only after execution; every row is currently **not run**.

| Record | Result |
|---|---|
| Date/tester, guest edition/build, VM version, clean snapshot | Not run |
| Setup/ZIP filenames and SHA-256, runtime ASAR hash | Not run |
| Signature, publisher, first-download warning | Not run |
| Interactive install and Start menu launch | Not run |
| Edit/cancel/save/overwrite/reopen, originals preserved | Not run |
| Review export, keep-editing on close | Not run |
| Reinstall, Settings removal, saved-file preservation | Not run |
| Portable first launch from clean snapshot | Not run |
| Keyboard-only use and each Windows display scale | Not run |
| Exact failures, saved filenames and output hashes | Not run |

## Primary references checked November 21

- [Oracle Windows host support and installation](https://docs.oracle.com/en/virtualization/virtualbox/7.2/user/installation.html)
- [Platform Package licensing and optional Extension Pack](https://docs.oracle.com/en/virtualization/virtualbox/7.2/user/Introduction.html)
- [Microsoft Windows 11 Enterprise evaluation](https://www.microsoft.com/en-us/evalcenter/evaluate-windows-11-enterprise)
