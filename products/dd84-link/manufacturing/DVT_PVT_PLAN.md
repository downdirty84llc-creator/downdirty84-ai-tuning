# DVT and PVT gates

## DVT — design verification

Entry: completed EVT evidence, reviewed schematic/layout/BOM and protected OBD-II electrical design. Maintain hardware serial/revision and firmware build traceability.

- Verify reverse polarity, load dump/transient protection, brownout, thermal limits, ESD/EMC and quiescent current against an engineer-approved automotive test specification. Record measured values and failures; this document is a plan, not a compliance claim.
- Test dual CAN/CAN-FD termination/isolation behavior, bus-off recovery, USB-C recovery and interrupted communications on bench equipment.
- Integrate and test secure boot, signed firmware rejection, per-device secure identity storage, key provisioning and revocation. Reject untrusted rollback images.
- Exercise malformed/replayed commands, invalid signatures, binding/version mismatch, missing backup, power cuts and transport loss. Preserve original and known-good data under every tested interruption.
- Keep physical writes disabled. Any controller-specific flashing proposal requires a separate reviewed bench protocol, interruption matrix and demonstrated recovery for that exact family/software revision.

Exit: signed engineering review, evidence links for every test, no unresolved safety/security defects. Wi-Fi/BLE integration remains deferred until the wired protocol is stable.

## PVT — production validation

Entry: DVT sign-off and controlled manufacturing revision.

- Pilot production with approved substitutions only; record BOM lot, PCB assembly, serialized device identity and test-station versions.
- Provision unique keys through a controlled fixture; ensure secrets are not retained in manufacturing logs. Verify signed firmware boot and fail-closed configuration on every unit.
- End-of-line electrical, CAN, USB, power/reset, identity and simulated protocol tests; quarantine failing units.
- Validate recovery/service instructions, production key custody, traceable rework, support/RMA and audit retention.
- Define yield acceptance criteria and obtain manufacturing/security/engineering sign-off before shipment.

Release evidence must identify measured outcomes, reviewers, dates, and remaining limitations. No EVT/DVT/PVT plan grants real ECU write support.
