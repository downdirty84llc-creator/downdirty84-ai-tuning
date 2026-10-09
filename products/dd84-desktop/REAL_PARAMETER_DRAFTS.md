# Real exported parameter drafts — 0.17

Studio can edit complete, readable exported values in a separate DD84 draft.
It cannot decode all parameters from an HPT/Holley container, save a native
tune file, or write an ECU. Export metadata is not a controller definition.

## Current coverage

| Input | Read | Edit | Save |
|---|---|---|---|
| Captured Sierra MAF exports | Complete absolute curves with Hz and airflow units | Every imported value | DD84 JSON draft, original-value backup, review |
| Captured Sierra spark exports | Complete absolute RPM/airmass maps in degrees | Every imported value | DD84 JSON draft, original-value backup, review |
| Captured Sierra cooling exports | Desired ECT in Fahrenheit with numbered zones; fan percent with Fahrenheit axes | Every imported value | DD84 JSON draft, original-value backup, review |
| Holley candidate spark extraction | Candidate numeric matrix and source fingerprint | Read-only; units and full decoding not verified | DD84 inspection draft |
| Arbitrary HPT / HEFI / TERX / Sniper container | Source fingerprint only | No | No native tune output |
| HPL / Holley native log | No native measurement decoder | Not calibration parameters | No native output |
| Supported VCM Scanner CSV | Recorded measurements in the separate log panel | Review selections/notes only | Log review reports |

Customer exports, source files and prepared drafts are local artifacts, excluded
from Git and the portable application. Coverage counts for a particular owner's
files are recorded separately; these adapters do not establish universal support
for any vehicle, controller family or software version.

## Workflow

1. Choose **Open DD84 project** for a prepared `DD84_CALIBRATION_DRAFT_V1` file.
   Alternatively, choose an export stage and a **Readable parameter export JSON**
   in the formats listed below. This input expects an existing DD84 export record,
   not an arbitrary vendor JSON, binary tune or differences-only report.
2. Optionally choose **Verify source tune against open draft**. A matching SHA-256
   confirms that file's bytes match the recorded source reference. It does not
   verify the export's contents, authorship, controller identity or table meaning.
3. Search the parameter library, select a table and edit its working values.
   Originals and axes remain unchanged. Unknown units/definitions stay read-only.
   Numeric format bounds are not safe tuning limits or controller encoding limits.
4. To combine captures from the same tune, select **Add tables to current real
   draft**. Different source fingerprints and duplicate parameter paths are
   rejected without replacing the current project.
5. Save a project copy to resume later. Save the exported-original backup
   separately, and keep the native tune too: the table backup is not a full tune.
   Describe the edit before exporting a review. Review reports are separate from
   reopenable project files. The standalone review note lives in the review report.

Imported display precision is preserved; native stored precision is unknown.
No automatic learning, conversion, interpolation or tuning recommendation occurs.

## Schema and adapter contract

`realDraft.mjs` validates `DD84_CALIBRATION_DRAFT_V1`. Required project gates are
`SIMULATION_ONLY`, `LOCAL_DRAFT_NOT_RELEASED`, `SOURCE_BOUND_EXPORT` and
`EXPORT_METADATA_ONLY`. Native addresses, encoding fields and unknown top-level
fields are rejected. Source metadata carries vendor, basename, SHA-256, optional
byte length and optional controller/OS claims with supporting identity evidence.
Those claims are evidence text, not independently validated identities.

Each parameter has a unique path, immutable original array, working array, axes,
descriptor and at least one export-record fingerprint. Descriptors support scalar,
curve, map, enum and boolean values. Editable descriptors have `EXPORTED_VALUES`
status with known units and complete dimensions. `UNVERIFIED` descriptors remain
read-only. Descriptor status in a local JSON file is not an authentication system.
Do not treat imported metadata as trusted for hardware operation.

Maps use X followed by Y axes and row-major values. Axes may increase or decrease,
but must be strictly monotonic; orientation is retained exactly. Limits: 4 MiB
canonical JSON, 1–1,024 parameters, at most two axes, 2–256 points per axis,
4,096 values per parameter and 65,536 total values. Numeric format magnitude is
bounded to 1e9; narrower bounds can be recorded. Enum choices and booleans are
validated independently. Originals are deep-copied before edits.

`realImport.mjs` currently accepts these explicitly versioned captured records:

- `DD84_SIERRA_ABSOLUTE_MAF_V1`: intermediate or final.
- `DD84_SIERRA_ORIGINAL_FINAL_MAF_V1`: original or final.
- `DD84_SIERRA_SPARK_STAGES_V1`: original, intermediate or final.
- `DD84_SIERRA_ORIGINAL_SPARK_BASELINES_V1`: original.
- `DD84_SIERRA_REMAINING_SPARK_STAGES_V1`: original, intermediate or final;
  five complete maps, including minimum final spark, with capture fingerprints.
- `DD84_SIERRA_COOLING_STAGES_V1`: original, intermediate or final; desired
  coolant temperature and fan-target maps with capture fingerprints.
- `DD84_CANDIDATE_RAW_SPARK_EXTRACTION_V1`: Holley base or comparison, read-only.

The parser requires complete arrays and expected units and rejects mixed source
tunes, ragged rows and unsupported formats. It hashes the UTF-8 JSON record as
import evidence. Review baseline hashing includes source identity, descriptors,
axes, originals and evidence; working values and the project title are excluded.
Reviews explicitly declare `nativeFileExport: false`, `vehicleWriting: false` and
`controllerDefinitionsValidated: false`. Pending source verification is tied to
the loaded source; replacing the project prevents stale verification results.

Cooling import retains displayed Fahrenheit values without converting them. The
Desired ECT axes are Torque Zone 0–5 and RPM Zone 0–3, represented as `zone index`;
these are not physical torque or RPM breakpoints. Fan-table axes are engine coolant
temperature and desired ECT in Fahrenheit. Neither target table proves a measured
temperature, actual fan operation or improved performance. Hardware notes and edit
intent remain separate owner evidence. Differences-only VE/cooling review records
are not accepted as absolute parameter exports.

## Comparing two real drafts

`realCompare.mjs` compares working values in a selected reference draft with the
open draft. Direction is always open minus reference; no chronological order is
inferred from names. Both drafts are validated and cloned. Different vendors or
conflicting nonempty controller/OS claims prevent all shared-table comparisons.
Unknown controller/OS metadata remains unknown even when numeric comparison is
possible.

Shared paths require exported-value status, equal parameter labels, kind, units,
axis labels/units, choices and exact axes. Different dimensions or axis order do
not trigger interpolation. Missing paths are coverage gaps, not zero values or
unchanged tables. Numeric changes preserve coordinates and signed deltas; enum
and boolean changes retain their typed values and have no numeric delta.

`DD84_CALIBRATION_COMPARISON_V1` reports include all compared changes, coverage
counts, both complete draft snapshots and SHA-256 hashes of their normalized JSON.
The snapshots are taken before asynchronous hashing. A required note explains
what was reviewed; report size is limited to 16 MiB. The display limits cell details
to 200 changes for the selected parameter, while the report retains every change.
The report is not a reopenable project or a native tune export. It explicitly
keeps vehicle writing, native export, controller validation and learning approval
false. Hashes establish content identity, not authenticity.

The UI recalculates after project edits/undo and clears the comparison note.
Replacing the project clears its reference. Failed reference imports preserve the
previous comparison. Replacing the reference clears the note. Stale asynchronous
imports/reports are ignored when the project or relevant inputs change.

## Native support still required

For each exact controller, OS and native container version, the next adapter needs:

1. A documented permitted container specification or SDK and definition source.
2. Verified identity, complete parameter inventory, locations, types, sizes,
   scaling, units, axes, constraints and unsupported-region preservation.
3. Golden fixtures proving no-edit byte preservation, isolated edits, checksums,
   native-tool reopening and rejection of incompatible versions.
4. Separate read/edit/native-export capability declarations. Physical write
   support also requires the handoff's bench interruption/recovery acceptance.

No validated native decoders or writers are bundled in 0.17. Definitions for an
older GM ECM or a Corvette body controller do not establish support for Sierra
engine controllers or Holley EFI. Vendor parameter IDs are not binary addresses.

HP Tuners' [User Defined Parameters documentation](https://support.hptuners.com/support/solutions/articles/153000064371-user-defined-parameters)
describes XDF-based additions for supported controllers and permitted address
ranges; it does not supply universal controller definitions or an HPT container
specification. It is not a universal-import implementation for DD84.
