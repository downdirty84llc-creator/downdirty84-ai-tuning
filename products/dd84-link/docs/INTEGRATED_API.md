# Integrated API (Rev-A)

Base path: `/api/v1/dd84-link`. Existing user cookies and ADMIN_EMAILS govern customer/tuner access. Device clients use short-lived Bearer tokens; device credentials never grant calibration release privileges. All SQL uses parameter binding, ownership filtering, and transactionally serialized session mutations.

| Method and path | Identity | Behavior |
| --- | --- | --- |
| GET / | User/admin | Own devices/sessions/log and calibration metadata; admins see all; latest 100 audit events |
| POST /devices | Admin | `{serial, ownerId, hwRev:"A0", fwVersion:"0.1.0-dev"}`; returns secret once |
| POST /device/challenge | Provisioned serial | `{serial}`; 60-second nonce, one outstanding per device |
| POST /device/authenticate | Device HMAC proof | `{serial,proof,device:{hwRev,fwVersion}}`; consumes challenge, returns 15-minute token and signing public key |
| POST /vehicle/session | Owner/admin/device | `{serial,vin,controllerId}`; device serial is taken from token for device clients |
| POST /logs | Owner/admin/device | `{vehicleSessionId,sequence,samples}`; finite numeric channels, 1–10000 samples, unique sequence per session |
| POST /sessions/:id/backup | Owner/admin/device | Preserve original simulator factory state |
| POST /sessions/:id/calibrations | Admin only | Issue Ed25519 envelope bound to device, VIN hash, controller, revision, hardware/software, expiry, and SIMULATION_ONLY |
| POST /sessions/:id/install | Owner/admin/device | `{packageId,state,envelope?}`; persisted issued package required; optional supplied envelope is verified too |
| POST /sessions/:id/recover | Owner/admin/device | Restore persisted last-known-good simulation state |

Device HMAC input is unchanged from the source MVP: `DD84-LINK/0.1|serial|nonce|issuedAt`, HMAC-SHA256 with the provisioned secret. Proofs are constant-time compared. Invalid or expired attempts consume their challenge. Device secrets are AES-256-GCM encrypted at rest, tokens SHA-256 hashed; signing/encryption keys are externally configured and never persisted in application records.

Install state requires numeric finite `batteryVoltage >= 12.2`, numeric `vehicleSpeedKph === 0`, `engineRunning:false`, `transportStable:true`, `backupCreated:true`, the matching VIN/controller, and `hwRev:"A0"`, `fwVersion:"0.1.0-dev"`. Missing/coerced values fail closed. A saved original backup is also independently required. An invalid attempt returns HTTP 409 with check results and records a blocked event. Signing is performed on sorted-key canonical JSON compatible with the supplied MVP.

VINs are normalized to uppercase and stored only as hashes. Device enrollment and ownership assignment are admin-only. Rev-A does not expose reassignment or deletion endpoints. All simulation state and audit events are persisted in the same transaction. Recovery does not access a vehicle or transport; it updates simulated slots only.
