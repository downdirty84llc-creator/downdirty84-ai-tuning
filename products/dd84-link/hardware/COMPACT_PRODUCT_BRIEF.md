# DD84 LINK compact product and EVT-0 implementation brief

Date: 2026-09-24. Status: engineering requirements, not a manufacturing release.

## Product decision

Develop a proprietary DD84 device integrated with the existing DD84 business
platform. Ease of use, compact packaging and service life take priority over the
earlier minimum-cost prototype shopping exercise. Third-party scan tools are
potential test equipment, not the product architecture.

Preserve the Rev-A NXP S32K344-class controller, two CAN/CAN-FD channels, protected
vehicle power, secure identity, wired recovery and SIMULATION_ONLY restriction.
Wi-Fi/BLE are intended product features; they become operational only after the
wired protocol passes its validation gates. This brief adds product direction;
it does not replace the authoritative Rev-A handoff or authorize ECU writes.

## Customer experience target

1. Connect the enclosed device to the supported vehicle using a short replaceable
   OBD-II lead. This retains Rev-A's serviceable connector decision. A direct-plug
   housing is a later option after fit, leverage and antenna testing.
2. Sign into the existing DD84 customer account and claim the unit using a
   one-time enrollment flow. A printed serial number alone must not grant ownership.
3. Configure networking over an authenticated local setup channel. BLE is a
   proposed setup path; browser/mobile compatibility and the need for a companion
   app must be demonstrated before promising phone-only onboarding.
4. View connection, vehicle-session and log status in the existing LINK workspace.
   Interrupted uploads resume without duplicate records. Offline capture must
   clearly show queued data and storage limits.
5. Receive admin-reviewed, signed packages within the platform. During Rev-A,
   installation and recovery remain simulated and labeled accordingly.

Steps 2-4 describe future physical-device integration. The current web workflow
and software simulator do not demonstrate wireless pairing or physical enrollment.

## Architecture boundaries

| Component | Responsibility | Current status |
| --- | --- | --- |
| S32K344-class MCU/HSE | CAN capture, identity, trusted checks, write prohibition | Host scaffold; NXP adapters absent |
| Wireless companion/module | Wi-Fi/BLE transport and provisioning UI | Not selected or implemented |
| USB-C service path | Wired protocol, diagnostics and recovery | Connector/controller implementation unresolved |
| Protected OBD input | Reverse battery/transients, regulation, measured VBAT, sleep | Conceptual requirements; no validated schematic |
| Nonvolatile storage | Firmware/recovery metadata and bounded offline logs | Capacity/endurance layout unvalidated |
| Existing Express/Postgres API | Ownership, sessions, telemetry, releases and audit | Integrated simulation workflows |
| Existing React LINK UI | Customer status and tuner/admin operations | Integrated simulation workflows |

The companion forwards framed messages; it must not own or override the vehicle
write decision. Cloud/package authenticity and device/vehicle/controller binding
must be verified at the trusted endpoint, even if the wireless companion is
compromised. Radio certification, automotive suitability and long-term supply are
separate selection questions. No exact radio part is frozen by this brief.

USB-C describes a connector, not proof of native USB or a recovery implementation.
Choose and validate the required bridge/controller and boot path during schematic
review. A production recovery path must work without Wi-Fi or cloud availability.

## Compact enclosure targets

- One assembled PCB and enclosure; no exposed development boards or loose modules.
- Short replaceable OBD lead, accessible USB-C service port and readable status LED.
- Determine dimensions from component placement, antenna keepout, connector loads,
  protection circuitry and measured heat. No pocket-size dimensions are guaranteed.
- Establish ingress, temperature, ESD, vibration and sleep-current acceptance values
  before design freeze. Claims require test evidence.
- Secure boot, signed updates, unique keys, debug-lock policy and a documented
  manufacturing/service recovery process are release requirements.

## Next milestone: EVT-0 wired bench capture

Hardware ownership remains unconfirmed; no bench results are claimed. No ECU is
needed for the initial isolated receive-only capture milestone.

| Step | Deliverable | Acceptance evidence |
| --- | --- | --- |
| 1. Freeze bench inventory | Exact NXP board/revision, debugger, power source, known CAN-FD traffic generator, harness and tools | Revision-matched manuals and wiring review |
| 2. Reproducible bring-up | Pinned NXP toolchain/RTD and vendor baseline example | Build log, debugger/startup evidence |
| 3. Fail-closed startup | Trusted platform health report gates capture | Host failure tests, followed by board fault injection |
| 4. Capture pipeline | Receive-only driver, bounded queue/drain, timestamps, drop counters, frame validation | Known sequence/payload comparison; overload behavior |
| 5. Wired platform integration | Authenticated host bridge into the existing device API | Expiry/replay/tamper rejection; ownership/session audit; provenance labeling |
| 6. Endurance | Reconnect and reset matrix; declared bus load/duration | 24-hour wired reconnect evidence and no unexplained frame loss |

Before step 4, define frame length/DLC semantics, channel identifiers, timestamp
wrap behavior, concurrent ISR/task access, queue overflow policy and reset behavior.
Before step 5, distinguish raw CAN frames from decoded numeric telemetry accepted
by the current API; do not silently coerce frames into engineering-unit samples.
Do not copy administrator cookies or production device secrets into a bench bridge.

## Startup gate implemented in this milestone

`firmware/src/app.c` requires explicit PASS for clock, power, watchdog, verified
boot, recovery storage, receive-only CAN configuration and wired transport. A
verified identity permits READY; a positively absent identity permits only
UNPROVISIONED. Unknown/failed/invalid evidence latches FAULT. Runtime health loss
also faults. Only startup/reset initialization clears the latch.

The default application supplies no report and therefore cannot reach READY.
The future board adapter must supply fresh measurements/verification each cycle;
these enum values do not implement secure boot, freshness, a watchdog or drivers.
The capture driver must obey the gate. No physical transmission path is added.

## Gates after EVT-0

1. Validate protected power, signed boot, identity provisioning, persistent recovery
   and wired transport on the target hardware.
2. Add Wi-Fi/BLE behind the same trust boundaries and validate interrupted links.
3. Commission schematic/layout/enclosure review and build engineering samples.
4. Complete EVT/DVT/PVT and supported-controller interruption/recovery validation
   before any separately authorized real programming implementation.

No PCB fabrication, purchases, device certification or ECU writes are performed
by this milestone. Procurement should start with the exact bench inventory, not
the conceptual production BOM.
