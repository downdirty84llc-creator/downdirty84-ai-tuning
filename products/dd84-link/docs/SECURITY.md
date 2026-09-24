# DD84 LINK security baseline

## Device
- Secure boot enabled and fused only after recovery flow is proven.
- Debug port locked in production lifecycle state.
- Unique device key/certificate per unit.
- No shared production provisioning secrets.
- Firmware images signed; rollback policy explicit.
- Watchdog enabled during logging and programming.

## Cloud
- Calibration signing key held outside the web application process in production (KMS/HSM preferred).
- Device authentication credentials separated from customer login credentials.
- Calibration release requires tuner authorization and immutable audit record.
- Rate-limit challenge/auth and log ingestion.
- Treat all vehicle-originated values as untrusted input.

## Flash safety
Programming is fail-closed. A failed safety check blocks arming; no UI override is allowed for VIN/controller/signature mismatch. Voltage threshold may vary by platform, but a platform profile must make it stricter, never silently remove it.

## Threats specifically addressed
- Stolen tune package copied to another device.
- Package tampering.
- Wrong-vehicle flash.
- Replay of stale package.
- Interrupted update.
- Unauthorized device impersonation.
- Customer/browser modification of safety fields.

## Not solved by the MVP
- OEM seed/key algorithms.
- Production PKI enrollment.
- Hardware side-channel validation.
- Secure factory provisioning station.
- Penetration test / ISO 21434 work products.
