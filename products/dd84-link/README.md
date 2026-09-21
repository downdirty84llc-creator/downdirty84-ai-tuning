# DD84 LINK MVP

This directory is the first executable vertical slice of the DD84 hardware/software tuning ecosystem.

## What works now
- per-device challenge/authentication in the simulator
- vehicle session binding
- telemetry/log upload
- cloud calibration signing (Ed25519)
- tamper detection
- device serial + VIN hash + controller binding
- fail-closed pre-flash checks
- simulated A/B install and recovery
- audit events
- firmware-side flash-guard logic with host test
- initial Supabase production schema
- Rev-A hardware/BOM and EVT/DVT/PVT plan

## Run it
```bash
npm test
npm run demo

gcc -std=c11 -Wall -Wextra -Ifirmware/include \
  firmware/src/flash_guard.c firmware/host_flash_guard_test.c \
  -o /tmp/dd84-flash-guard && /tmp/dd84-flash-guard
```

## Current safety boundary
`mock-release` deliberately issues `writeStrategy: SIMULATION_ONLY`. No real ECU write routine is present. Real programming support is added one controller family at a time only after bench recovery is proven.

## Recommended hardware path
Start EVT-0 with NXP FRDM-A-S32K344 + two CAN-FD transceiver channels + protected OBD breakout + USB. Freeze the wired device protocol before adding wireless or a custom PCB.

## Directory map
- `shared/` protocol, signing and safety rules used by the executable prototype
- `cloud/` local cloud reference service
- `simulator/` virtual DD84 LINK device
- `tests/` end-to-end and tamper/safety tests
- `firmware/` production-oriented C state-machine/safety skeleton
- `hardware/` Rev-A electrical architecture and BOM
- `supabase/` production data-model starting point
- `manufacturing/` EVT/DVT/PVT gates
- `docs/` product, protocol and security specifications
