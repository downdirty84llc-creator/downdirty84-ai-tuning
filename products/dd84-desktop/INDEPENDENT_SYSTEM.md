# Independent DD84 calibration system

## Product direction

Build independently authored DD84 software for the business's calibration workflow: vehicle/build records, original preservation, table import/editing/comparison, log analysis, human review, signed delivery and eventually validated controller-specific read/write/recovery. This is a functional product goal, not a conversion or rebranding of another vendor's software.

The current desktop preview is original application code built on licensed open-source dependencies. Its native HPT support fingerprints files and records cases. Separate complete readable exports can populate editable local DD84 drafts with provenance; this is not native HPT editing. It has not implemented another vendor's file parser, table definitions, licensing protocol, device driver or tuning engine. The inspected installed editor provided identity observations; that inspection is not a clean-room certification or a grant of reuse rights.

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

Current status: preview 0.19 includes editable real exported-value drafts, same-source table merging, source fingerprint rechecks and full original preservation. Real draft comparisons now retain exact coordinates, source snapshots and missing/incompatible coverage. Captured Sierra MAF/spark/cooling and VE zone boundary tables are supported; VE coefficients and Holley candidate matrices remain read-only. Named categorical axes and source-bound controller identity evidence are preserved without enabling native definitions. Defined numeric curves/maps now support previewed range adjustments with atomic validation and one-step undo. Simulation editing and readable log/comparison inspection remain available. Step 1 has a working exported-value interchange, but exact controller/OS definitions, native HPT/Holley decoders, native output and steps 3–5 remain incomplete. See [Real parameter drafts](REAL_PARAMETER_DRAFTS.md) for precise coverage.

## Measured-learning milestone

Implemented in preview 0.22: a local evidence timeline and readiness checklist, with reviewed VCM Scanner CSV references tied to exact included tune fingerprints. New V2 cases preserve channel-selection and association notes, reject duplicate CSV stages and require after-final measurements to reference the final tune. Reopening requires source rechecks before recomputed counts are shown; computed statistics and session verification are not trusted from saved metadata. Legacy V1 cases upgrade with no invented measurements. Not implemented: trained models, adaptive correction updates, proprietary channel decoding, physical VE/timing models, cloud learning or automatic calibration changes.

Preview 0.23 adds independent time-window comparison between two reviewed CSV stages. Both sources must be checked in the current session, the selected role must exist in both and exported units must match. Separate reports bind the complete learning-case fingerprint and recompute summaries on reopening. Empty windows and missing readings remain explicit; no operating-condition matching, correction factors or performance gains are inferred.

Preview 0.24 adds a source-recomputed review of independently selected RPM, MAP, intake-temperature and coolant-temperature ranges. It reports missing selections, unit mismatches, shared-range reading counts and sparse range gaps without inferring simultaneous coverage or matching conditions. Comparison V2 retains this derived context; V1 reports upgrade through source verification.

Preview 0.25 adds an optional operator-selected RPM/absolute-pressure band to both time windows. It requires finite context values on the same CSV row, accounts for excluded rows, and summarizes the selected channel only within the band. Comparison V3 recomputes all results from checked sources; V1/V2 upgrade without a band. Same-row filtering does not synchronize asynchronous sensors or establish matched conditions. Source and sensor provenance, fuel/hardware partitioning, steady-state validation and correction attribution remain outstanding.

Next, validate sensor provenance and partition comparable runs by controller/OS, hardware configuration, displacement, cam installation and fuel. The current CSV adapter preserves time and units but does not align asynchronous channels or establish matched operating conditions. Reject unknown units, transient or invalid sensor data and incomparable runs. Keep MAF and VE attribution separate; account for fuel-system and sensor errors before interpreting lambda residuals as airflow errors. Record proposed versus reviewed versus applied corrections independently. Compare independent validation runs before updating versioned learning state, retain rollback and prevent rejected/duplicate runs from training it. User approval alone is not evidence of measured improvement.

Cam/displacement context cannot establish optimum spark. A future timing adapter needs validated knock detection and controlled torque evidence for each tested operating region; absence of knock alone does not establish maximum-brake-torque timing. Reference: https://support.haltech.com/portal/en/kb/articles/applying-load and https://support.haltech.com/portal/en/kb/articles/knock-control-user-s-guide . No timing values are proposed by this milestone.
