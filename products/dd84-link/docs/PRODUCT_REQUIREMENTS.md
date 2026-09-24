# DD84 LINK product requirements

## Customer promise
A DD84 customer plugs in one branded interface, connects the DD84 app, records the requested data, receives an approved calibration, and installs it without handling raw tuning files.

## MVP user journeys
1. **Enroll device** — scan/enter serial, claim to account, cryptographic device authentication.
2. **Identify vehicle** — collect VIN/controller/protocol and create a vehicle session.
3. **Pre-tune health check** — battery, DTC summary, required sensor channels, connectivity.
4. **Record log** — guided test with named channels and completion conditions.
5. **Upload** — resumable batches with sequence numbers and timestamps.
6. **Tuner review** — DD84 sees customer, vehicle, modifications, logs and revision history.
7. **Release calibration** — tuner approval creates a signed, device/vehicle-bound package.
8. **Install** — device executes platform-specific preconditions and programming state machine.
9. **Recovery** — preserve factory/last-known-good state and recover after interruption where controller capabilities permit.

## Rev-A acceptance criteria
- 100 consecutive device challenge/auth cycles without a false accept.
- Modified calibration package rejected.
- Package for another serial rejected.
- Package for another controller rejected.
- Low-voltage condition blocks flash.
- Engine-running condition blocks flash.
- Log batches are associated with the correct authenticated device/vehicle session.
- Simulated interrupted flash can return to known-good state.

## Commercial boundary
Rev-A is an internal engineering tool. Retail sale begins only after electrical validation, enclosure/connector validation, firmware recovery validation, privacy/security review, and platform-specific programming validation.
