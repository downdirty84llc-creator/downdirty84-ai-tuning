# Independent DD84 calibration system

## Product direction

Build independently authored DD84 software for the business's calibration workflow: vehicle/build records, original preservation, table import/editing/comparison, log analysis, human review, signed delivery and eventually validated controller-specific read/write/recovery. This is a functional product goal, not a conversion or rebranding of another vendor's software.

The current desktop preview is original application code built on licensed open-source dependencies. Its HPT support only fingerprints files and records cases. It has not implemented another vendor's file parser, table definitions, licensing protocol, device driver or tuning engine. The inspected installed editor provided identity observations; that inspection is not a clean-room certification or a grant of reuse rights.

## Source and ownership boundaries

- Write DD84 code, interface text, project schemas and tests independently. Do not copy vendor source, decompiled implementations, interface artwork, logos, documentation prose or proprietary definition databases.
- Use public specifications, appropriately licensed dependencies and permitted exports. Record each adapter's source, version, license/permission, supported controller/OS and validation evidence.
- User possession of an HPT file is not proof of ownership of all embedded firmware or definitions. Keep customer files local and outside git. Do not redistribute them in sample projects or tests.
- Do not bypass encryption, licensing, access controls or device authentication. Proprietary-format access without a documented permitted route remains unsupported.
- Preserve third-party license notices. Independently written DD84 code does not make its dependencies copyright-free. Commercial ownership and release claims need separate review; this engineering plan does not certify legal clearance.

The U.S. Copyright Office distinguishes protected program expression from ideas, logic, systems and methods: https://www.copyright.gov/register/tx-programs.html . Access-control restrictions are a separate issue: https://www.copyright.gov/title17/92chap12.html . These distinctions support independent implementation, not an assurance that every compatibility technique is permitted.

## Architecture

| Layer | DD84 responsibility | Boundary |
|---|---|---|
| Case library | Vehicle/build facts, original/final references and exact hashes | Owner statements distinguished from measured or decoded facts |
| Native project | Versioned DD84 schema, original values, working revisions, units, axes, provenance and undo history | Never relabel a proprietary file to claim conversion |
| Import adapters | Convert permitted table/log exports into native data | Explicit formats, units and controller/OS match; unknown input rejected |
| Calibration editor | Original/working comparison, table operations and review notes | Existing editable-path policy remains until deliberately extended and tested |
| Analysis | Reuse existing backend log validation, safety checks and evidence | No invented sensor channels or calibration addresses |
| Approval and delivery | Existing owner release, device/vehicle-bound signed package | Local edits and draft exports cannot self-approve or self-sign |
| Device adapter | DD84 LINK wired transport and controller-specific recovery | SIMULATION_ONLY until actual bench validation passes |

## Implementation order and acceptance criteria

1. **Native table/log interchange.** Specify an independently designed, versioned interchange format. Import permitted numeric exports with explicit source role, units, axes and controller/OS context. Preserve originals. Test malformed inputs, mismatched axes/units, precision and save/reopen round trips. Export a DD84 draft, not an HPT file or flash image.
2. **First real comparison case.** Use the locally recorded owner-selected original/final pair and confirmed build. Obtain readable exports through the installed tool's supported workflow. Compare actual values with traceable source identities. Do not use file-size/hash differences as table-change evidence. Do not assume a VIN or file container proves installed hardware or modifications.
3. **Desktop/cloud integration.** Connect projects to existing authenticated jobs, log analysis and owner review without weakening server permissions. Show offline, pending, rejected and released states distinctly.
4. **Controller adapters.** Add hardware/OS-specific definitions from documented permitted sources, with checksum and round-trip fixtures. Advertise support only after that adapter passes its tests. Track read, edit, export and write capabilities separately.
5. **End-to-end hardware release.** Validate backup, recovery after interruption, identity binding and pre-write checks on a bench for each controller family before enabling physical writes. Then validate a signed Windows installer and update process.

Current status: steps 1–5 are future milestones; preview 0.2 supplies the local case/fingerprint foundation and simulation editor. It does not provide universal controller support or real HPT calibration editing.

## Measured-learning milestone

Implemented: local evidence timeline and readiness checklist in the desktop source. Not implemented: trained models, adaptive correction updates, proprietary channel decoding, VE/timing table adapters, cloud learning or automatic calibration changes.

Next, import permitted readable log exports with time, units, sensor provenance and exact calibration hashes. Partition runs by controller/OS, hardware configuration, displacement, cam installation and fuel. Reject unknown units, transient or invalid sensor data and incomparable runs. Keep MAF and VE attribution separate; account for fuel-system and sensor errors before interpreting lambda residuals as airflow errors. Record proposed versus reviewed versus applied corrections independently. Compare independent validation runs before updating versioned learning state, retain rollback and prevent rejected/duplicate runs from training it. User approval alone is not evidence of measured improvement.

Cam/displacement context cannot establish optimum spark. A future timing adapter needs validated knock detection and controlled torque evidence for each tested operating region; absence of knock alone does not establish maximum-brake-torque timing. Reference: https://support.haltech.com/portal/en/kb/articles/applying-load and https://support.haltech.com/portal/en/kb/articles/knock-control-user-s-guide . No timing values are proposed by this milestone.
