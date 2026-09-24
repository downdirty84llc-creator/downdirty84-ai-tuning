# DD84 LINK Rev-A integration

DD84 LINK runs inside the existing Express API and React frontend. **All installation and recovery is SIMULATION_ONLY. No physical ECU writes are implemented or authorized.**

The original supplied MVP is preserved under this directory. `cloud/server.mjs` is a loopback-only test fixture for the original simulator tests, not a second production service. Production API workflows are in `backend/src/services/dd84-link/` and `backend/src/routes/dd84-link.routes.ts`. Only `backend/migrations/` is applied by the application; the original `supabase/migrations/` is retained as source material, not run against the app database.

## Run locally

1. Use Node 20+ and a dedicated PostgreSQL database. Run `npm ci` in the repo root and `backend`.
2. Configure the backend's existing `DATABASE_URL`, `ADMIN_EMAILS`, `APP_BASE_URL=http://localhost:5173`, and `FRONTEND_ORIGIN=http://localhost:5173` settings. Use development mode for console magic links. Do not point test scripts at a production database.
3. Generate local LINK keys with `node products/dd84-link/scripts/generate-keys.mjs`. Set the printed `DD84_LINK_SIGNING_PRIVATE_KEY` (PEM with escaped newlines) and `DD84_LINK_DEVICE_KEY` (64 hexadecimal characters) in the backend environment. Store them securely and keep them stable across restarts. Missing or invalid keys fail closed for enrollment/signing. Key rotation currently requires re-enrollment/re-issuance; do not replace deployed keys casually.
4. In `backend`, run `npm run migrate`, `npm run build`, then `npm start` (or `npm run dev`).
5. Set `VITE_API_BASE_URL=http://localhost:8080` for the frontend and run `npm run dev` from the repo root.
6. Sign in using the existing magic-link login and visit `/dd84-link`. A user whose email appears in `ADMIN_EMAILS` sees the tuner/admin controls. Create the customer account by signing in first. The customer's account UUID is returned by authenticated `GET /api/v1/me`.
7. Admin: enroll `DD84-LINK-A0-000001` to that account UUID. Save the one-time device secret securely. Customer: create a session with a 17-character VIN and controller identity, upload a JSON numeric sample array, and save the original **simulation** backup. Admin: review the session/log status, then approve/sign a simulation calibration.
8. Customer: enter the same VIN/controller, voltage and speed; confirm engine off and stable transport. Simulate install. Low voltage, motion, running engine, wrong binding, missing backup, invalid signature, expired package, or incompatible versions block installation. Recover returns to the known-good simulated slot.

Normal customer overview responses contain calibration metadata, not raw tuning files, signatures, or device secrets. The simulator fixture can exercise signed envelopes in isolation with `npm --prefix products/dd84-link test` or `npm --prefix products/dd84-link run demo`.

## Checks

```sh
npm run build
cd backend
npm run typecheck
npm test
npm run build
npm run migrate
npm run test:e2e
npm run test:dd84-link
cd ..
npm --prefix products/dd84-link test
cc -std=c11 -Wall -Wextra -Werror -Iproducts/dd84-link/firmware/include products/dd84-link/firmware/src/flash_guard.c products/dd84-link/firmware/host_flash_guard_test.c -o /tmp/dd84-flash-guard
/tmp/dd84-flash-guard
cc -std=c11 -Wall -Wextra -Werror -Iproducts/dd84-link/firmware/include products/dd84-link/firmware/src/app.c products/dd84-link/firmware/src/flash_guard.c products/dd84-link/firmware/host_startup_test.c -o /tmp/dd84-startup
/tmp/dd84-startup
```

`test:e2e` is the existing destructive pipeline fixture: it truncates its test database. Configure its `E2E_*` variables and run only in a disposable database. `test:dd84-link` uses `DATABASE_URL`, inserts uniquely identified test devices and users, starts an ephemeral HTTP listener using the actual router and session middleware, and leaves test records for inspection. It verifies auth, access boundaries, persistence, logs, signatures, unsafe rejection, A/B simulation, recovery, and audits. CI runs both against a fresh Postgres service.

## Hardware limits

The next milestone follows the [compact product and EVT-0 brief](hardware/COMPACT_PRODUCT_BRIEF.md).
Startup now requires trusted health evidence before READY, keeps unprovisioned
devices unable to capture, and latches failures. The default scaffold has no board
adapters and stays faulted. The host tests validate this state logic only.

The S32K344-class code is a host-tested guard/state-machine scaffold. NXP RTD/HSE adapters, secure boot provisioning, hardware identity storage, CAN/USB drivers, actual signed-firmware boot verification, and bench recovery are not implemented or certified. `dd84_real_write_allowed()` unconditionally returns false. Signature/version flags in the host guard must eventually come from trusted hardware adapters; they are not substitutes for cryptographic verification. Wi-Fi/BLE and physical flashing remain gated by EVT/DVT/PVT validation.
