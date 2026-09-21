# DD84 LINK protocol v0.1

## Trust model
Every physical device is provisioned with a unique identity. Production uses the S32K3 HSE and/or secure element; the simulator uses a per-device secret solely so the vertical slice is runnable without hardware.

The cloud maintains a separate Ed25519 calibration-signing key. A valid package must satisfy all of the following before the device may arm a write:
1. Signature valid.
2. Package protocol supported.
3. Device serial binding matches.
4. VIN hash matches the connected vehicle.
5. Controller identity matches.
6. Package not expired.
7. Backup exists.
8. Vehicle stationary and engine off.
9. Voltage above calibrated threshold.
10. Transport health is good.

## Cloud endpoints implemented in the prototype
- `POST /v1/device/challenge`
- `POST /v1/device/authenticate`
- `POST /v1/vehicle/session`
- `POST /v1/logs`
- `POST /v1/calibrations/mock-release`
- `POST /v1/audit/flash-event`

## Calibration package
The prototype signs a canonical JSON payload containing:
- calibration ID and revision
- device serial
- VIN SHA-256
- controller ID
- creation/expiry timestamps
- calibration blob digest
- write strategy

Production packages should use deterministic CBOR/COSE or an equivalently specified binary envelope, not ad-hoc JSON, once the firmware and mobile SDK are frozen.

## Privacy
Raw VIN is required transiently at the device/customer session boundary but the cloud data model stores a VIN hash by default. If business operations require the raw VIN, keep it in a separately protected customer/vehicle table with a documented retention purpose.
