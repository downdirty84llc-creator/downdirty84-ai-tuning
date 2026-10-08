# Native parameter projects

Studio 0.14 introduces `DD84_STUDIO_V2`. The UI uses `project.mjs` and the bundled,
independently authored `parameters.mjs` definition set. `model.mjs` remains the V1
validator for compatibility. Nothing in this format is an ECU image or an HPT
container. It has no flash addresses, checksum algorithm, live tuning or read/write
transport.

## Required project fields

```json
{
  "format": "DD84_STUDIO_V2",
  "writeStrategy": "SIMULATION_ONLY",
  "controller": "SIM-ECM-01",
  "definitionSet": "DD84_SIM_DEFINITIONS_V1",
  "name": "Synthetic example",
  "parameters": [
    {"path": "Idle.TargetSpeed", "axes": [], "original": [800], "values": [900]}
  ]
}
```

Only these fields are accepted. Definition identity, kind, labels, units, bounds,
integer constraints and enum choices come from bundled code. They cannot be
overridden by a file. All six bundled parameters are synthetic examples; their
bounds express format constraints, not safe or optimum engine settings.

Each parameter has a unique `path`, `axes`, `original` and `values`. Scalars,
booleans and enums have zero axes and a one-element value array. Curves have one
axis. Maps have two axes: X, then Y. Value arrays are row-major, with index
`yIndex * xLength + xIndex`. Each axis is strictly increasing; axes are not editable
in the UI. A saved project retains them exactly, without resampling or unit
conversion. Numeric values are finite JavaScript numbers; save/reopen preserves
their JSON representation without deliberate rounding.

Unknown paths use the same bounded structural format and primitive values
(finite numbers, booleans or strings up to 120 characters). They remain read-only;
no units or meaning are inferred. Previously imported differences remain visible
and are marked as unknown in review exports. Restoring editable parameters leaves
unknown values untouched. Exporting the original backup includes unknown originals.
Files with incompatible or extra fields are rejected rather than silently stripped.

Limits: 1 MiB per project, 1–128 parameters, 2–256 points per axis, at most two axes,
4,096 values per parameter and 32,768 values per project. The canonical indented
save must also fit the byte limit. Names are 1–120 characters; parameter paths use
letters, digits, periods, underscores and hyphens, starting with a letter.

V1 imports retain their one MAF curve, original and working values and become V2
on save. V1 review files are not project files. V2 review exports include the
project but are also separate reports, not directly reopenable projects.

## Original preservation and review

An edit copies/validates the project before changing one working value. All
originals stay unchanged. Undo snapshots are kept in memory only, bounded to 100
edits. Baseline hashing includes controller, definition-set version and every
parameter's path, axes and originals, sorted by path; project name and working
values do not affect the hash. Hashing is content identity, not authentication.
Review snapshots are taken before asynchronous hashing; UI changes invalidate a
pending export. Drafts remain `LOCAL_DRAFT_NOT_RELEASED` and `SIMULATION_ONLY`.

## Adding real-controller editing

A future adapter must supply a documented permitted source, exact controller and
OS identity, validated definitions/units/scaling, source provenance, preservation
of unsupported data, and checksum plus import/export round-trip fixtures. It must
advertise read, edit, export and write support separately. A readable Differences
CSV has deltas, not necessarily complete absolute tables or operating axes, and
cannot populate a real tune by itself. Never infer all parameters from a filename,
VIN or a successful file read. Version definition changes deliberately and retain
old definitions for reproducible reviews. Physical writes additionally require the
handoff's controller-specific interruption/recovery bench acceptance.
