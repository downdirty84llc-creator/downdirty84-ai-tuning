# Studio Windows signing preparation

Prepared November 21, 2026. **No signing account was provisioned, subscription
purchased, certificate issued, identity submitted or Studio binary signed.**
No signing certificate, Azure signing environment or signing CLI was configured
on the development PC during the read-only inventory.

## Proposed service for owner review

Microsoft Azure Artifact Signing (formerly Trusted Signing), Basic, in East US,
using an **organization Public Trust** profile for the verified legal business.
Microsoft publishes **USD 9.99/month including 5,000 signatures**, then USD 0.005
per additional signature. Confirm the actual Azure offer, tax and billing terms
before creating the paid resource. This plan has not been approved or purchased.

An Azure subscription/tenant and identity validation are required. The owner
should enter business/identity documents directly into Microsoft's portal, not
chat, repository files or test evidence. Use the exact legal publisher identity
that Microsoft validates; do not substitute a marketing name or enable street
address disclosure unnecessarily. A Public Trust Test or Private Trust profile
does not qualify a customer release. No private key needs to be exported here.

## Build path prepared in this repository

1. After owner approval and completed identity validation, install the official
   x64 Artifact Signing client tools and Azure CLI on the signing workstation.
   Use the Microsoft installation instructions below. Authenticate directly as
   an authorized signer; only the selected certificate profile needs the signer
   role. This repository creates no account, credential, role or subscription.
2. Copy `tools/studio-installer/signing.example.json` outside the repository.
   Supply the approved endpoint/account/profile, **exact validated publisher**,
   and absolute paths to the official x64 SignTool and Dlib. No password or token
   belongs in this file. The example deliberately fails validation unchanged.
3. Build from a verified application package into a **new** output directory:

   ```powershell
   node tools/studio-installer/build.mjs products/dd84-desktop/dist/DD84-Calibration-Studio-win32-x64 products/dd84-desktop/dist/signed-candidate --signing-config C:/owner-config/studio-signing.json
   node scripts/test-studio-installer.mjs products/dd84-desktop/dist/signed-candidate/distribution-manifest.json C:/owner-config/studio-signing.json
   ```

4. Retain the new manifest, signature receipts, hashes and acceptance proof. The
   signed build has new EXE/archive hashes; previous unsigned-artifact acceptance
   cannot certify it. Deliver it for the [clean Windows test](WINDOWS-CLEAN-TEST.md) only
   after the full signed build and installation tests pass.

Signing occurs only with the explicit `--signing-config` option. Normal pull
requests continue to build **unsigned previews** without cloud credentials or
signing charges. No automatic publication or final-release version promotion is
configured. A signed candidate still says **preview**.
Ambient PFX-link/password settings are removed from the build process so another
product's cached certificate cannot silently sign this preview.

## Checks and preservation

- Validate exact Microsoft regional endpoint and explicit configuration; inspect
  both tools for valid Microsoft code-signing signatures before invoking them.
- Use only the owner's Azure CLI identity, not fallback credentials from another
  development tool or an interactive sign-in launched by the build.
- Copy the verified payload; sign the copied Studio EXE, NSIS uninstaller and
  NSIS Setup using SHA-256 and the Microsoft RFC 3161 timestamp service.
- Require SignTool Authenticode verification, the Microsoft public identity root,
  the exact expected publisher, code-signing EKU and a timestamp. Missing or
  invalid checks stop the build. No self-signed certificate or trust-store change.
- Preserve original files, ASAR, native modules and vendor runtime bytes. This
  scope signs the three application/distribution EXEs, not every third-party DLL
  or `.node` file. Actual Smart App Control behavior remains an acceptance check.
- Verify signed Setup before installation, the extracted portable EXE, installed
  Studio and installed uninstaller. Then repeat every native workflow and
  lifecycle test. A missing signing configuration cannot bypass signed acceptance.

Unit fixtures cover rejection policy; the Windows check rejects the actual
unsigned Studio package. These are **not** evidence of successful cloud signing.
The cloud/Dlib integration, real public certificate chain, timestamp, embedded
uninstaller signature and fresh-download behavior remain untested until the
owner's approved account and identity are available. Signing alone does not
guarantee that Windows reputation checks will show no warning.

## Primary references checked November 21

- [Microsoft service and published pricing](https://azure.microsoft.com/en-in/products/artifact-signing)
- [Account, identity validation and Public Trust prerequisites](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart)
- [Official client installation, SignTool arguments and timestamp requirements](https://learn.microsoft.com/en-us/azure/artifact-signing/how-to-signing-integrations)
- [Public and private trust models](https://learn.microsoft.com/en-us/azure/artifact-signing/concept-trust-models)
